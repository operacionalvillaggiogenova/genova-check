import {
  HttpError, assertSameOrigin, cleanText, isoNow, json, newId, readJson
} from './http.js';
import { canSeeAllTeams, requireUser } from './access.js';
import { sha256 } from './security.js';

const protocol = () => {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
  return `BLEXO-${date}-${suffix}`;
};

function safeFilename(name) {
  return String(name || 'foto.jpg').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 100);
}

export async function publicRequestOptions(env) {
  const rows = await env.DB.prepare(`
    SELECT category_code,category_name FROM routing_rules
    WHERE active=1 ORDER BY category_name
  `).all();
  return json({ categories: rows.results || [] });
}

export async function createPublicRequest(request, env) {
  assertSameOrigin(request);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 10 * 1024 * 1024) throw new HttpError(413, 'Chamado acima do limite permitido.');
  const form = await request.formData();
  const category = cleanText(form.get('category'), 60, true).toUpperCase();
  const rule = await env.DB.prepare(`
    SELECT rr.*,t.code AS team_code FROM routing_rules rr
    JOIN teams t ON t.id=rr.team_id
    WHERE rr.category_code=? AND rr.active=1
  `).bind(category).first();
  if (!rule) throw new HttpError(400, 'Categoria de chamado inválida.');
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const ipHash = await sha256(ip);
  const since = new Date(Date.now() - 60 * 60000).toISOString();
  const recent = await env.DB.prepare(`
    SELECT COUNT(*) AS total FROM service_requests WHERE ip_hash=? AND created_at>=?
  `).bind(ipHash, since).first();
  if (Number(recent?.total || 0) >= 10) {
    throw new HttpError(429, 'Limite de chamados atingido. Tente novamente mais tarde.');
  }
  const requestId = newId();
  const requestProtocol = protocol();
  let photoKey = null;
  const photo = form.get('photo');
  if (photo instanceof File && photo.size) {
    if (photo.size > 8 * 1024 * 1024) throw new HttpError(413, 'A foto deve possuir no máximo 8 MB.');
    if (!(photo.type || '').toLowerCase().startsWith('image/')) {
      throw new HttpError(415, 'O anexo do chamado deve ser uma imagem.');
    }
    photoKey = `requests/${requestId}/${safeFilename(photo.name)}`;
    await env.BUCKET.put(photoKey, photo.stream(), {
      httpMetadata: { contentType: photo.type || 'image/jpeg' }
    });
  }
  const at = isoNow();
  const activityId = rule.auto_create_activity ? newId() : null;
  const status = activityId ? 'CONVERTED' : 'RECEIVED';
  const location = cleanText(form.get('location'), 250, true);
  const description = cleanText(form.get('description'), 4000, true);
  const requestStatement = env.DB.prepare(`
    INSERT INTO service_requests(
      id,protocol,category_code,team_id,location,description,contact_name,contact_value,
      status,activity_id,photo_key,ip_hash,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    requestId,requestProtocol,category,rule.team_id,location,description,
    cleanText(form.get('contactName'),120),cleanText(form.get('contactValue'),180),
    status,activityId,photoKey,ipHash,at,at
  );
  const statements = [];
  if (activityId) {
    statements.push(env.DB.prepare(`
      INSERT INTO activities(
        id,title,description,team_id,priority,location,status,source,source_id,
        requires_evidence,requires_note,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      activityId,`${rule.category_name}: ${location}`,description,rule.team_id,
      'NORMAL',location,'PENDING','REQUEST',requestId,0,1,at,at
    ));
    statements.push(env.DB.prepare(`
      INSERT INTO activity_events(id,activity_id,action,details_json,occurred_at,received_at)
      VALUES(?,?,?,?,?,?)
    `).bind(newId(),activityId,'CREATED',JSON.stringify({ source:'REQUEST',requestId,protocol:requestProtocol }),at,at));
  }
  // O chamado referencia a atividade; por isso a atividade deve existir antes
  // da validação imediata da chave estrangeira no D1.
  statements.push(requestStatement);
  await env.DB.batch(statements);
  return json({ ok: true, protocol: requestProtocol, status }, 201);
}

export async function listRequests(request, env) {
  const user = await requireUser(request, env, 'requests.view');
  const clauses = ['1=1'];
  const values = [];
  if (!canSeeAllTeams(user)) {
    clauses.push('sr.team_id=?'); values.push(user.team_id);
  }
  const url = new URL(request.url);
  const status = cleanText(url.searchParams.get('status'), 30).toUpperCase();
  if (status) { clauses.push('sr.status=?'); values.push(status); }
  const rows = await env.DB.prepare(`
    SELECT sr.id,sr.protocol,sr.category_code,sr.location,sr.description,sr.contact_name,
      sr.contact_value,sr.status,sr.activity_id,sr.photo_key IS NOT NULL AS has_photo,
      sr.created_at,sr.updated_at,t.code AS team_code,t.name AS team_name
    FROM service_requests sr JOIN teams t ON t.id=sr.team_id
    WHERE ${clauses.join(' AND ')} ORDER BY sr.created_at DESC LIMIT 100
  `).bind(...values).all();
  return json(rows.results || []);
}

export async function convertRequest(request, env, requestId) {
  assertSameOrigin(request);
  const user = await requireUser(request, env, 'requests.manage');
  const item = await env.DB.prepare(`
    SELECT sr.*,rr.category_name FROM service_requests sr
    LEFT JOIN routing_rules rr ON rr.category_code=sr.category_code WHERE sr.id=?
  `).bind(requestId).first();
  if (!item) throw new HttpError(404, 'Chamado não encontrado.');
  if (!canSeeAllTeams(user) && item.team_id !== user.team_id) {
    throw new HttpError(403, 'Chamado fora do seu escopo.');
  }
  if (item.activity_id) return json({ ok: true, activityId: item.activity_id, duplicate: true });
  const body = await readJson(request).catch(() => ({}));
  const activityId = newId();
  const at = isoNow();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO activities(
        id,title,description,team_id,assigned_to,priority,location,due_at,status,
        source,source_id,requires_evidence,requires_note,created_by,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      activityId,cleanText(body.title || `${item.category_name || item.category_code}: ${item.location}`,180,true),
      item.description,item.team_id,cleanText(body.assignedTo,80)||null,
      cleanText(body.priority || 'NORMAL',20).toUpperCase(),item.location,
      body.dueAt ? new Date(body.dueAt).toISOString() : null,'PENDING','REQUEST',item.id,
      body.requiresEvidence?1:0,body.requiresNote===false?0:1,user.id,at,at
    ),
    env.DB.prepare(`UPDATE service_requests SET status='CONVERTED',activity_id=?,updated_at=? WHERE id=?`)
      .bind(activityId,at,item.id),
    env.DB.prepare(`
      INSERT INTO activity_events(id,activity_id,action,actor_user_id,details_json,occurred_at,received_at)
      VALUES(?,?,?,?,?,?,?)
    `).bind(newId(),activityId,'CREATED',user.id,JSON.stringify({source:'REQUEST',requestId:item.id}),at,at)
  ]);
  return json({ ok: true, activityId }, 201);
}

export async function downloadRequestPhoto(request, env, requestId) {
  const user = await requireUser(request, env, 'requests.view');
  const item = await env.DB.prepare('SELECT team_id,photo_key FROM service_requests WHERE id=?')
    .bind(requestId).first();
  if (!item || !item.photo_key) throw new HttpError(404, 'Foto do chamado não encontrada.');
  if (!canSeeAllTeams(user) && item.team_id !== user.team_id) {
    throw new HttpError(403, 'Chamado fora do seu escopo.');
  }
  const object = await env.BUCKET.get(item.photo_key);
  if (!object) throw new HttpError(404, 'Arquivo não encontrado.');
  const headers = new Headers(); object.writeHttpMetadata(headers);
  headers.set('cache-control','private, max-age=300');
  headers.set('x-content-type-options','nosniff');
  return new Response(object.body,{headers});
}
