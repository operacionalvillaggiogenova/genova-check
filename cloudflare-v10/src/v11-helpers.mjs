const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, "0")).join("");
const unhex = value => Uint8Array.from(value.match(/.{1,2}/g) || [], v => parseInt(v, 16));

export const permissionKey = (module, action) => `${module}.${action}`;
export function hasPermission(roleKeys, overrides, required) {
  const override = overrides[required];
  return override === "deny" ? false : override === "allow" || roleKeys.includes(required);
}
export function effectivePermissions(roleKeys, overrides = {}) {
  const effective = new Set(roleKeys);
  for (const [permission, effect] of Object.entries(overrides)) {
    if (effect === "deny") effective.delete(permission);
    else if (effect === "allow") effective.add(permission);
  }
  return [...effective].sort();
}
export function routePermission(path, method) {
  if (path === "/api/health") return null;
  if (path.startsWith("/api/leiturista/") && method === "POST") return "leiturista.sync";
  if (path === "/api/ronda/sync") return "ronda.sync";
  if (path.startsWith("/api/adm/ronda")) return "ronda.admin";
  if (path === "/api/fiscalizacao/sync") return "fiscalizacao.sync";
  if (path.startsWith("/api/adm/fiscalizacao")) return "fiscalizacao.admin";
  if (path === "/api/diario/sync") return "diario.sync";
  if (path.startsWith("/api/adm/diario")) return "diario.admin";
  if (path.startsWith("/api/adm-rateio/")) return method === "GET" ? "rateios.view" : "rateios.admin";
  if (path.startsWith("/api/files/")) return "rateios.admin";
  if (path.startsWith("/api/adm/")) return "rateios.admin";
  return null;
}
export const staticModulePermission = path => ({
  "/check.html":"check.view", "/leiturista.html":"leiturista.view",
  "/scanner.html":"scanner.view", "/ronda.html":"ronda.view",
  "/adm-ronda.html":"ronda.admin", "/diario.html":"diario.view",
  "/adm-diario.html":"diario.admin", "/fiscalizacao.html":"fiscalizacao.view",
  "/adm-fiscalizacao.html":"fiscalizacao.admin", "/rateios.html":"rateios.view",
  "/adm-rateio.html":"rateios.admin", "/orcamentos.html":"orcamentos.view",
  "/reembolso.html":"reembolso.view", "/adm.html":"rateios.admin"
})[path] || null;
export function validPassword(value) {
  return typeof value === "string" && value.length >= 8;
}
export const MAX_ACTIVITY_EVIDENCE_BYTES = 15 * 1024 * 1024;
export function validActivityEvidence(file) {
  return !!file && Number.isFinite(file.size) && file.size > 0 && file.size <= MAX_ACTIVITY_EVIDENCE_BYTES &&
    (String(file.type || "").startsWith("image/") || file.type === "application/pdf");
}
export function sessionIsUsable(expiresAt, userActive, currentTime = new Date().toISOString()) {
  return !!userActive && typeof expiresAt === "string" && expiresAt > currentTime;
}
export function v11Redirect(path, authenticated) {
  if (path === "/") return authenticated ? "/dashboard" : "/login";
  if (path === "/login" && authenticated) return "/dashboard";
  if (["/dashboard","/operacao","/activities","/activity","/recorrencias","/users","/settings"].includes(path) && !authenticated) return "/login";
  return null;
}
export const v11PagePermissions = path => ({
  "/dashboard":["dashboard.view"], "/operacao":["activities.view"], "/activities":["activities.view"],
  "/activity":["activities.view"], "/recorrencias":["activities.view"], "/users":["users.view"],
  "/settings":["settings.password","settings.modules"]
})[path] || [];
export const v11PagePermission = path => v11PagePermissions(path)[0] || null;
export const v11CanonicalPath = path => ({
  "/index.html":"/dashboard",
  "/v11-login.html":"/login", "/v11-dashboard.html":"/dashboard",
  "/v11-activities.html":"/activities", "/v11-activity.html":"/activity", "/v11-recurrences.html":"/recorrencias",
  "/v11-users.html":"/users", "/v11-settings.html":"/settings"
})[path] || path;
export function fileOwnerPermission(rows, decodedKey) {
  return rows.find(row => row.r2_key === decodedKey)?.permission || null;
}
export function activityHistoryView(row) {
  return {
    id: row.id, activityId: row.activity_id, action: row.action,
    description: row.description, createdAt: row.created_at,
    performedBy: { id: row.performed_by_id, name: row.performed_by_name, email: row.performed_by_email }
  };
}
export function activityEvidenceView(row, readUrl) {
  return {
    id: row.id, activityId: row.activity_id, filename: row.filename,
    contentType: row.content_type, size: row.size, note: row.note,
    uploadedById: row.uploaded_by_id, createdAt: row.created_at, readUrl
  };
}
export async function sha256(value) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
// Cloudflare Workers currently accepts PBKDF2 iteration counts up to 100,000.
// Keep the encoded count in the hash so password verification remains explicit.
export const PBKDF2_ITERATIONS = 100000;
export async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
  if (typeof password !== "string" || password.length < 8) throw new Error("A senha deve ter ao menos 8 caracteres.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", hash:"SHA-256", salt, iterations }, key, 256);
  return `pbkdf2-sha256$${iterations}$${hex(salt)}$${hex(bits)}`;
}
export async function verifyPassword(password, stored) {
  const [kind, iterations, salt, expected] = String(stored).split("$");
  if (kind !== "pbkdf2-sha256" || !/^\d+$/.test(iterations) || !/^[a-f0-9]+$/i.test(salt) || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  if (Number(iterations) > PBKDF2_ITERATIONS) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", hash:"SHA-256", salt:unhex(salt), iterations:Number(iterations) }, key, 256);
  const actual = hex(bits); let diff = actual.length ^ expected.length;
  for (let i=0;i<actual.length && i<expected.length;i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
export function cookieValue(header, name) {
  return (header || "").split(";").map(v=>v.trim()).find(v=>v.startsWith(`${name}=`))?.slice(name.length+1) || null;
}
