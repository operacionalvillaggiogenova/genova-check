import {
  HttpError, assertSameOrigin, cleanText, isoNow, json, newId, readJson
} from './http.js';
import { canSeeAllTeams, requireUser } from './access.js';
import { sha256 } from './security.js';

function canManageRecurrences(user) {
  return user.permissions.has('recurrences.manage') || user.team_code === 'MANUTENCAO';
}

function assertManage(user) {
  if (!canManageRecurrences(user)) {
    throw new HttpError(403, 'Você não possui permissão para administrar recorrências.');
  }
}

function normalizeKind(value) {
  const kind = cleanText(value, 20).toUpperCase();
  if (!['DAILY','WEEKLY','MONTHLY'].includes(kind)) {
    throw new HttpError(400, 'Periodicidade inválida.');
  }
  return kind;
}

function nextRun(currentIso, kind, interval = 1) {
  const current = new Date(currentIso);
  const step = Math.max(1, Math.min(365, Number(interval) || 1));
  if (kind === 'DAILY') current.setUTCDate(current.getUTCDate() + step);
  if (kind === 'WEEKLY') current.setUTCDate(current.getUTCDate() + step * 7);
  if (kind === 'MONTHLY') {
    const day = current.getUTCDate();
    current.setUTCDate(1);
    current.setUTCMonth(current.getUTCMonth() + step);
    const lastDay = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)).getUTCDate();
    current.setUTCDate(Math.min(day, lastDay));
  }
  return current.toISOString();
}

export async function listRecurrences(request, env) {
  const user = await requireUser(request, env);
  if (!user.permissions.has('recurrences.view') && !canManageRecurrences(user)) {
    throw new HttpError(403, 'Você não possui acesso às recorrências.');
  }
  const clauses = ['1=1'];
  const values = [];
  if (!canSeeAllTeams(user)) {
    clauses.push('rt.team_id=?'); values.push(user.team_id);
  }
  const rows = await env.DB.prepare(`
    SELECT rt.*,t.code AS team_code,t.name AS team_name,u.name AS assigned_name,
      m.name AS tool_name
    FROM recurrence_templates rt
    JOIN teams t ON t.id=rt.team_id
    LEFT JOIN users u ON u.id=rt.assigned_to
    LEFT JOIN module_catalog m ON m.code=rt.tool_code
    WHERE ${clauses.join(' AND ')}
    ORDER BY rt.active DESC,rt.next_run_at,rt.title
  `).bind(...values).all();
  return json(rows.results || []);
}

export async function recurrenceOptions(request, env) {
  const user = await requireUser(request, env);
  assertManage(user);
  const teams = canSeeAllTeams(user)
    ? await env.DB.prepare('SELECT id,code,name FROM teams WHERE active=1 ORDER BY name').all()
    : await env.DB.prepare('SELECT id,code,name FROM teams WHERE id=? AND active=1').bind(user.team_id).all();
  const ids = (teams.results || []).map(team => team.id);
  let users = { results: [] };
  if (ids.length) {
    const marks = ids.map(() => '?').join(',');
    users = await env.DB.prepare(`SELECT id,name,team_id FROM users WHERE active=1 AND team_id IN (${marks}) ORDER BY name`)
      .bind(...ids).all();
  }
  const tools = await env.DB.prepare(`SELECT code,name FROM module_catalog WHERE active=1 AND module_group='FIELD' ORDER BY sort_order`).all();
  return json({ teams: teams.results || [], users: users.results || [], tools: tools.results || [] });
}

export async function createRecurrence(request, env) {
  assertSameOrigin(request);
  const user = await requireUser(request, env);
  assertManage(user);
  const body = await readJson(request);
  const team = await env.DB.prepare('SELECT id,code FROM teams WHERE code=? AND active=1')
    .bind(cleanText(body.teamCode, 40).toUpperCase()).first();
  if (!team) throw new HttpError(400, 'Equipe inválida.');
  if (!canSeeAllTeams(user) && team.id !== user.team_id) {
    throw new HttpError(403, 'Você não pode criar recorrência para outra equipe.');
  }
  let assignee = null;
  if (body.assignedTo) {
    assignee = await env.DB.prepare('SELECT id FROM users WHERE id=? AND team_id=? AND active=1')
      .bind(cleanText(body.assignedTo, 80), team.id).first();
    if (!assignee) throw new HttpError(400, 'Responsável inválido para a equipe.');
  }
  const firstRun = new Date(body.firstRunAt);
  if (Number.isNaN(firstRun.getTime())) throw new HttpError(400, 'Informe a primeira execução.');
  const kind = normalizeKind(body.scheduleKind);
  const interval = Math.max(1, Math.min(365, Number(body.scheduleInterval) || 1));
  const priority = cleanText(body.priority || 'NORMAL', 20).toUpperCase();
  if (!['LOW','NORMAL','HIGH','URGENT'].includes(priority)) throw new HttpError(400, 'Prioridade inválida.');
  const toolCode = cleanText(body.toolCode, 60) || null;
  if (toolCode) {
    const module = await env.DB.prepare('SELECT code FROM module_catalog WHERE code=? AND active=1')
      .bind(toolCode).first();
    if (!module) throw new HttpError(400, 'Ferramenta inválida.');
  }
  const recurrenceId = newId();
  const at = isoNow();
  await env.DB.prepare(`
    INSERT INTO recurrence_templates(
      id,title,description,team_id,assigned_to,priority,location,tool_code,
      requires_evidence,requires_note,schedule_kind,schedule_interval,timezone,
      next_run_at,active,created_by,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    recurrenceId, cleanText(body.title, 180, true), cleanText(body.description, 4000),
    team.id, assignee?.id || null, priority, cleanText(body.location, 250), toolCode,
    body.requiresEvidence ? 1 : 0, body.requiresNote ? 1 : 0, kind, interval,
    'America/Sao_Paulo', firstRun.toISOString(), 1, user.id, at, at
  ).run();
  return json({ ok: true, id: recurrenceId }, 201);
}

export async function setRecurrenceStatus(request, env, recurrenceId) {
  assertSameOrigin(request);
  const user = await requireUser(request, env);
  assertManage(user);
  const recurrence = await env.DB.prepare('SELECT id,team_id FROM recurrence_templates WHERE id=?')
    .bind(recurrenceId).first();
  if (!recurrence) throw new HttpError(404, 'Recorrência não encontrada.');
  if (!canSeeAllTeams(user) && recurrence.team_id !== user.team_id) {
    throw new HttpError(403, 'Recorrência fora do seu escopo.');
  }
  const body = await readJson(request);
  await env.DB.prepare('UPDATE recurrence_templates SET active=?,updated_at=? WHERE id=?')
    .bind(body.active ? 1 : 0, isoNow(), recurrenceId).run();
  return json({ ok: true });
}

export async function generateDueRecurrences(env, referenceDate = new Date()) {
  const referenceIso = referenceDate.toISOString();
  const rows = await env.DB.prepare(`
    SELECT * FROM recurrence_templates
    WHERE active=1 AND next_run_at<=?
    ORDER BY next_run_at LIMIT 100
  `).bind(referenceIso).all();
  let generated = 0;
  for (const template of rows.results || []) {
    let scheduledFor = template.next_run_at;
    let iterations = 0;
    while (scheduledFor <= referenceIso && iterations < 32) {
      const occurrenceKey = `${template.id}:${scheduledFor}`;
      const digest = await sha256(occurrenceKey);
      const activityId = `act-${digest.slice(0, 32)}`;
      const occurrenceId = `occ-${digest.slice(0, 32)}`;
      const eventId = `evt-${digest.slice(0, 32)}`;
      const at = isoNow();
      const existing = await env.DB.prepare('SELECT id FROM activity_occurrences WHERE occurrence_key=?')
        .bind(occurrenceKey).first();
      if (!existing) {
        await env.DB.batch([
          env.DB.prepare(`
            INSERT OR IGNORE INTO activities(
              id,title,description,team_id,assigned_to,priority,location,due_at,status,
              source,source_id,tool_code,requires_evidence,requires_note,created_by,created_at,updated_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          `).bind(
            activityId, template.title, template.description || '', template.team_id,
            template.assigned_to || null, template.priority, template.location || '', scheduledFor,
            'PENDING','RECURRENCE',template.id,template.tool_code || null,
            template.requires_evidence,template.requires_note,template.created_by,at,at
          ),
          env.DB.prepare(`
            INSERT OR IGNORE INTO activity_occurrences(id,template_id,occurrence_key,activity_id,scheduled_for,created_at)
            VALUES(?,?,?,?,?,?)
          `).bind(occurrenceId,template.id,occurrenceKey,activityId,scheduledFor,at),
          env.DB.prepare(`
            INSERT OR IGNORE INTO activity_events(id,activity_id,action,actor_user_id,details_json,occurred_at,received_at)
            VALUES(?,?,?,?,?,?,?)
          `).bind(eventId,activityId,'CREATED',template.created_by,
            JSON.stringify({ source: 'RECURRENCE', templateId: template.id }),scheduledFor,at)
        ]);
        generated++;
      }
      scheduledFor = nextRun(scheduledFor, template.schedule_kind, template.schedule_interval);
      iterations++;
    }
    await env.DB.prepare('UPDATE recurrence_templates SET next_run_at=?,updated_at=? WHERE id=?')
      .bind(scheduledFor, isoNow(), template.id).run();
  }
  return { generated };
}
