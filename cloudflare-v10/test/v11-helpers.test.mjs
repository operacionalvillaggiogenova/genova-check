import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { activityEvidenceView, activityHistoryView, effectivePermissions, fileOwnerPermission, hasPermission, hashPassword, MAX_ACTIVITY_EVIDENCE_BYTES, PBKDF2_ITERATIONS, permissionKey, routePermission, sessionIsUsable, sha256, staticModulePermission, validActivityEvidence, validPassword, verifyPassword, v11PagePermission, v11PagePermissions, v11Redirect } from "../src/v11-helpers.mjs";
import { canonicalOfflinePath, documentsForPermissions } from "../src/v11-offline-helpers.mjs";

test("permission keys and user overrides are deterministic", () => {
  assert.equal(permissionKey("activities", "view"), "activities.view");
  assert.equal(hasPermission(["activities.view"], {}, "activities.view"), true);
  assert.equal(hasPermission(["activities.view"], {"activities.view":"deny"}, "activities.view"), false);
  assert.equal(hasPermission([], {"activities.view":"allow"}, "activities.view"), true);
});
test("effective permissions include allows and remove denies after refresh", () => {
  assert.deepEqual(
    effectivePermissions(["dashboard.view", "users.view"], {"users.view":"deny", "activities.view":"allow"}),
    ["activities.view", "dashboard.view"],
  );
});
test("offline worker precaches every V11 runtime asset", () => {
  const worker = readFileSync(new URL("../../public/legacy/v11-sw.js", import.meta.url), "utf8");
  for (const asset of ["/v11.css", "/v11-api.js", "/v11-shell.js", "/blexo-config-bridge.js", "/v11-module-settings.js"]) {
    assert.match(worker, new RegExp(`PUBLIC_ASSETS = \\[[^\\]]*${asset.replace(".", "\\.")}`));
  }
});
test("legacy route permission mapping protects legacy APIs", () => {
  assert.equal(routePermission("/api/adm-rateio/cycles", "GET"), "rateios.view");
  assert.equal(routePermission("/api/adm-rateio/cycles/x/close", "POST"), "rateios.admin");
  assert.equal(routePermission("/api/ronda/sync", "POST"), "ronda.sync");
  assert.equal(routePermission("/api/adm/ronda", "GET"), "ronda.admin");
  assert.equal(routePermission("/api/adm/diario", "GET"), "diario.admin");
  assert.equal(routePermission("/api/adm/fiscalizacao", "GET"), "fiscalizacao.admin");
  assert.equal(routePermission("/api/health", "GET"), null);
  assert.equal(staticModulePermission("/adm-rateio.html"), "rateios.admin");
  assert.equal(staticModulePermission("/ronda.html"), "ronda.view");
  assert.equal(staticModulePermission("/styles.css"), null);
});
test("legacy sync and mutations require explicit non-view permissions", () => {
  assert.equal(routePermission("/api/leiturista/sync", "POST"), "leiturista.sync");
  assert.equal(routePermission("/api/leiturista/cycles/a/evidence", "POST"), "leiturista.sync");
  assert.equal(routePermission("/api/ronda/sync", "POST"), "ronda.sync");
  assert.equal(routePermission("/api/fiscalizacao/sync", "POST"), "fiscalizacao.sync");
  assert.equal(routePermission("/api/diario/sync", "POST"), "diario.sync");
  assert.equal(hasPermission(["rateios.view"], {}, routePermission("/api/adm-rateio/cycles/a/close","POST")), false);
  assert.equal(hasPermission(["rateios.admin"], {}, routePermission("/api/adm-rateio/cycles/a/close","POST")), true);
});
test("static access and password validation helpers retain safe boundaries", () => {
  assert.equal(staticModulePermission("/adm-diario.html"), "diario.admin");
  assert.equal(staticModulePermission("/unknown.html"), null);
  assert.equal(validPassword("1234567"), false);
  assert.equal(validPassword("12345678"), true);
  assert.equal(validPassword(null), false);
  assert.equal(v11Redirect("/", false), "/login");
  assert.equal(v11Redirect("/", true), "/dashboard");
  assert.equal(v11Redirect("/users", false), "/login");
  assert.equal(v11Redirect("/login", true), "/dashboard");
  assert.equal(v11Redirect("/activities", true), null);
  assert.equal(v11Redirect("/recorrencias", false), "/login");
  assert.equal(v11PagePermission("/users"), "users.view");
  assert.equal(v11PagePermission("/recorrencias"), "activities.view");
  assert.equal(v11PagePermission("/settings"), "settings.password");
  assert.deepEqual(v11PagePermissions("/settings"), ["settings.password","settings.modules"]);
});
test("activity evidence accepts only bounded images or PDFs", () => {
  assert.equal(validActivityEvidence({size:1,type:"image/jpeg"}), true);
  assert.equal(validActivityEvidence({size:1,type:"application/pdf"}), true);
  assert.equal(validActivityEvidence({size:1,type:"text/plain"}), false);
  assert.equal(validActivityEvidence({size:0,type:"image/jpeg"}), false);
  assert.equal(validActivityEvidence({size:MAX_ACTIVITY_EVIDENCE_BYTES+1,type:"image/jpeg"}), false);
});
test("inactive users and expired sessions are rejected", () => {
  const currentTime="2026-08-30T12:00:00.000Z";
  assert.equal(sessionIsUsable("2026-08-30T13:00:00.000Z",1,currentTime),true);
  assert.equal(sessionIsUsable("2026-08-30T13:00:00.000Z",0,currentTime),false);
  assert.equal(sessionIsUsable("2026-08-30T11:59:59.999Z",1,currentTime),false);
  assert.equal(sessionIsUsable(null,1,currentTime),false);
});
test("operator and zeladoria are denied sensitive pages while admin is allowed", () => {
  const operator=["dashboard.view","activities.view","rateios.view"];
  const zeladoria=["dashboard.view","activities.view","ronda.admin"];
  const admin=["users.view","rateios.admin","fiscalizacao.admin"];
  assert.equal(hasPermission(operator, {}, v11PagePermission("/users")), false);
  assert.equal(hasPermission(operator, {}, staticModulePermission("/adm-rateio.html")), false);
  assert.equal(hasPermission(zeladoria, {}, routePermission("/api/adm-rateio/cycles/x/close","POST")), false);
  assert.equal(hasPermission(admin, {}, v11PagePermission("/users")), true);
  assert.equal(hasPermission(admin, {}, staticModulePermission("/adm-rateio.html")), true);
});
test("raw V11 URLs resolve to the same protected route policy", async () => {
  const { v11CanonicalPath } = await import("../src/v11-helpers.mjs");
  assert.equal(v11CanonicalPath("/index.html"), "/dashboard");
  assert.equal(v11CanonicalPath("/v11-users.html"), "/users");
  assert.equal(v11CanonicalPath("/v11-recurrences.html"), "/recorrencias");
  assert.equal(v11Redirect(v11CanonicalPath("/v11-users.html"), false), "/login");
  assert.equal(hasPermission(["dashboard.view"], {}, v11PagePermission(v11CanonicalPath("/v11-users.html"))), false);
  assert.equal(hasPermission(["users.view"], {}, v11PagePermission(v11CanonicalPath("/v11-users.html"))), true);
});
test("offline document prefetch mapping is permission-specific", () => {
  const docs=documentsForPermissions(["dashboard.view","ronda.admin"]);
  assert.ok(docs.includes("/dashboard"));
  assert.ok(docs.includes("/adm-ronda.html"));
  assert.equal(docs.includes("/users"), false);
  assert.equal(docs.includes("/adm-rateio.html"), false);
});
test("legacy tool links resolve to canonical offline cache keys", () => {
  assert.equal(canonicalOfflinePath("/legacy/index.html"), "/dashboard");
  assert.equal(canonicalOfflinePath("/index.html"), "/dashboard");
  assert.equal(canonicalOfflinePath("/legacy/check.html"), "/check.html");
  assert.equal(canonicalOfflinePath("/legacy/adm-rateio.html"), "/adm-rateio.html");
  assert.equal(canonicalOfflinePath("/ronda.html"), "/ronda.html");
});
test("Web Crypto PBKDF2 and SHA-256 verify correctly", async () => {
  const stored = await hashPassword("uma-senha-segura");
  assert.match(stored, new RegExp(`^pbkdf2-sha256\\$${PBKDF2_ITERATIONS}\\$`));
  assert.equal(await verifyPassword("uma-senha-segura", stored), true);
  assert.equal(await verifyPassword("incorreta", stored), false);
  assert.equal(await verifyPassword("uma-senha-segura", stored.replace(String(PBKDF2_ITERATIONS), "100001")), false);
  assert.equal(await sha256("blexo"), "631bdb905eb777578eb99f7c46f087f043b1b45bc8de3fec5943ebfb0bcfc326");
});
test("history and evidence serializers expose only UI-safe camelCase fields", () => {
  const history = activityHistoryView({id:"h",activity_id:"a",action:"created",description:"ok",created_at:"2026-01-01",performed_by_id:"u",performed_by_name:"Ana",performed_by_email:"ana@example.com"});
  assert.deepEqual(history, {id:"h",activityId:"a",action:"created",description:"ok",createdAt:"2026-01-01",performedBy:{id:"u",name:"Ana",email:"ana@example.com"}});
  const evidence = activityEvidenceView({id:"e",activity_id:"a",filename:"photo.jpg",content_type:"image/jpeg",size:12,note:"note",uploaded_by_id:"u",created_at:"2026-01-01",r2_key:"private/key"}, "/api/activities/a/evidence/e");
  assert.equal(evidence.r2Key, undefined);
  assert.equal(evidence.readUrl, "/api/activities/a/evidence/e");
  assert.equal(evidence.contentType, "image/jpeg");
});
test("file ownership authorization matches exact keys only", () => {
  const owners=[{r2_key:"reports/a.pdf",permission:"leiturista.view"},{r2_key:"activities/a/e.jpg",permission:"activities.evidence"}];
  assert.equal(fileOwnerPermission(owners,"reports/a.pdf"),"leiturista.view");
  assert.equal(fileOwnerPermission(owners,"reports/a.pdf/extra"),null);
  assert.equal(fileOwnerPermission(owners,"activities/a/e.jpg"),"activities.evidence");
});
