import {
  HttpError, assertSameOrigin, cleanText, isoNow, json, newId, readJson
} from './http.js';
import { canSeeAllTeams, publicUser, requireUser } from './access.js';
import { sha256 } from './security.js';

const SELECT_ACTIVITY = `
  SELECT a.*,t.code AS team_code,t.name AS team_name,
    assignee.name AS assigned_name,creator.name AS created_by_name,
    CASE WHEN a.due_at IS NOT NULL AND a.due_at < ?
      AND a.status NOT IN ('COMPLETED','CANCELLED') THEN 1 ELSE 0 END AS overdue
  FROM activities a
  JOIN teams t ON t.id=a.team_id
  LEFT JOIN users assignee ON assignee.id=a.assigned_to
  LEFT JOIN users creator ON creator.id=a.created_by
`;

const normalizePriority = value => {
  const code = cleanText(value || 'NORMAL', 20).toUpperCase();
  if (!['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(code)) {
    throw new HttpError(400, 'Prioridade inválida.');
  }
  return code;
};

function canAccessActivity(user, activity) {
  if (canSeeAllTeams(user)) return true;
  if (user.role_code === 'SUPERVISOR') return activity.team_id === user.team_id;
  return activity.team_id === user.team_id &&
    (!activity.assigned_to || activity.assigned_to === user.id);
}

async function activityForUser(env, user, activityId) {
  const row = await env.DB.prepare(`${SELECT_ACTIVITY} WHERE a.id=?`)
    .bind(isoNow(), activityId).first();
  if (!row) throw new HttpError(404, 'Atividade não encontrada.');
  if (!canAccessActivity(user, row)) throw new HttpError(403, 'Atividade fora do seu escopo.');
  return row;
}

async function recordEvent(env, {
  id = newId(), activityId, action, actorId, note = null, details = null, occurredAt = isoNow()
}) {
  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO activity_events
      (id,activity_id,action,actor_user_id,note,details_json,occurred_at,received_at)
    VALUES(?,?,?,?,?,?,?,?)
  `).bind(
    id, activityId, action, actorId || null, note,
    details ? JSON.stringify(details) : null, occurredAt, isoNow()
  ).run();
  return !!result.meta?.changes;
}

export async function validateActivityToolLink(env, user, { activityId, toolCode }) {
  const linkedId = cleanText(activityId, 80);
  if (!linkedId) return null;
  const activity = await activityForUser(env, user, linkedId);
  if (activity.tool_code && activity.tool_code !== toolCode) {
    throw new HttpError(400, 'A ferramenta utilizada não corresponde à atividade vinculada.');
  }
  return activity;
}

export async function recordActivityToolResult(env, user, {
  activityId, toolCode, recordType, recordId
}) {
  const activity = await validateActivityToolLink(env, user, { activityId, toolCode });
  if (!activity) return { linked: false };
  const linkedId = activity.id;
  const occurredAt = isoNow();
  const eventId = `tool:${toolCode}:${cleanText(recordId, 120, true)}`;
  const inserted = await recordEvent(env, {
    id: eventId,
    activityId: linkedId,
    action: 'TOOL_RESULT_SYNCED',
    actorId: user.id,
    details: { toolCode, recordType, recordId },
    occurredAt
  });
  if (inserted && activity.status === 'PENDING') {
    await env.DB.prepare(`
      UPDATE activities SET status='IN_PROGRESS',assigned_to=COALESCE(assigned_to,?),
        started_at=COALESCE(started_at,?),started_by=COALESCE(started_by,?),
        updated_at=?,version=version+1 WHERE id=?
    `).bind(user.id, occurredAt, user.id, occurredAt, linkedId).run();
  }
  return { linked: true, activityId: linkedId, duplicate: !inserted };
}

async function resolveTeam(env, teamCode, fallbackId = null) {
  if (!teamCode && fallbackId) return { id: fallbackId };
  const team = await env.DB.prepare('SELECT id,code,name FROM teams WHERE code=? AND active=1')
    .bind(cleanText(teamCode, 40).toUpperCase()).first();
  if (!team) throw new HttpError(400, 'Equipe inválida.');
  return team;
}

async function resolveAssignee(env, assignedTo, teamId) {
  if (!assignedTo) return null;
  const user = await env.DB.prepare('SELECT id,team_id,active FROM users WHERE id=?')
    .bind(cleanText(assignedTo, 80)).first();
  if (!user || !user.active) throw new HttpError(400, 'Responsável inválido ou inativo.');
  if (user.team_id !== teamId) throw new HttpError(400, 'O responsável não pertence à equipe selecionada.');
  return user.id;
}

function listScope(user, clauses, values) {
  if (canSeeAllTeams(user)) return;
  if (user.role_code === 'SUPERVISOR') {
    clauses.push('a.team_id=?');
    values.push(user.team_id);
    return;
  }
  clauses.push('a.team_id=?');
  clauses.push('(a.assigned_to IS NULL OR a.assigned_to=?)');
  values.push(user.team_id, user.id);
}

async function listActivitiesForUser(request, env, user, options = {}) {
  const url = new URL(request.url);
  const clauses = ['1=1'];
  const values = [];
  listScope(user, clauses, values);
  const status = cleanText(url.searchParams.get('status'), 30).toUpperCase();
  const teamCode = cleanText(url.searchParams.get('team'), 40).toUpperCase();
  const assignee = cleanText(url.searchParams.get('assignee'), 80);
  const date = cleanText(url.searchParams.get('date'), 20);
  if (status && ['PENDING','IN_PROGRESS','COMPLETED','CANCELLED'].includes(status)) {
    clauses.push('a.status=?'); values.push(status);
  }
  if (teamCode && canSeeAllTeams(user)) {
    clauses.push('t.code=?'); values.push(teamCode);
  }
  if (assignee) { clauses.push('a.assigned_to=?'); values.push(assignee); }
  if (url.searchParams.get('overdue') === '1') {
    clauses.push("a.due_at<? AND a.status NOT IN ('COMPLETED','CANCELLED')");
    values.push(isoNow());
  }
  if (date) {
    clauses.push('date(a.due_at)=date(?)'); values.push(date);
  }
  const limit = Math.min(100, Math.max(1, Number(options.limit || url.searchParams.get('limit') || 50)));
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
  const rows = await env.DB.prepare(`${SELECT_ACTIVITY}
    WHERE ${clauses.join(' AND ')}
    ORDER BY overdue DESC,
      CASE a.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,
      COALESCE(a.due_at,'9999-12-31'),a.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(isoNow(), ...values, limit, offset).all();
  return { items: rows.results || [], limit, offset };
}

export async function listActivities(request, env) {
  const user = await requireUser(request, env, 'activities.view');
  return json(await listActivitiesForUser(request, env, user));
}

async function dashboardForUser(env, user) {
  const clauses = ['1=1'];
  const values = [];
  listScope(user, clauses, values);
  const today = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare(`
    SELECT
      SUM(CASE WHEN date(a.due_at)=date(?) AND a.status NOT IN ('COMPLETED','CANCELLED') THEN 1 ELSE 0 END) AS today_total,
      SUM(CASE WHEN a.due_at<? AND a.status NOT IN ('COMPLETED','CANCELLED') THEN 1 ELSE 0 END) AS overdue,
      SUM(CASE WHEN a.status='PENDING' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN a.status='IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN date(a.completed_at)=date(?) THEN 1 ELSE 0 END) AS completed_today
    FROM activities a WHERE ${clauses.join(' AND ')}
  `).bind(today, isoNow(), today, ...values).first();
  return {
    today: Number(row?.today_total || 0),
    overdue: Number(row?.overdue || 0),
    pending: Number(row?.pending || 0),
    inProgress: Number(row?.in_progress || 0),
    completedToday: Number(row?.completed_today || 0)
  };
}

export async function activityDashboard(request, env) {
  const user = await requireUser(request, env, 'activities.view');
  return json(await dashboardForUser(env, user));
}

// Resposta especializada da home: uma autenticação e duas consultas funcionais.
export async function homeData(request, env) {
  const started = performance.now();
  const user = await requireUser(request, env, 'activities.view');
  const authDuration = performance.now() - started;
  const d1Started = performance.now();
  const [metrics, activityPage] = await Promise.all([
    dashboardForUser(env, user),
    listActivitiesForUser(request, env, user, { limit: 12 })
  ]);
  const d1Duration = performance.now() - d1Started;
  return json({ user: publicUser(user), metrics, activities: activityPage.items }, 200, {
    'server-timing': `auth;dur=${authDuration.toFixed(1)}, d1;dur=${d1Duration.toFixed(1)}, total;dur=${(performance.now() - started).toFixed(1)}`
  });
}

export async function activityDiary(request, env) {
  const user = await requireUser(request, env, 'activities.view');
  const url = new URL(request.url);
  const date = cleanText(url.searchParams.get('date'), 20) || new Date().toISOString().slice(0, 10);
  const clauses = [`(
    date(a.due_at)=date(?) OR date(a.started_at)=date(?) OR date(a.completed_at)=date(?) OR
    EXISTS(SELECT 1 FROM activity_events de WHERE de.activity_id=a.id AND date(de.occurred_at)=date(?))
  )`];
  const values = [date, date, date, date];
  listScope(user, clauses, values);
  if (user.role_code === 'OPERATIONAL') {
    clauses.push(`(a.assigned_to=? OR EXISTS(
      SELECT 1 FROM activity_events ue WHERE ue.activity_id=a.id AND ue.actor_user_id=?
    ))`);
    values.push(user.id, user.id);
  }
  const teamCode = cleanText(url.searchParams.get('team'), 40).toUpperCase();
  if (teamCode && canSeeAllTeams(user)) {
    clauses.push('t.code=?');
    values.push(teamCode);
  }
  const rows = await env.DB.prepare(`${SELECT_ACTIVITY}
    WHERE ${clauses.join(' AND ')}
    ORDER BY COALESCE(a.completed_at,a.started_at,a.due_at,a.created_at) DESC
    LIMIT 200
  `).bind(isoNow(), ...values).all();
  return json({ date, items: rows.results || [] });
}

export async function activityOptions(request, env) {
  const user = await requireUser(request, env, 'activities.create');
  const teamWhere = canSeeAllTeams(user) ? 'active=1' : 'active=1 AND id=?';
  const teamQuery = env.DB.prepare(`SELECT id,code,name FROM teams WHERE ${teamWhere} ORDER BY name`);
  const teams = canSeeAllTeams(user) ? await teamQuery.all() : await teamQuery.bind(user.team_id).all();
  const teamIds = (teams.results || []).map(team => team.id);
  let users = { results: [] };
  if (teamIds.length) {
    const placeholders = teamIds.map(() => '?').join(',');
    users = await env.DB.prepare(`
      SELECT id,name,team_id FROM users WHERE active=1 AND team_id IN (${placeholders}) ORDER BY name
    `).bind(...teamIds).all();
  }
  const modules = await env.DB.prepare(`
    SELECT code,name FROM module_catalog WHERE active=1 AND module_group='FIELD' ORDER BY sort_order
  `).all();
  return json({ teams: teams.results || [], users: users.results || [], tools: modules.results || [] });
}

export async function getActivity(request, env, activityId) {
  const user = await requireUser(request, env, 'activities.view');
  const activity = await activityForUser(env, user, activityId);
  const [events, evidence] = await Promise.all([
    env.DB.prepare(`
      SELECT e.*,u.name AS actor_name FROM activity_events e
      LEFT JOIN users u ON u.id=e.actor_user_id
      WHERE e.activity_id=? ORDER BY e.occurred_at,e.received_at
    `).bind(activityId).all(),
    env.DB.prepare(`
      SELECT id,evidence_type,filename,content_type,size,description,captured_at,created_at
      FROM activity_evidence WHERE activity_id=? ORDER BY created_at
    `).bind(activityId).all()
  ]);
  return json({ ...activity, events: events.results || [], evidence: evidence.results || [] });
}

export async function createActivity(request, env, options = {}) {
  if (!options.internal) assertSameOrigin(request);
  const user = options.user || await requireUser(request, env, 'activities.create');
  const body = options.body || await readJson(request);
  const team = await resolveTeam(env, body.teamCode, options.teamId || null);
  if (!canSeeAllTeams(user) && user.role_code !== 'ADMIN' && team.id !== user.team_id) {
    throw new HttpError(403, 'Você não pode criar atividades para esta equipe.');
  }
  const assignedTo = await resolveAssignee(env, body.assignedTo, team.id);
  const activityId = options.id || cleanText(body.id, 80) || newId();
  const at = options.createdAt || isoNow();
  const source = options.source || cleanText(body.source || 'MANUAL', 30).toUpperCase();
  if (!['MANUAL','RECURRENCE','REQUEST','DIARY','SYSTEM'].includes(source)) {
    throw new HttpError(400, 'Origem da atividade inválida.');
  }
  const toolCode = cleanText(body.toolCode, 60) || null;
  if (toolCode) {
    const tool = await env.DB.prepare('SELECT code FROM module_catalog WHERE code=? AND active=1')
      .bind(toolCode).first();
    if (!tool) throw new HttpError(400, 'Ferramenta vinculada inválida.');
  }
  try {
    await env.DB.prepare(`
      INSERT INTO activities(
        id,title,description,team_id,assigned_to,priority,location,due_at,status,
        source,source_id,tool_code,requires_evidence,requires_note,created_by,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      activityId, cleanText(body.title, 180, true), cleanText(body.description, 4000),
      team.id, assignedTo, normalizePriority(body.priority), cleanText(body.location, 250),
      body.dueAt ? new Date(body.dueAt).toISOString() : null, 'PENDING', source,
      options.sourceId || cleanText(body.sourceId, 100) || null, toolCode,
      body.requiresEvidence ? 1 : 0, body.requiresNote ? 1 : 0,
      options.createdBy || user.id, at, at
    ).run();
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) {
      const existing = await env.DB.prepare('SELECT id FROM activities WHERE id=?').bind(activityId).first();
      if (existing) return json({ ok: true, id: activityId, duplicate: true }, 200);
    }
    throw error;
  }
  await recordEvent(env, {
    id: options.eventId || newId(), activityId, action: 'CREATED', actorId: options.createdBy || user.id,
    details: { source, teamId: team.id }, occurredAt: at
  });
  return options.returnIdOnly ? activityId : json({ ok: true, id: activityId }, 201);
}

export async function startActivity(request, env, activityId, options = {}) {
  if (!options.internal) assertSameOrigin(request);
  const user = options.user || await requireUser(request, env, 'activities.execute');
  const activity = await activityForUser(env, user, activityId);
  if (!['PENDING','IN_PROGRESS'].includes(activity.status)) {
    throw new HttpError(409, 'Esta atividade não pode ser iniciada no estado atual.');
  }
  if (activity.assigned_to && activity.assigned_to !== user.id && user.role_code === 'OPERATIONAL') {
    throw new HttpError(403, 'Esta atividade está atribuída a outro usuário.');
  }
  const body = options.body || await readJson(request).catch(() => ({}));
  const occurredAt = options.occurredAt || body.occurredAt || isoNow();
  const eventId = options.eventId || request.headers.get('x-blexo-operation-id') || newId();
  const inserted = await recordEvent(env, {
    id: eventId, activityId, action: 'STARTED', actorId: user.id,
    note: cleanText(body.note, 2000), occurredAt
  });
  if (inserted) {
    await env.DB.prepare(`
      UPDATE activities SET status='IN_PROGRESS',assigned_to=COALESCE(assigned_to,?),
        started_at=COALESCE(started_at,?),started_by=COALESCE(started_by,?),
        updated_at=?,version=version+1 WHERE id=?
    `).bind(user.id, occurredAt, user.id, isoNow(), activityId).run();
  }
  return options.internal ? { ok: true, duplicate: !inserted } : json({ ok: true, duplicate: !inserted });
}

export async function completeActivity(request, env, activityId, options = {}) {
  if (!options.internal) assertSameOrigin(request);
  const user = options.user || await requireUser(request, env, 'activities.execute');
  const activity = await activityForUser(env, user, activityId);
  if (activity.status === 'COMPLETED') return options.internal ? { ok: true, duplicate: true } : json({ ok: true, duplicate: true });
  if (activity.status !== 'IN_PROGRESS') throw new HttpError(409, 'Inicie a atividade antes de concluí-la.');
  if (activity.assigned_to && activity.assigned_to !== user.id && user.role_code === 'OPERATIONAL') {
    throw new HttpError(403, 'Esta atividade está atribuída a outro usuário.');
  }
  const body = options.body || await readJson(request).catch(() => ({}));
  const note = cleanText(body.note, 4000);
  if (activity.requires_note && !note) throw new HttpError(400, 'Informe a observação de conclusão.');
  if (activity.requires_evidence) {
    const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM activity_evidence WHERE activity_id=?')
      .bind(activityId).first();
    if (!Number(count?.total || 0)) throw new HttpError(400, 'Adicione a evidência antes de concluir.');
  }
  const occurredAt = options.occurredAt || body.occurredAt || isoNow();
  const eventId = options.eventId || request.headers.get('x-blexo-operation-id') || newId();
  const inserted = await recordEvent(env, {
    id: eventId, activityId, action: 'COMPLETED', actorId: user.id, note, occurredAt
  });
  if (inserted) {
    await env.DB.prepare(`
      UPDATE activities SET status='COMPLETED',completed_at=?,completed_by=?,
        updated_at=?,version=version+1 WHERE id=?
    `).bind(occurredAt, user.id, isoNow(), activityId).run();
    if (activity.source === 'REQUEST' && activity.source_id) {
      await env.DB.prepare(`UPDATE service_requests SET status='COMPLETED',updated_at=? WHERE id=?`)
        .bind(isoNow(), activity.source_id).run();
    }
  }
  return options.internal ? { ok: true, duplicate: !inserted } : json({ ok: true, duplicate: !inserted });
}

export async function cancelActivity(request, env, activityId) {
  assertSameOrigin(request);
  const user = await requireUser(request, env, 'activities.cancel');
  const activity = await activityForUser(env, user, activityId);
  if (['COMPLETED','CANCELLED'].includes(activity.status)) {
    throw new HttpError(409, 'Esta atividade não pode ser cancelada.');
  }
  const body = await readJson(request).catch(() => ({}));
  const note = cleanText(body.note, 2000, true);
  const at = isoNow();
  await env.DB.prepare(`
    UPDATE activities SET status='CANCELLED',cancelled_at=?,cancelled_by=?,updated_at=?,version=version+1
    WHERE id=?
  `).bind(at, user.id, at, activityId).run();
  await recordEvent(env, { activityId, action: 'CANCELLED', actorId: user.id, note, occurredAt: at });
  return json({ ok: true });
}

export async function addActivityEvidence(request, env, activityId) {
  assertSameOrigin(request);
  const user = await requireUser(request, env, 'activities.execute');
  const activity = await activityForUser(env, user, activityId);
  if (['COMPLETED','CANCELLED'].includes(activity.status)) {
    throw new HttpError(409, 'Não é possível adicionar evidência a esta atividade.');
  }
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || !file.size) throw new HttpError(400, 'Selecione uma evidência.');
  if (file.size > 8 * 1024 * 1024) throw new HttpError(413, 'A evidência deve possuir no máximo 8 MB.');
  const type = (file.type || '').toLowerCase();
  if (!type.startsWith('image/') && type !== 'application/pdf') {
    throw new HttpError(415, 'Envie uma imagem ou PDF.');
  }
  const evidenceId = cleanText(form.get('id'), 80) || newId();
  const existing = await env.DB.prepare('SELECT id FROM activity_evidence WHERE id=?').bind(evidenceId).first();
  if (existing) return json({ ok: true, id: evidenceId, duplicate: true });
  const bytes = await file.arrayBuffer();
  const checksum = await sha256(new Uint8Array(bytes));
  const safe = String(file.name || 'evidencia')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 100);
  const key = `activities/${activityId}/evidence/${evidenceId}-${safe}`;
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: type || 'application/octet-stream' } });
  const at = isoNow();
  await env.DB.prepare(`
    INSERT INTO activity_evidence(
      id,activity_id,evidence_type,r2_key,filename,content_type,size,checksum,
      description,captured_at,created_by,created_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    evidenceId, activityId, type === 'application/pdf' ? 'DOCUMENT' : 'PHOTO', key,
    file.name || safe, type, file.size, checksum,
    cleanText(form.get('description'), 1000), cleanText(form.get('capturedAt'), 80) || null,
    user.id, at
  ).run();
  await recordEvent(env, {
    id: cleanText(form.get('eventId'), 80) || newId(), activityId,
    action: 'EVIDENCE_ADDED', actorId: user.id,
    details: { evidenceId, filename: file.name || safe }, occurredAt: at
  });
  return json({ ok: true, id: evidenceId }, 201);
}

export async function downloadActivityEvidence(request, env, evidenceId) {
  const user = await requireUser(request, env, 'activities.view');
  const row = await env.DB.prepare(`
    SELECT e.*,a.team_id,a.assigned_to FROM activity_evidence e
    JOIN activities a ON a.id=e.activity_id WHERE e.id=?
  `).bind(evidenceId).first();
  if (!row) throw new HttpError(404, 'Evidência não encontrada.');
  if (!canAccessActivity(user, row)) throw new HttpError(403, 'Evidência fora do seu escopo.');
  const object = await env.BUCKET.get(row.r2_key);
  if (!object) throw new HttpError(404, 'Arquivo de evidência não encontrado.');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('cache-control', 'private, max-age=300');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(object.body, { headers });
}

export async function syncOperations(request, env) {
  assertSameOrigin(request);
  const user = await requireUser(request, env, 'activities.execute');
  const body = await readJson(request, 256 * 1024);
  if (!Array.isArray(body.operations)) throw new HttpError(400, 'Informe as operações pendentes.');
  const results = [];
  for (const operation of body.operations.slice(0, 50)) {
    const operationId = cleanText(operation.id, 80, true);
    const existing = await env.DB.prepare('SELECT status,error_message FROM sync_operations WHERE id=?')
      .bind(operationId).first();
    if (existing) {
      results.push({ id: operationId, ok: existing.status === 'PROCESSED', duplicate: true, error: existing.error_message });
      continue;
    }
    let ok = false, errorMessage = null;
    try {
      const options = {
        internal: true, user, body: operation.payload || {}, eventId: operationId,
        occurredAt: operation.occurredAt || isoNow()
      };
      if (operation.type === 'START_ACTIVITY') {
        await startActivity(request, env, cleanText(operation.entityId, 80, true), options);
      } else if (operation.type === 'COMPLETE_ACTIVITY') {
        await completeActivity(request, env, cleanText(operation.entityId, 80, true), options);
      } else {
        throw new HttpError(400, 'Tipo de operação offline não suportado.');
      }
      ok = true;
    } catch (error) {
      errorMessage = error instanceof HttpError ? error.message : 'Falha ao processar operação.';
    }
    await env.DB.prepare(`
      INSERT INTO sync_operations(id,user_id,operation_type,entity_id,status,error_message,created_at,processed_at)
      VALUES(?,?,?,?,?,?,?,?)
    `).bind(
      operationId, user.id, cleanText(operation.type, 60), cleanText(operation.entityId, 80),
      ok ? 'PROCESSED' : 'FAILED', errorMessage,
      operation.occurredAt || isoNow(), isoNow()
    ).run();
    results.push({ id: operationId, ok, error: errorMessage });
  }
  return json({ results });
}
