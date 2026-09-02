import { HttpError, isoNow } from './http.js';
import { readCookie, SESSION_COOKIE, sha256 } from './security.js';

// Cache apenas a composição de acesso dentro do isolate do Worker. A sessão,
// o usuário ativo e a equipe ativa continuam sendo consultados em toda rota.
const ACCESS_CACHE_TTL_MS = 60_000;
const accessCache = new Map();

export function invalidateAccessCache() {
  accessCache.clear();
}

function cachedAccessKey(user) {
  return `${user.id}:${user.role_id}:${user.team_id}:${user.role_code}`;
}

async function accessFor(env, user) {
  const key = cachedAccessKey(user);
  const cached = accessCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { permissions: new Set(cached.permissions), modules: cached.modules };
  }
  const [permissions, modules] = await Promise.all([permissionSet(env, user), moduleList(env, user)]);
  if (accessCache.size >= 200) accessCache.clear();
  accessCache.set(key, {
    permissions: [...permissions], modules, expiresAt: Date.now() + ACCESS_CACHE_TTL_MS
  });
  return { permissions, modules };
}

async function permissionSet(env, user) {
  const inherited = await env.DB.prepare(`
    SELECT p.code
    FROM role_permissions rp
    JOIN permissions p ON p.id=rp.permission_id
    WHERE rp.role_id=?
  `).bind(user.role_id).all();
  const permissions = new Set((inherited.results || []).map(row => row.code));
  const overrides = await env.DB.prepare(`
    SELECT p.code,upo.effect
    FROM user_permission_overrides upo
    JOIN permissions p ON p.id=upo.permission_id
    WHERE upo.user_id=?
  `).bind(user.id).all();
  for (const row of overrides.results || []) {
    if (row.effect === 'DENY') permissions.delete(row.code);
    else permissions.add(row.code);
  }
  return permissions;
}

async function moduleList(env, user) {
  if (user.role_code === 'ADMIN') {
    const rows = await env.DB.prepare(`
      SELECT code,name,path,icon,module_group,sort_order
      FROM module_catalog WHERE active=1 ORDER BY sort_order,name
    `).all();
    return rows.results || [];
  }
  const rows = await env.DB.prepare(`
    SELECT m.code,m.name,m.path,m.icon,m.module_group,m.sort_order,
      COALESCE(umo.enabled,tm.enabled,0) AS enabled
    FROM module_catalog m
    LEFT JOIN team_modules tm ON tm.module_code=m.code AND tm.team_id=?
    LEFT JOIN user_module_overrides umo ON umo.module_code=m.code AND umo.user_id=?
    WHERE m.active=1 AND (
      COALESCE(umo.enabled,tm.enabled,0)=1 OR (?='SUPERVISOR' AND m.code='settings')
    )
    ORDER BY m.sort_order,m.name
  `).bind(user.team_id, user.id, user.role_code).all();
  return rows.results || [];
}

export async function currentUser(request, env, includeAccess = true) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const at = isoNow();
  const user = await env.DB.prepare(`
    SELECT u.id,u.name,u.username,u.email,u.active,u.must_change_password,s.last_seen_at,
      u.role_id,u.team_id,r.code AS role_code,r.name AS role_name,
      t.code AS team_code,t.name AS team_name,t.activity_scope
    FROM sessions s
    JOIN users u ON u.id=s.user_id
    JOIN roles r ON r.id=u.role_id
    JOIN teams t ON t.id=u.team_id
    WHERE s.token_hash=? AND s.expires_at>? AND u.active=1 AND t.active=1
  `).bind(tokenHash, at).first();
  if (!user) return null;
  if (!includeAccess) return user;
  const { permissions, modules } = await accessFor(env, user);
  return { ...user, permissions, modules, sessionTokenHash: tokenHash };
}

export async function requireUser(request, env, permission = null) {
  const user = await currentUser(request, env, true);
  if (!user) throw new HttpError(401, 'Faça login para continuar.', 'AUTH_REQUIRED');
  if (permission && !user.permissions.has(permission)) {
    throw new HttpError(403, 'Você não possui permissão para esta operação.', 'FORBIDDEN');
  }
  return user;
}

export function canSeeAllTeams(user) {
  return user.role_code === 'ADMIN' ||
    user.activity_scope === 'ALL' ||
    user.permissions.has('activities.view_all');
}

export function requireModule(user, moduleCode) {
  if (user.role_code === 'ADMIN') return;
  if (!(user.modules || []).some(module => module.code === moduleCode)) {
    throw new HttpError(403, 'Esta ferramenta não está liberada para sua equipe.', 'MODULE_FORBIDDEN');
  }
}

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email || null,
    role: { id: user.role_id, code: user.role_code, name: user.role_name },
    team: {
      id: user.team_id,
      code: user.team_code,
      name: user.team_name,
      activityScope: user.activity_scope
    },
    mustChangePassword: !!user.must_change_password,
    permissions: [...(user.permissions || [])].sort(),
    modules: user.modules || []
  };
}
