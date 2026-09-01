import { HttpError, assertSameOrigin, cleanText, isoNow, json, newId } from './http.js';
import { requireModule, requireUser } from './access.js';
import { recordActivityToolResult, validateActivityToolLink } from './activities-api.js';

const TYPES = new Set(['tags', 'mudancas', 'ressarcimentos']);
const STATUSES = new Set(['RECEIVED', 'IN_REVIEW', 'PROCESSED', 'CANCELLED']);

function parsePayload(value) {
  let payload;
  try { payload = JSON.parse(String(value || '{}')); }
  catch { throw new HttpError(400, 'Dados do rateio inválidos.'); }
  if (!payload || typeof payload !== 'object') throw new HttpError(400, 'Dados do rateio inválidos.');
  return payload;
}

function safeName(value = 'documento.jpg') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 100);
}

export async function createRateioSubmission(request, env) {
  assertSameOrigin(request);
  const user = await requireUser(request, env, 'tools.view');
  requireModule(user, 'rateio');
  const form = await request.formData();
  const payload = parsePayload(form.get('payload'));
  const sourceId = cleanText(payload.id, 120, true);
  const type = cleanText(payload.type, 30).toLowerCase();
  if (!TYPES.has(type)) throw new HttpError(400, 'Tipo de rateio inválido.');
  const title = cleanText(payload.title, 180, true);
  const reportDate = cleanText(payload.reportDate, 20, true);
  const activityId = cleanText(payload.activityId, 80) || null;
  await validateActivityToolLink(env, user, { activityId, toolCode: 'rateio' });
  const at = isoNow();
  const existing = await env.DB.prepare(`
    SELECT id FROM rateio_submissions WHERE source_local_id=? AND submitted_by=?
  `).bind(sourceId, user.id).first();
  const submissionId = existing?.id || newId();
  const storedPayload = { ...payload, scans: (payload.scans || []).map(scan => ({ name: scan.name, mode: scan.mode })) };
  if (existing) {
    await env.DB.prepare(`
      UPDATE rateio_submissions SET submission_type=?,title=?,report_date=?,payload_json=?,
        activity_id=COALESCE(?,activity_id),updated_at=? WHERE id=?
    `).bind(type, title, reportDate, JSON.stringify(storedPayload), activityId, at, submissionId).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO rateio_submissions(
        id,source_local_id,submission_type,title,report_date,payload_json,status,
        activity_id,submitted_by,created_at,updated_at
      ) VALUES(?,?,?,?,?,?, 'RECEIVED',?,?,?,?)
    `).bind(
      submissionId, sourceId, type, title, reportDate, JSON.stringify(storedPayload),
      activityId, user.id, at, at
    ).run();
  }
  const files = form.getAll('evidence');
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    if (!(file instanceof File) || !file.size) continue;
    if (file.size > 8 * 1024 * 1024) throw new HttpError(413, 'Cada documento deve possuir no máximo 8 MB.');
    if (!String(file.type || '').startsWith('image/') && file.type !== 'application/pdf') {
      throw new HttpError(415, 'Envie imagens ou arquivos PDF.');
    }
    const key = `rateio/${submissionId}/${String(index).padStart(3, '0')}-${safeName(file.name)}`;
    await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
    const evidence = await env.DB.prepare('SELECT id FROM rateio_submission_evidence WHERE r2_key=?')
      .bind(key).first();
    if (!evidence) {
      await env.DB.prepare(`
        INSERT INTO rateio_submission_evidence(id,submission_id,r2_key,filename,content_type,size,created_at)
        VALUES(?,?,?,?,?,?,?)
      `).bind(newId(), submissionId, key, file.name || 'documento', file.type || '', file.size, at).run();
    }
  }
  const activity = await recordActivityToolResult(env, user, {
    activityId, toolCode: 'rateio', recordType: 'rateio_submission', recordId: submissionId
  });
  return json({ ok: true, id: submissionId, evidence: files.length, activity }, existing ? 200 : 201);
}

export async function listRateioSubmissions(request, env) {
  await requireUser(request, env, 'rateio.view');
  const url = new URL(request.url);
  const clauses = ['1=1'];
  const values = [];
  const type = cleanText(url.searchParams.get('type'), 30).toLowerCase();
  const status = cleanText(url.searchParams.get('status'), 30).toUpperCase();
  const from = cleanText(url.searchParams.get('from'), 20);
  const to = cleanText(url.searchParams.get('to'), 20);
  if (type && TYPES.has(type)) { clauses.push('rs.submission_type=?'); values.push(type); }
  if (status && STATUSES.has(status)) { clauses.push('rs.status=?'); values.push(status); }
  if (from) { clauses.push('date(rs.report_date)>=date(?)'); values.push(from); }
  if (to) { clauses.push('date(rs.report_date)<=date(?)'); values.push(to); }
  const rows = await env.DB.prepare(`
    SELECT rs.*,u.name AS submitted_by_name,t.name AS team_name,
      COUNT(e.id) AS evidence_count
    FROM rateio_submissions rs
    LEFT JOIN users u ON u.id=rs.submitted_by
    LEFT JOIN teams t ON t.id=u.team_id
    LEFT JOIN rateio_submission_evidence e ON e.submission_id=rs.id
    WHERE ${clauses.join(' AND ')}
    GROUP BY rs.id ORDER BY rs.report_date DESC,rs.updated_at DESC LIMIT 300
  `).bind(...values).all();
  return json((rows.results || []).map(row => {
    let payload = {};
    try { payload = JSON.parse(row.payload_json || '{}'); } catch {}
    delete row.payload_json;
    return { ...row, payload };
  }));
}

export async function getRateioSubmission(request, env, submissionId) {
  await requireUser(request, env, 'rateio.view');
  const row = await env.DB.prepare(`
    SELECT rs.*,u.name AS submitted_by_name,t.name AS team_name
    FROM rateio_submissions rs
    LEFT JOIN users u ON u.id=rs.submitted_by
    LEFT JOIN teams t ON t.id=u.team_id WHERE rs.id=?
  `).bind(submissionId).first();
  if (!row) throw new HttpError(404, 'Envio de rateio não encontrado.');
  const evidence = await env.DB.prepare(`
    SELECT id,r2_key,filename,content_type,size,created_at
    FROM rateio_submission_evidence WHERE submission_id=? ORDER BY created_at
  `).bind(submissionId).all();
  let payload = {};
  try { payload = JSON.parse(row.payload_json || '{}'); } catch {}
  delete row.payload_json;
  return json({ ...row, payload, evidence: evidence.results || [] });
}

export async function updateRateioSubmission(request, env, submissionId) {
  assertSameOrigin(request);
  await requireUser(request, env, 'rateio.manage');
  const body = await request.json().catch(() => ({}));
  const status = cleanText(body.status, 30).toUpperCase();
  if (!STATUSES.has(status)) throw new HttpError(400, 'Status inválido.');
  const result = await env.DB.prepare('UPDATE rateio_submissions SET status=?,updated_at=? WHERE id=?')
    .bind(status, isoNow(), submissionId).run();
  if (!result.meta?.changes) throw new HttpError(404, 'Envio de rateio não encontrado.');
  return json({ ok: true, status });
}
