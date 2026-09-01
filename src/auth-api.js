import { HttpError, assertSameOrigin, cleanText, isoNow, json, newId, readJson } from './http.js';
import {
  clearSessionCookie,
  hashPassword,
  normalizeUsername,
  randomToken,
  sessionCookie,
  sha256,
  verifyPassword
} from './security.js';
import { currentUser, publicUser, requireUser } from './access.js';

const SESSION_DAYS = 7;

const expiresAt = () => new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();

async function audit(env, actorId, action, entityType, entityId, details = null) {
  await env.DB.prepare(`
    INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,details_json,created_at)
    VALUES(?,?,?,?,?,?,?)
  `).bind(
    newId(), actorId || null, action, entityType, entityId || null,
    details ? JSON.stringify(details) : null, isoNow()
  ).run();
}

async function sessionFor(request, env, userId) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const ipHash = await sha256(ip);
  const at = isoNow();
  await env.DB.prepare(`
    INSERT INTO sessions(id,token_hash,user_id,created_at,last_seen_at,expires_at,user_agent,ip_hash)
    VALUES(?,?,?,?,?,?,?,?)
  `).bind(
    newId(), tokenHash, userId, at, at, expiresAt(),
    cleanText(request.headers.get('user-agent'), 300), ipHash
  ).run();
  return token;
}

async function attemptKey(request, username) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  return sha256(`${username}|${ip}`);
}

async function checkLoginAllowed(env, key) {
  const row = await env.DB.prepare('SELECT * FROM auth_attempts WHERE attempt_key=?').bind(key).first();
  if (row?.blocked_until && row.blocked_until > isoNow()) {
    throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  }
}

async function failedLogin(env, key) {
  const at = isoNow();
  const row = await env.DB.prepare('SELECT * FROM auth_attempts WHERE attempt_key=?').bind(key).first();
  const recent = row && Date.now() - new Date(row.first_attempt_at).getTime() < 15 * 60000;
  const attempts = recent ? Number(row.attempts || 0) + 1 : 1;
  const blocked = attempts >= 5 ? new Date(Date.now() + 5 * 60000).toISOString() : null;
  await env.DB.prepare(`
    INSERT INTO auth_attempts(attempt_key,attempts,first_attempt_at,last_attempt_at,blocked_until)
    VALUES(?,?,?,?,?)
    ON CONFLICT(attempt_key) DO UPDATE SET attempts=excluded.attempts,
      first_attempt_at=excluded.first_attempt_at,last_attempt_at=excluded.last_attempt_at,
      blocked_until=excluded.blocked_until
  `).bind(key, attempts, recent ? row.first_attempt_at : at, at, blocked).run();
}

export async function authStatus(env) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS total FROM users').first();
  return json({
    product: 'blexo-suite',
    version: '11.0.0',
    setupRequired: Number(row?.total || 0) === 0
  });
}

export async function setup(request, env) {
  assertSameOrigin(request);
  const body = await readJson(request);
  const name = cleanText(body.name, 120, true);
  const username = normalizeUsername(body.username);
  const passwordHash = await hashPassword(body.password);
  const role = await env.DB.prepare("SELECT id FROM roles WHERE code='ADMIN'").first();
  const teamCode = cleanText(body.teamCode || 'ZELADORIA', 40).toUpperCase();
  const team = await env.DB.prepare('SELECT id FROM teams WHERE code=? AND active=1').bind(teamCode).first();
  if (!role || !team) throw new HttpError(500, 'Cadastros iniciais de acesso não encontrados.');
  const userId = newId();
  const at = isoNow();
  const created = await env.DB.prepare(`
    INSERT INTO users(id,name,username,email,password_hash,role_id,team_id,active,must_change_password,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,1,0,?,?
    WHERE NOT EXISTS(SELECT 1 FROM users)
  `).bind(
    userId, name, username, cleanText(body.email, 160) || null,
    passwordHash, role.id, team.id, at, at
  ).run();
  if (!created.meta?.changes) throw new HttpError(409, 'A configuração inicial já foi concluída.');
  const token = await sessionFor(request, env, userId);
  await audit(env, userId, 'SYSTEM_SETUP', 'user', userId, { username, teamCode });
  const user = await currentUser(new Request(request.url, {
    headers: { cookie: `blexo_session=${encodeURIComponent(token)}` }
  }), env, true);
  return json({ ok: true, user: publicUser(user) }, 201, {
    'set-cookie': sessionCookie(request, token)
  });
}

export async function login(request, env) {
  assertSameOrigin(request);
  const body = await readJson(request);
  const username = normalizeUsername(body.username);
  const key = await attemptKey(request, username);
  await checkLoginAllowed(env, key);
  const user = await env.DB.prepare(`
    SELECT id,password_hash,active FROM users WHERE username=? COLLATE NOCASE
  `).bind(username).first();
  const valid = user && user.active && await verifyPassword(body.password, user.password_hash);
  if (!valid) {
    await failedLogin(env, key);
    throw new HttpError(401, 'Usuário ou senha inválidos.');
  }
  await env.DB.prepare('DELETE FROM auth_attempts WHERE attempt_key=?').bind(key).run();
  const token = await sessionFor(request, env, user.id);
  const at = isoNow();
  await env.DB.prepare('UPDATE users SET last_login_at=?,updated_at=? WHERE id=?').bind(at, at, user.id).run();
  await audit(env, user.id, 'LOGIN', 'session', null);
  const authenticated = await currentUser(new Request(request.url, {
    headers: { cookie: `blexo_session=${encodeURIComponent(token)}` }
  }), env, true);
  return json({ ok: true, user: publicUser(authenticated) }, 200, {
    'set-cookie': sessionCookie(request, token)
  });
}

export async function logout(request, env) {
  assertSameOrigin(request);
  const user = await currentUser(request, env, true);
  if (user) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(user.sessionTokenHash).run();
    await audit(env, user.id, 'LOGOUT', 'session', null);
  }
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie(request) });
}

export async function me(request, env) {
  const user = await requireUser(request, env);
  const at = isoNow();
  await env.DB.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?')
    .bind(at, user.sessionTokenHash).run();
  return json({ user: publicUser(user), product: 'blexo-suite', version: '11.0.0' });
}

export async function changePassword(request, env) {
  assertSameOrigin(request);
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const stored = await env.DB.prepare('SELECT password_hash FROM users WHERE id=?').bind(user.id).first();
  if (!stored || !await verifyPassword(body.currentPassword, stored.password_hash)) {
    throw new HttpError(400, 'A senha atual não confere.');
  }
  const passwordHash = await hashPassword(body.newPassword);
  const at = isoNow();
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash=?,must_change_password=0,updated_at=? WHERE id=?')
      .bind(passwordHash, at, user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?')
      .bind(user.id, user.sessionTokenHash)
  ]);
  await audit(env, user.id, 'PASSWORD_CHANGED', 'user', user.id);
  return json({ ok: true });
}

export async function listUsers(request, env) {
  await requireUser(request, env, 'users.view');
  const rows = await env.DB.prepare(`
    SELECT u.id,u.name,u.username,u.email,u.active,u.must_change_password,
      u.last_login_at,u.created_at,r.code AS role_code,r.name AS role_name,
      t.code AS team_code,t.name AS team_name
    FROM users u JOIN roles r ON r.id=u.role_id JOIN teams t ON t.id=u.team_id
    ORDER BY u.active DESC,u.name
  `).all();
  return json(rows.results || []);
}

export async function createUser(request, env) {
  assertSameOrigin(request);
  const actor = await requireUser(request, env, 'users.manage');
  const body = await readJson(request);
  const name = cleanText(body.name, 120, true);
  const username = normalizeUsername(body.username);
  const role = await env.DB.prepare('SELECT id,code FROM roles WHERE code=?')
    .bind(cleanText(body.roleCode, 30).toUpperCase()).first();
  const team = await env.DB.prepare('SELECT id,code FROM teams WHERE code=? AND active=1')
    .bind(cleanText(body.teamCode, 40).toUpperCase()).first();
  if (!role || !team) throw new HttpError(400, 'Perfil ou equipe inválidos.');
  const passwordHash = await hashPassword(body.password);
  const at = isoNow();
  const userId = newId();
  try {
    await env.DB.prepare(`
      INSERT INTO users(id,name,username,email,password_hash,role_id,team_id,active,must_change_password,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,1,1,?,?)
    `).bind(
      userId, name, username, cleanText(body.email, 160) || null,
      passwordHash, role.id, team.id, at, at
    ).run();
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) {
      throw new HttpError(409, 'O usuário ou e-mail já está cadastrado.');
    }
    throw error;
  }
  await audit(env, actor.id, 'USER_CREATED', 'user', userId, {
    username, role: role.code, team: team.code
  });
  return json({ ok: true, id: userId }, 201);
}

export async function updateUser(request, env, userId) {
  assertSameOrigin(request);
  const actor = await requireUser(request, env, 'users.manage');
  const existing = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(userId).first();
  if (!existing) throw new HttpError(404, 'Usuário não encontrado.');
  const body = await readJson(request);
  const roleCode = cleanText(body.roleCode || '', 30).toUpperCase();
  const teamCode = cleanText(body.teamCode || '', 40).toUpperCase();
  const role = roleCode
    ? await env.DB.prepare('SELECT id FROM roles WHERE code=?').bind(roleCode).first()
    : { id: existing.role_id };
  const team = teamCode
    ? await env.DB.prepare('SELECT id FROM teams WHERE code=? AND active=1').bind(teamCode).first()
    : { id: existing.team_id };
  if (!role || !team) throw new HttpError(400, 'Perfil ou equipe inválidos.');
  const active = body.active === undefined ? existing.active : body.active ? 1 : 0;
  if (actor.id === userId && !active) throw new HttpError(400, 'Você não pode desativar seu próprio usuário.');
  const at = isoNow();
  await env.DB.prepare(`
    UPDATE users SET name=?,email=?,role_id=?,team_id=?,active=?,updated_at=? WHERE id=?
  `).bind(
    cleanText(body.name ?? existing.name, 120, true),
    cleanText(body.email ?? existing.email, 160) || null,
    role.id, team.id, active, at, userId
  ).run();
  if (!active) await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId).run();
  await audit(env, actor.id, 'USER_UPDATED', 'user', userId, { active, roleCode, teamCode });
  return json({ ok: true });
}

export async function resetUserPassword(request, env, userId) {
  assertSameOrigin(request);
  const actor = await requireUser(request, env, 'users.manage');
  const body = await readJson(request);
  const passwordHash = await hashPassword(body.password);
  const result = await env.DB.prepare(`
    UPDATE users SET password_hash=?,must_change_password=1,updated_at=? WHERE id=?
  `).bind(passwordHash, isoNow(), userId).run();
  if (!result.meta?.changes) throw new HttpError(404, 'Usuário não encontrado.');
  await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId).run();
  await audit(env, actor.id, 'PASSWORD_RESET', 'user', userId);
  return json({ ok: true });
}

export async function accessConfig(request, env) {
  await requireUser(request, env, 'settings.view');
  const [roles, teams, modules, teamModules, routing] = await Promise.all([
    env.DB.prepare('SELECT id,code,name,sort_order FROM roles ORDER BY sort_order').all(),
    env.DB.prepare('SELECT id,code,name,activity_scope,active FROM teams ORDER BY name').all(),
    env.DB.prepare('SELECT code,name,path,module_group,sort_order,active FROM module_catalog ORDER BY sort_order').all(),
    env.DB.prepare('SELECT team_id,module_code,enabled FROM team_modules').all(),
    env.DB.prepare(`SELECT rr.category_code,rr.category_name,rr.team_id,rr.auto_create_activity,rr.active,t.name AS team_name
      FROM routing_rules rr JOIN teams t ON t.id=rr.team_id ORDER BY rr.category_name`).all()
  ]);
  return json({
    roles: roles.results || [], teams: teams.results || [], modules: modules.results || [],
    teamModules: teamModules.results || [], routingRules: routing.results || []
  });
}

export async function updateTeamModules(request, env, teamId) {
  assertSameOrigin(request);
  const actor = await requireUser(request, env, 'access.manage');
  const body = await readJson(request);
  if (!Array.isArray(body.modules)) throw new HttpError(400, 'Informe os módulos da equipe.');
  const valid = await env.DB.prepare('SELECT code FROM module_catalog WHERE active=1').all();
  const allowed = new Set((valid.results || []).map(row => row.code));
  const selected = [...new Set(body.modules.map(code => cleanText(code, 60)).filter(code => allowed.has(code)))];
  const at = isoNow();
  const statements = [env.DB.prepare('DELETE FROM team_modules WHERE team_id=?').bind(teamId)];
  for (const code of selected) {
    statements.push(env.DB.prepare(`
      INSERT INTO team_modules(team_id,module_code,enabled,updated_at) VALUES(?,?,1,?)
    `).bind(teamId, code, at));
  }
  await env.DB.batch(statements);
  await audit(env, actor.id, 'TEAM_MODULES_UPDATED', 'team', teamId, { modules: selected });
  return json({ ok: true, modules: selected });
}

export async function updateRoutingRules(request, env) {
  assertSameOrigin(request);
  const actor = await requireUser(request, env, 'settings.manage');
  const body = await readJson(request);
  if (!Array.isArray(body.rules)) throw new HttpError(400, 'Informe as regras de roteamento.');
  const at = isoNow();
  const statements = [];
  for (const rule of body.rules.slice(0, 100)) {
    const team = await env.DB.prepare('SELECT id FROM teams WHERE id=? AND active=1')
      .bind(cleanText(rule.teamId, 80)).first();
    if (!team) throw new HttpError(400, 'Uma das equipes de roteamento é inválida.');
    statements.push(env.DB.prepare(`
      UPDATE routing_rules SET team_id=?,auto_create_activity=?,active=?,updated_at=?
      WHERE category_code=?
    `).bind(team.id, rule.autoCreate ? 1 : 0, rule.active === false ? 0 : 1, at,
      cleanText(rule.categoryCode, 60).toUpperCase()));
  }
  if (statements.length) await env.DB.batch(statements);
  await audit(env, actor.id, 'ROUTING_UPDATED', 'routing', null, { count: statements.length });
  return json({ ok: true });
}
