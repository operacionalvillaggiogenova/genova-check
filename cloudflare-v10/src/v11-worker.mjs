import legacyWorker from "./index.js";
import { activityEvidenceView, activityHistoryView, cookieValue, effectivePermissions, fileOwnerPermission, hasPermission, hashPassword, MAX_ACTIVITY_EVIDENCE_BYTES, permissionKey, routePermission, sessionIsUsable, sha256, staticModulePermission, validActivityEvidence, validPassword, verifyPassword, v11CanonicalPath, v11PagePermissions, v11Redirect } from "./v11-helpers.mjs";

const SESSION_COOKIE = "blexo_v11_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_RENEW_WINDOW_MS = 24 * 60 * 60 * 1000;
const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}});
const empty = (status=204, headers={}) => new Response(null,{status,headers:{"cache-control":"no-store",...headers}});
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const key = (m,a) => permissionKey(m,a);
const bool = v => v === true || v === 1 || v === "1" || v === "true";
const clean = v => typeof v === "string" ? v.trim() : "";
const teams = new Set(["ADMIN","ZELADORIA","MANUTENCAO","LIMPEZA","SERVICOS_GERAIS","LEITURISTA"]);
const priorities = new Set(["low","normal","high","urgent"]);
const statuses = new Set(["pending","in_progress","completed","cancelled"]);
const sources = new Set(["admin","zeladoria","public_request","system"]);
const requestTeams = {limpeza:"LIMPEZA",manutencao:"MANUTENCAO",estrutural:"MANUTENCAO",hidraulica:"MANUTENCAO",eletrica:"MANUTENCAO",area_externa:"ZELADORIA",servicos_gerais:"SERVICOS_GERAIS",outro:"ZELADORIA"};
const defaultPermissions = [
  ["dashboard","view","Visualizar painel"], ["activities","view","Visualizar atividades"], ["activities","create","Criar atividades"], ["activities","update","Editar atividades"], ["activities","start","Iniciar atividades"], ["activities","complete","Concluir atividades"], ["activities","cancel","Cancelar atividades"], ["activities","evidence","Enviar evidências"], ["users","view","Visualizar usuários"], ["users","manage","Gerenciar usuários"], ["roles","view","Visualizar perfis"], ["roles","manage","Gerenciar perfis"], ["settings","password","Alterar senha"], ["settings","modules","Configurar módulos operacionais"],
  ["legacy","admin","Administração legada"], ["legacy","rateio","Rateio legado"], ["legacy","leiturista","Sincronização leiturista"], ["legacy","ronda","Sincronização ronda"], ["legacy","fiscalizacao","Sincronização fiscalização"], ["legacy","diario","Sincronização diário"]
];
const modulePermissions = [
  ["check","view","Visualizar Check"],["leiturista","view","Visualizar Leiturista"],["scanner","view","Visualizar Scanner"],
  ["ronda","view","Visualizar Ronda"],["ronda","admin","Administrar Ronda"],["diario","view","Visualizar Diário"],["diario","admin","Administrar Diário"],
  ["fiscalizacao","view","Visualizar Fiscalização"],["fiscalizacao","admin","Administrar Fiscalização"],["rateios","view","Visualizar Rateios"],["rateios","admin","Administrar Rateios"],
  ["orcamentos","view","Visualizar Orçamentos"],["reembolso","view","Visualizar Reembolsos"]
];
const syncPermissions = [
  ["leiturista","sync","Sincronizar Leiturista"],["ronda","sync","Sincronizar Ronda"],
  ["fiscalizacao","sync","Sincronizar Fiscalização"],["diario","sync","Sincronizar Diário"]
];
const allPermissions = [...defaultPermissions, ...modulePermissions, ...syncPermissions];
const grants = {
  admin: allPermissions.map(([module,action]) => key(module,action)),
  sindico: ["dashboard.view","activities.view","activities.create","activities.update","activities.start","activities.complete","activities.cancel","activities.evidence","users.view","roles.view","settings.password","check.view","leiturista.view","scanner.view","ronda.view","diario.view","fiscalizacao.view","rateios.view","orcamentos.view","reembolso.view","leiturista.sync","ronda.sync","fiscalizacao.sync","diario.sync"],
  zeladoria: ["dashboard.view","activities.view","activities.create","activities.update","activities.start","activities.complete","activities.cancel","activities.evidence","settings.password","check.view","leiturista.view","scanner.view","ronda.view","ronda.admin","diario.view","diario.admin","fiscalizacao.view","fiscalizacao.admin","rateios.view","orcamentos.view","reembolso.view","legacy.leiturista","legacy.ronda","legacy.fiscalizacao","legacy.diario"],
  manutencao: ["dashboard.view","activities.view","activities.start","activities.complete","activities.evidence","settings.password","check.view","scanner.view","ronda.view","diario.view","fiscalizacao.view","orcamentos.view","reembolso.view","ronda.sync","fiscalizacao.sync","diario.sync"],
  limpeza: ["dashboard.view","activities.view","activities.start","activities.complete","activities.evidence","settings.password","check.view","ronda.view","diario.view","ronda.sync","diario.sync"],
  servicos_gerais: ["dashboard.view","activities.view","activities.start","activities.complete","activities.evidence","settings.password","check.view","scanner.view","ronda.view","diario.view","fiscalizacao.view","orcamentos.view","reembolso.view","ronda.sync","fiscalizacao.sync","diario.sync"],
  leiturista: ["dashboard.view","activities.view","activities.start","activities.complete","activities.evidence","settings.password","leiturista.view","leiturista.sync"],
  // Kept for existing V11 users; new deployments use the role names above.
  operador: ["dashboard.view","activities.view","activities.start","activities.complete","activities.evidence","settings.password","check.view","leiturista.view","scanner.view","ronda.view","diario.view","fiscalizacao.view","rateios.view","orcamentos.view","reembolso.view","legacy.leiturista","legacy.ronda","legacy.fiscalizacao","legacy.diario"]
};
function cookie(token, maxAge=Math.floor(SESSION_TTL_MS/1000)) { return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`; }
async function one(db, sql, ...args) { return db.prepare(sql).bind(...args).first(); }
async function rows(db, sql, ...args) { return (await db.prepare(sql).bind(...args).all()).results || []; }
async function audit(env, actor, action, type=null, entity=null, details=null) {
  await env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?,?)").bind(id(),actor,action,type,entity,details?JSON.stringify(details):null,now()).run();
}
async function initialize(env) {
  if (!env.DB) throw new Error("D1 não configurado no Worker.");
  const t=now();
  for (const [name,label] of [["admin","Administrador"],["sindico","Síndico"],["zeladoria","Zeladoria"],["manutencao","Manutenção"],["limpeza","Limpeza"],["servicos_gerais","Serviços Gerais"],["leiturista","Leiturista"],["operador","Operador (legado)"]])
    await env.DB.prepare("INSERT OR IGNORE INTO roles(id,name,label,created_at) VALUES(?,?,?,?)").bind(`role-${name}`,name,label,t).run();
  for (const [module,action,label] of allPermissions)
    await env.DB.prepare("INSERT OR IGNORE INTO permissions(id,module,action,label) VALUES(?,?,?,?)").bind(`permission-${module}-${action}`,module,action,label).run();
  for (const [role, permissionKeys] of Object.entries(grants))
    for (const permission of permissionKeys)
      await env.DB.prepare("INSERT OR IGNORE INTO role_permissions(role_id,permission_id) VALUES(?,?)").bind(`role-${role}`,`permission-${permission.replace(".", "-")}`).run();
  for (const role of ["zeladoria","operador"])
    await env.DB.prepare("DELETE FROM role_permissions WHERE role_id=? AND permission_id LIKE 'permission-legacy-%'").bind(`role-${role}`).run();
  for (const [role, permissions] of Object.entries({zeladoria:["leiturista.sync","ronda.sync","fiscalizacao.sync","diario.sync"],operador:["leiturista.sync","ronda.sync","fiscalizacao.sync","diario.sync"]}))
    for (const permission of permissions)
      await env.DB.prepare("INSERT OR IGNORE INTO role_permissions(role_id,permission_id) VALUES(?,?)").bind(`role-${role}`,`permission-${permission.replace(".", "-")}`).run();
  const count=await one(env.DB,"SELECT COUNT(*) AS n FROM users");
  if (Number(count?.n) !== 0) return;
  const email=clean(env.BOOTSTRAP_ADMIN_EMAIL).toLowerCase(), password=env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !validPassword(password)) throw new Error("Nenhum usuário existe. Configure BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD (mínimo de 8 caracteres) para criar o administrador inicial.");
  if (!email.includes("@")) throw new Error("BOOTSTRAP_ADMIN_EMAIL inválido.");
  const admin="role-admin";
  await env.DB.prepare("INSERT INTO users(id,name,email,password_hash,role_id,team,active,created_at) VALUES(?,?,?,?,?,?,1,?)").bind(id(),"Administrador Blexo",email,await hashPassword(password),admin,"ADMIN",t).run();
}
async function context(request, env) {
  const token=cookieValue(request.headers.get("cookie"),SESSION_COOKIE);
  if (!token) return null;
  const session=await one(env.DB,"SELECT s.id,s.user_id,s.expires_at FROM sessions s WHERE s.token_hash=?",await sha256(token));
  if (!session) return null;
  const user=await one(env.DB,"SELECT u.*,r.name role_name,r.label role_label FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?",session.user_id);
  if (!user || !sessionIsUsable(session.expires_at,user.active,now())) return null;
  const roleRows=await rows(env.DB,"SELECT p.module,p.action FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=?",user.role_id);
  const overrideRows=await rows(env.DB,"SELECT p.module,p.action,up.effect FROM user_permissions up JOIN permissions p ON p.id=up.permission_id WHERE up.user_id=?",user.id);
  const overrides=Object.fromEntries(overrideRows.map(p=>[key(p.module,p.action),p.effect]));
  const timestamp=now();
  let renewedCookie=null;
  if (Date.parse(session.expires_at)-Date.now() <= SESSION_RENEW_WINDOW_MS) {
    const expiresAt=new Date(Date.now()+SESSION_TTL_MS).toISOString();
    await env.DB.prepare("UPDATE sessions SET expires_at=?,last_seen_at=? WHERE id=?").bind(expiresAt,timestamp,session.id).run();
    session.expires_at=expiresAt;
    renewedCookie=cookie(token);
  } else await env.DB.prepare("UPDATE sessions SET last_seen_at=? WHERE id=?").bind(timestamp,session.id).run();
  return {session,user,role:{id:user.role_id,name:user.role_name,label:user.role_label}, permissions:roleRows.map(p=>key(p.module,p.action)),overrides,renewedCookie};
}
function withRenewedSession(response, auth) {
  if (!auth?.renewedCookie || response.headers.has("set-cookie")) return response;
  const headers=new Headers(response.headers); headers.append("set-cookie",auth.renewedCookie);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function userView(u) { return {id:u.id,name:u.name,email:u.email,active:!!u.active,team:u.team,role:{id:u.role_id,name:u.role_name,label:u.role_label},createdAt:u.created_at,lastLoginAt:u.last_login_at}; }
function roleView(role) { return {id:role.id,name:role.name,label:role.label}; }
async function roleAccess(env, roleId) {
  const role=await one(env.DB,"SELECT * FROM roles WHERE id=?",roleId);
  if (!role) return null;
  const assigned=await rows(env.DB,"SELECT permission_id FROM role_permissions WHERE role_id=?",roleId);
  return {role:roleView(role),permissionIds:assigned.map(row=>row.permission_id)};
}
async function userAccess(env, userId) {
  const user=await one(env.DB,"SELECT u.*,r.name role_name,r.label role_label FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?",userId);
  if (!user) return null;
  const overrides=await rows(env.DB,"SELECT permission_id,effect FROM user_permissions WHERE user_id=?",userId);
  return {user:userView(user),overrides:overrides.map(({permission_id,effect})=>({permissionId:permission_id,effect}))};
}
async function validatedPermissionIds(env, permissionIds) {
  if (!Array.isArray(permissionIds) || permissionIds.some(value=>typeof value!=="string")) return null;
  const unique=[...new Set(permissionIds)];
  if (!unique.length) return [];
  const placeholders=unique.map(()=>"?").join(",");
  const found=await rows(env.DB,`SELECT id FROM permissions WHERE id IN (${placeholders})`,...unique);
  return found.length===unique.length ? unique : null;
}
async function replaceRolePermissions(env, roleId, permissionIds) {
  await env.DB.prepare("DELETE FROM role_permissions WHERE role_id=?").bind(roleId).run();
  for (const permissionId of permissionIds)
    await env.DB.prepare("INSERT INTO role_permissions(role_id,permission_id) VALUES(?,?)").bind(roleId,permissionId).run();
}
function allowed(auth, permission) { return !!auth && hasPermission(auth.permissions,auth.overrides,permission); }
function require(auth, permission) { return !auth ? json({error:"Autenticação necessária"},401) : !allowed(auth,permission) ? json({error:"Permissão insuficiente"},403) : null; }
async function body(request) { try { return await request.json(); } catch { return null; } }
async function activityView(env,a) {
  const assigned=a.assigned_to_id ? await one(env.DB,"SELECT id,name,email FROM users WHERE id=?",a.assigned_to_id) : null;
  const creator=await one(env.DB,"SELECT id,name,email FROM users WHERE id=?",a.created_by_id);
  return {id:a.id,title:a.title,description:a.description,team:a.team,assignedToId:a.assigned_to_id,assignedTo:assigned,priority:a.priority,location:a.location,dueDate:a.due_date,status:a.status,type:a.type||"one_off",templateId:a.template_id||null,requiresEvidence:!!a.requires_evidence,requiresObservation:!!a.requires_observation,createdById:a.created_by_id,createdBy:creator,startedAt:a.started_at,completedAt:a.completed_at,completedById:a.completed_by_id,source:a.source,createdAt:a.created_at,updatedAt:a.updated_at,overdue:!!a.due_date&&a.due_date<now()&&!["completed","cancelled"].includes(a.status)};
}
async function history(env, activityId, actor, action, description) {
  await env.DB.prepare("INSERT INTO activity_history(id,activity_id,action,performed_by_id,description,created_at) VALUES(?,?,?,?,?,?)").bind(id(),activityId,action,actor,description||null,now()).run();
}
async function getActivity(env, activityId) { return one(env.DB,"SELECT * FROM activities WHERE id=?",activityId); }
function coordinates(auth) { return auth.role.name==="admin" || ["activities.create","activities.update","activities.cancel"].some(permission=>allowed(auth,permission)); }
function visible(auth,a) { return coordinates(auth) || a.team===auth.user.team || a.assigned_to_id===auth.user.id; }
function nextRun(template, from) { const d=new Date(from); const n=Math.max(1,Number(template.interval_value)||1); if(template.recurrence_type==="monthly")d.setUTCMonth(d.getUTCMonth()+n); else d.setUTCDate(d.getUTCDate()+n*(template.recurrence_type==="weekly"?7:1)); return d.toISOString(); }
async function generateOccurrences(env, cutoff=now()) {
  const templates=await rows(env.DB,"SELECT * FROM activity_templates WHERE active=1 AND next_run_at<=? AND (ends_at IS NULL OR next_run_at<=ends_at) ORDER BY next_run_at LIMIT 100",cutoff);
  for(const t of templates) for(let count=0;t.next_run_at<=cutoff&&count<100;count++) { const scheduled=t.next_run_at, activityId=id(), occurrenceId=id(), created=now();
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO activities(id,title,description,team,assigned_to_id,priority,location,due_date,status,type,template_id,requires_evidence,created_by_id,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?, 'pending','recurring',?,?,?,?,?,?)").bind(activityId,t.title,t.description,t.team,t.assigned_to_id,t.priority,t.location,scheduled,t.id,t.requires_evidence,t.created_by_id,"system",created,created),
      env.DB.prepare("INSERT OR IGNORE INTO activity_occurrences(id,template_id,activity_id,scheduled_for,created_at) VALUES(?,?,?,?,?)").bind(occurrenceId,t.id,activityId,scheduled,created)
    ]);
    const following=nextRun(t,scheduled); await env.DB.prepare("UPDATE activity_templates SET next_run_at=?,updated_at=? WHERE id=? AND next_run_at=?").bind(following,created,t.id,scheduled).run(); t.next_run_at=following;
  }
}
async function assigneeError(env, team, assignedToId) {
  if (!assignedToId) return null;
  const user=await one(env.DB,"SELECT id,team,active FROM users WHERE id=?",assignedToId);
  if (!user || !bool(user.active)) return "O responsável selecionado não está ativo";
  return user.team===team ? null : "O responsável deve pertencer à equipe da atividade";
}
const v11Pages = {"/login":"v11-login.html","/dashboard":"v11-dashboard.html","/operacao":"v11-activities.html","/activities":"v11-activities.html","/activity":"v11-activity.html","/recorrencias":"v11-recurrences.html","/users":"v11-users.html","/settings":"v11-settings.html"};
async function serveV11Asset(request, env, url, filename) {
  const assetUrl=new URL(url); assetUrl.pathname=`/${filename}`;
  return env.ASSETS.fetch(new Request(assetUrl.toString(),request));
}
async function legacyFilePermission(env, decodedKey) {
  const lookups = [
    ["SELECT pdf_key AS r2_key FROM collection_reports WHERE pdf_key=? LIMIT 1", "leiturista.view"],
    ["SELECT r2_key FROM evidences WHERE r2_key=? LIMIT 1", "rateios.view"],
    ["SELECT evidence_key AS r2_key FROM ronda_checkpoints WHERE evidence_key=? LIMIT 1", "ronda.view"],
    ["SELECT r2_key FROM fiscalizacao_evidences WHERE r2_key=? LIMIT 1", "fiscalizacao.view"],
    ["SELECT r2_key FROM diario_evidences WHERE r2_key=? LIMIT 1", "diario.view"],
    ["SELECT r2_key FROM activity_evidence WHERE r2_key=? LIMIT 1", "activities.evidence"],
  ];
  for (const [sql, permission] of lookups) {
    const owner = await one(env.DB, sql, decodedKey);
    if (owner?.r2_key === decodedKey) return permission;
  }
  return null;
}
async function v11(request, env, url, auth) {
  {
  const path=url.pathname, method=request.method;
  const checklistMatch=path.match(/^\/api\/activities\/([^/]+)\/checklists(?:\/([^/]+)\/items\/([^/]+))?$/);
  if(checklistMatch){
    const [,activityId,checklistId,itemId]=checklistMatch,activity=await getActivity(env,activityId);
    if(!activity||!visible(auth,activity))return json({error:"Atividade não encontrada"},404);
    if(!checklistId&&method==="GET"){const denied=require(auth,"activities.view");if(denied)return denied;const lists=await rows(env.DB,"SELECT * FROM activity_checklists WHERE activity_id=? ORDER BY created_at",activityId);for(const list of lists)list.items=await rows(env.DB,"SELECT id,label,position,checked_at,checked_by_id FROM activity_checklist_items WHERE checklist_id=? ORDER BY position",list.id);return json(lists);}
    if(!checklistId&&method==="POST"){const denied=require(auth,"activities.update");if(denied)return denied;const b=await body(request),title=clean(b?.title),items=Array.isArray(b?.items)?b.items.map(clean).filter(x=>x.length>0):[];if(title.length<2||!items.length)return json({error:"Informe título e ao menos um item"},400);const listId=id(),created=now();await env.DB.prepare("INSERT INTO activity_checklists(id,activity_id,title,created_by_id,created_at) VALUES(?,?,?,?,?)").bind(listId,activityId,title,auth.user.id,created).run();for(let pos=0;pos<items.length;pos++)await env.DB.prepare("INSERT INTO activity_checklist_items(id,checklist_id,label,position) VALUES(?,?,?,?)").bind(id(),listId,items[pos],pos).run();await history(env,activityId,auth.user.id,"checklist_added",title);return json({id:listId},201);}
    if(checklistId&&itemId&&method==="PATCH"){const denied=require(auth,"activities.start");if(denied)return denied;const b=await body(request),checked=bool(b?.checked),item=await one(env.DB,"SELECT i.id FROM activity_checklist_items i JOIN activity_checklists c ON c.id=i.checklist_id WHERE i.id=? AND c.id=? AND c.activity_id=?",itemId,checklistId,activityId);if(!item)return json({error:"Item não encontrado"},404);await env.DB.prepare("UPDATE activity_checklist_items SET checked_at=?,checked_by_id=? WHERE id=?").bind(checked?now():null,checked?auth.user.id:null,itemId).run();await history(env,activityId,auth.user.id,checked?"checklist_item_checked":"checklist_item_unchecked",itemId);return empty();}
  }
  if(path==="/api/requests"&&method==="POST"){
    const contentType=request.headers.get("content-type")||"", form=contentType.includes("multipart/form-data")?await request.formData():null, raw=form?Object.fromEntries(form):await body(request), category=clean(raw?.category),location=clean(raw?.location),description=clean(raw?.description);
    if(!Object.hasOwn(requestTeams,category)||location.length<2||description.length<5)return json({error:"Informe categoria, local e descrição"},400);
    const requestId=id(),created=now(),file=form?.get("photo");let photoKey=null;
    if(file instanceof File){if(!validActivityEvidence(file)||!String(file.type).startsWith("image/"))return json({error:"A foto deve ser uma imagem de até 15 MB"},413);if(!env.BUCKET)return json({error:"R2 não configurado"},503);photoKey=`requests/${requestId}/${id()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"-")}`;await env.BUCKET.put(photoKey,file.stream(),{httpMetadata:{contentType:file.type}});}
    await env.DB.prepare("INSERT INTO requests(id,category,location,description,contact,photo_key,team,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(requestId,category,location,description,clean(raw?.contact)||null,photoKey,requestTeams[category],"pending",created).run();return json({id:requestId,status:"pending"},201);
  }
  if(path==="/api/requests"&&method==="GET"){const denied=require(auth,"activities.create");if(denied)return denied;return json(await rows(env.DB,"SELECT * FROM requests ORDER BY created_at DESC LIMIT 200"));}
  const convertRequest=path.match(/^\/api\/requests\/([^/]+)\/convert$/);if(convertRequest&&method==="POST"){
    const denied=require(auth,"activities.create");if(denied)return denied;const r=await one(env.DB,"SELECT * FROM requests WHERE id=?",convertRequest[1]);if(!r)return json({error:"Solicitação não encontrada"},404);if(r.status!=="pending")return json({error:"Solicitação já foi tratada"},409);const b=await body(request)||{},t=now(),activityId=id(),priority=priorities.has(b.priority)?b.priority:"normal",due=clean(b.dueDate)&&!Number.isNaN(Date.parse(b.dueDate))?new Date(b.dueDate).toISOString():new Date(Date.now()+86400000).toISOString();await env.DB.batch([env.DB.prepare("INSERT INTO activities(id,title,description,team,priority,location,due_date,status,type,requires_evidence,created_by_id,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'pending','one_off',?,?, 'public_request',?,?)").bind(activityId,`Solicitação: ${r.category}`,r.description,r.team,priority,r.location,due,b.requireEvidence?1:0,auth.user.id,t,t),env.DB.prepare("UPDATE requests SET status='converted',activity_id=?,converted_at=?,converted_by_id=? WHERE id=? AND status='pending'").bind(activityId,t,auth.user.id,r.id)]);await history(env,activityId,auth.user.id,"created",`Gerada da solicitação ${r.id}`);return json(await activityView(env,await getActivity(env,activityId)),201);
  }
  const evidenceRead=path.match(/^\/api\/activities\/([^/]+)\/evidence\/([^/]+)$/);
  if (evidenceRead && method==="GET") {
    const denied=require(auth,"activities.evidence"); if (denied) return denied;
    const activity=await getActivity(env,evidenceRead[1]);
    if (!activity || !visible(auth,activity)) return json({error:"Atividade não encontrada"},404);
    const evidence=await one(env.DB,"SELECT * FROM activity_evidence WHERE id=? AND activity_id=?",evidenceRead[2],evidenceRead[1]);
    if (!evidence) return json({error:"Evidência não encontrada"},404);
    const object=await env.BUCKET.get(evidence.r2_key);
    if (!object) return json({error:"Arquivo não encontrado"},404);
    const headers=new Headers(); object.writeHttpMetadata(headers); headers.set("etag",object.httpEtag);
    return new Response(object.body,{headers});
  }
  if (path==="/api/users" && method==="POST") {
    const denied=require(auth,"users.manage"); if (denied) return denied;
    const roleDenied=require(auth,"roles.manage"); if (roleDenied) return roleDenied;
    const b=await body(request), email=clean(b?.email).toLowerCase();
    if (!clean(b?.name) || !email.includes("@") || !clean(b?.roleId) || !validPassword(b?.password)) return json({error:"Dados de usuário inválidos; a senha deve ter ao menos 8 caracteres"},400);
    if (await one(env.DB,"SELECT id FROM users WHERE email=?",email)) return json({error:"Já existe um usuário com este e-mail"},400);
    const role=await one(env.DB,"SELECT * FROM roles WHERE id=?",b.roleId); if (!role) return json({error:"Perfil inválido"},400);
    const team=clean(b.team)||(role.name==="admin"?"ADMIN":"SERVICOS_GERAIS"); if (!teams.has(team)) return json({error:"Equipe inválida"},400);
    const created={id:id(),name:clean(b.name),email,password_hash:await hashPassword(b.password),role_id:role.id,team,active:1,created_at:now(),last_login_at:null,role_name:role.name,role_label:role.label};
    await env.DB.prepare("INSERT INTO users(id,name,email,password_hash,role_id,team,active,created_at) VALUES(?,?,?,?,?,?,1,?)").bind(created.id,created.name,created.email,created.password_hash,created.role_id,created.team,created.created_at).run();
    await audit(env,auth.user.id,"user.created","user",created.id); return json(userView(created),201);
  }
  const userUpdate=path.match(/^\/api\/users\/([^/]+)$/);
  if (userUpdate && method==="PATCH") {
    const denied=require(auth,"users.manage"); if (denied) return denied;
    const current=await one(env.DB,"SELECT u.*,r.name role_name,r.label role_label FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?",userUpdate[1]);
    if (!current) return json({error:"Usuário não encontrado"},404);
    const b=await body(request); if (!b || typeof b!=="object") return json({error:"Dados de usuário inválidos"},400);
    const sets=[],args=[],details={};
    if (Object.hasOwn(b,"name")) { if (clean(b.name).length<2) return json({error:"Nome inválido"},400); sets.push("name=?"); args.push(clean(b.name)); details.name=clean(b.name); }
    if (Object.hasOwn(b,"email")) {
      const email=clean(b.email).toLowerCase(); if (!email.includes("@")) return json({error:"E-mail inválido"},400);
      const existing=await one(env.DB,"SELECT id FROM users WHERE email=? AND id<>?",email,current.id); if (existing) return json({error:"Já existe um usuário com este e-mail"},400);
      sets.push("email=?"); args.push(email); details.email=email;
    }
    if (Object.hasOwn(b,"roleId")) {
      if (!allowed(auth,"roles.manage")) return json({error:"Você não tem permissão para atribuir perfis"},403);
      const role=await one(env.DB,"SELECT * FROM roles WHERE id=?",clean(b.roleId)); if (!role) return json({error:"Perfil inválido"},400);
      if (current.id===auth.user.id && role.id!==current.role_id) return json({error:"Você não pode alterar seu próprio perfil"},400);
      sets.push("role_id=?"); args.push(role.id); details.roleId=role.id;
    }
    if (Object.hasOwn(b,"team")) { const team=clean(b.team); if (!teams.has(team)) return json({error:"Equipe inválida"},400); sets.push("team=?"); args.push(team); details.team=team; }
    if (!sets.length) return json({error:"Nenhuma alteração informada"},400);
    args.push(current.id); await env.DB.prepare(`UPDATE users SET ${sets.join(",")} WHERE id=?`).bind(...args).run();
    await audit(env,auth.user.id,"user.updated","user",current.id,details);
    return json(userView(await one(env.DB,"SELECT u.*,r.name role_name,r.label role_label FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?",current.id)));
  }
  const resetPassword=path.match(/^\/api\/users\/([^/]+)\/reset-password$/);
  if (resetPassword && method==="POST") {
    const denied=require(auth,"users.manage"); if (denied) return denied;
    const roleDenied=require(auth,"roles.manage"); if (roleDenied) return roleDenied;
    const b=await body(request); if (!validPassword(b?.password)) return json({error:"A senha deve ter ao menos 8 caracteres"},400);
    const user=await one(env.DB,"SELECT id FROM users WHERE id=?",resetPassword[1]); if (!user) return json({error:"Usuário não encontrado"},404);
    await env.DB.prepare("UPDATE users SET password_hash=? WHERE id=?").bind(await hashPassword(b.password),user.id).run();
    await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id).run();
    await audit(env,auth.user.id,"user.password_reset","user",user.id); return empty();
  }
  const userPermissions=path.match(/^\/api\/users\/([^/]+)\/permissions$/);
  if (userPermissions && method==="GET") {
    const denied=require(auth,"users.manage"); if (denied) return denied;
    const result=await userAccess(env,userPermissions[1]); return result?json(result):json({error:"Usuário não encontrado"},404);
  }
  if (userPermissions && method==="PUT") {
    const denied=require(auth,"users.manage"); if (denied) return denied;
    const roleDenied=require(auth,"roles.manage"); if (roleDenied) return roleDenied;
    if (!await one(env.DB,"SELECT id FROM users WHERE id=?",userPermissions[1])) return json({error:"Usuário não encontrado"},404);
    const b=await body(request), overrides=b?.overrides;
    if (!Array.isArray(overrides)) return json({error:"Permissões inválidas"},400);
    const ids=overrides.map(item=>item?.permissionId);
    const permissionIds=await validatedPermissionIds(env,ids);
    if (!permissionIds || new Set(ids).size!==ids.length || overrides.some(item=>!["allow","deny"].includes(item?.effect))) return json({error:"Permissões inválidas"},400);
    if (userPermissions[1]===auth.user.id) return json({error:"Você não pode alterar suas próprias exceções de acesso"},400);
    await env.DB.prepare("DELETE FROM user_permissions WHERE user_id=?").bind(userPermissions[1]).run();
    for (const override of overrides)
      await env.DB.prepare("INSERT INTO user_permissions(user_id,permission_id,effect) VALUES(?,?,?)").bind(userPermissions[1],override.permissionId,override.effect).run();
    await audit(env,auth.user.id,"user.permissions_updated","user",userPermissions[1],{overrides});
    return json(await userAccess(env,userPermissions[1]));
  }
  if (path==="/api/roles" && method==="POST") {
    const denied=require(auth,"roles.manage"); if (denied) return denied;
    const b=await body(request), name=clean(b?.name).toLowerCase(), label=clean(b?.label), permissionIds=await validatedPermissionIds(env,b?.permissionIds);
    if (name.length<2 || label.length<2 || !permissionIds) return json({error:"Dados de perfil inválidos"},400);
    if (await one(env.DB,"SELECT id FROM roles WHERE name=?",name)) return json({error:"Já existe um perfil com este nome"},400);
    const roleId=id(); await env.DB.prepare("INSERT INTO roles(id,name,label,created_at) VALUES(?,?,?,?)").bind(roleId,name,label,now()).run();
    await replaceRolePermissions(env,roleId,permissionIds);
    await audit(env,auth.user.id,"role.created","role",roleId,{permissionIds}); return json(await roleAccess(env,roleId),201);
  }
  const roleUpdate=path.match(/^\/api\/roles\/([^/]+)$/);
  if (roleUpdate && method==="PATCH") {
    const denied=require(auth,"roles.manage"); if (denied) return denied;
    const current=await one(env.DB,"SELECT * FROM roles WHERE id=?",roleUpdate[1]); if (!current) return json({error:"Perfil não encontrado"},404);
    const b=await body(request); if (!b || typeof b!=="object") return json({error:"Dados de perfil inválidos"},400);
    const sets=[],args=[],details={};
    if (Object.hasOwn(b,"name")) {
      const name=clean(b.name).toLowerCase(); if (name.length<2) return json({error:"Nome inválido"},400);
      if (current.name==="admin" && name!=="admin") return json({error:"O perfil administrador não pode ser renomeado"},400);
      const existing=await one(env.DB,"SELECT id FROM roles WHERE name=? AND id<>?",name,current.id); if (existing) return json({error:"Já existe um perfil com este nome"},400);
      sets.push("name=?"); args.push(name); details.name=name;
    }
    if (Object.hasOwn(b,"label")) { if (clean(b.label).length<2) return json({error:"Rótulo inválido"},400); sets.push("label=?"); args.push(clean(b.label)); details.label=clean(b.label); }
    if (!sets.length) return json({error:"Nenhuma alteração informada"},400);
    args.push(current.id); await env.DB.prepare(`UPDATE roles SET ${sets.join(",")} WHERE id=?`).bind(...args).run();
    await audit(env,auth.user.id,"role.updated","role",current.id,details); return json(await roleAccess(env,current.id));
  }
  const rolePermissions=path.match(/^\/api\/roles\/([^/]+)\/permissions$/);
  if (rolePermissions && method==="GET") {
    const denied=require(auth,"roles.view"); if (denied) return denied;
    const result=await roleAccess(env,rolePermissions[1]); return result?json(result):json({error:"Perfil não encontrado"},404);
  }
  if (rolePermissions && method==="PUT") {
    const denied=require(auth,"roles.manage"); if (denied) return denied;
    const result=await roleAccess(env,rolePermissions[1]); if (!result) return json({error:"Perfil não encontrado"},404);
    const b=await body(request), permissionIds=await validatedPermissionIds(env,b?.permissionIds); if (!permissionIds) return json({error:"Permissões inválidas"},400);
    if (result.role.name==="admin") {
      const required=await rows(env.DB,"SELECT id FROM permissions WHERE (module='users' AND action='manage') OR (module='roles' AND action='manage')");
      if (required.some(permission=>!permissionIds.includes(permission.id))) return json({error:"O perfil administrador precisa manter users.manage e roles.manage"},400);
    }
    await replaceRolePermissions(env,result.role.id,permissionIds);
    await audit(env,auth.user.id,"role.permissions_updated","role",result.role.id,{permissionIds}); return json(await roleAccess(env,result.role.id));
  }
  const historyMatch=path.match(/^\/api\/activities\/([^/]+)\/history$/);
  if (historyMatch && method==="GET") {
    const denied=require(auth,"activities.view"); if (denied) return denied;
    const activity=await getActivity(env,historyMatch[1]);
    if (!activity || !visible(auth,activity)) return json({error:"Atividade não encontrada"},404);
    const records=await rows(env.DB,"SELECT h.*,u.name performed_by_name,u.email performed_by_email FROM activity_history h JOIN users u ON u.id=h.performed_by_id WHERE h.activity_id=? ORDER BY h.created_at DESC",activity.id);
    return json(records.map(activityHistoryView));
  }
  const evidenceMatch=path.match(/^\/api\/activities\/([^/]+)\/evidence$/);
  if (evidenceMatch) {
    const denied=require(auth,"activities.evidence"); if (denied) return denied;
    const activity=await getActivity(env,evidenceMatch[1]);
    if (!activity || !visible(auth,activity)) return json({error:"Atividade não encontrada"},404);
    if (method==="GET") {
      const records=await rows(env.DB,"SELECT * FROM activity_evidence WHERE activity_id=? ORDER BY created_at DESC",activity.id);
      return json(records.map(record=>activityEvidenceView(record,`${path}/${record.id}`)));
    }
    if (method==="POST") {
      if (!env.BUCKET) return json({error:"R2 não configurado"},503);
      const contentType=request.headers.get("content-type")||"";
      const form=contentType.includes("multipart/form-data") ? await request.formData() : null;
      const file=form?.get("file");
      if (!(file instanceof File)) return json({error:"Envie o arquivo no campo file multipart"},400);
      if (!validActivityEvidence(file)) return json({error:`A evidência deve ser uma imagem ou PDF de até ${Math.floor(MAX_ACTIVITY_EVIDENCE_BYTES/1024/1024)} MB`},413);
      const evidence={id:id(),activity_id:activity.id,r2_key:`activities/${activity.id}/evidence/${id()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"-")}`,filename:file.name,content_type:file.type||null,size:file.size,note:clean(form.get("note"))||null,uploaded_by_id:auth.user.id,created_at:now()};
      await env.BUCKET.put(evidence.r2_key,file.stream(),{httpMetadata:{contentType:file.type||"application/octet-stream"}});
      await env.DB.prepare("INSERT INTO activity_evidence(id,activity_id,r2_key,filename,content_type,size,note,uploaded_by_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(evidence.id,evidence.activity_id,evidence.r2_key,evidence.filename,evidence.content_type,evidence.size,evidence.note,evidence.uploaded_by_id,evidence.created_at).run();
      await history(env,activity.id,auth.user.id,"evidence_uploaded",file.name);
      return json(activityEvidenceView(evidence,`${path}/${evidence.id}`),201);
    }
  }
  if (path==="/api/auth/change-password" && method==="POST") {
    const denied=require(auth,"settings.password"); if (denied) return denied;
    const b=await body(request);
    if (!await verifyPassword(b?.currentPassword||"",auth.user.password_hash)) return json({error:"Senha atual incorreta"},400);
    if (!validPassword(b?.newPassword) || b.newPassword===b.currentPassword) return json({error:"A nova senha deve ter ao menos 8 caracteres e ser diferente da atual"},400);
    await env.DB.prepare("UPDATE users SET password_hash=? WHERE id=?").bind(await hashPassword(b.newPassword),auth.user.id).run();
    await env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND id<>?").bind(auth.user.id,auth.session.id).run();
    await audit(env,auth.user.id,"user.password_changed","user",auth.user.id); return empty();
  }
  if (path==="/api/auth/login" && method==="POST") {
    const b=await body(request), email=clean(b?.email).toLowerCase(), password=b?.password;
    if (!email || typeof password!=="string") return json({error:"Informe um e-mail e uma senha válidos"},400);
    const u=await one(env.DB,"SELECT u.*,r.name role_name,r.label role_label FROM users u JOIN roles r ON r.id=u.role_id WHERE u.email=? AND u.active=1",email);
    if (!u || !await verifyPassword(password,u.password_hash)) return json({error:"E-mail ou senha inválidos"},401);
    const token=crypto.randomUUID()+crypto.randomUUID(), t=now(), expires=new Date(Date.now()+SESSION_TTL_MS).toISOString();
    await env.DB.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?,?)").bind(id(),u.id,await sha256(token),expires,t,t).run();
    await env.DB.prepare("UPDATE users SET last_login_at=? WHERE id=?").bind(t,u.id).run();
    const roleRows=await rows(env.DB,"SELECT p.module,p.action FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=?",u.role_id);
    const loginOverrides=await rows(env.DB,"SELECT p.module,p.action,up.effect FROM user_permissions up JOIN permissions p ON p.id=up.permission_id WHERE up.user_id=?",u.id);
    const loginOverrideMap=Object.fromEntries(loginOverrides.map(p=>[key(p.module,p.action),p.effect]));
    return json({user:userView(u),role:{id:u.role_id,name:u.role_name,label:u.role_label},permissions:effectivePermissions(roleRows.map(p=>key(p.module,p.action)),loginOverrideMap)},200,{"set-cookie":cookie(token)});
  }
  if (path==="/api/auth/logout" && method==="POST") { if(auth) await env.DB.prepare("DELETE FROM sessions WHERE id=?").bind(auth.session.id).run(); return empty(204,{"set-cookie":cookie("",0)}); }
  if (path==="/api/auth/me" && method==="GET") return auth?json({user:userView(auth.user),role:auth.role,permissions:effectivePermissions(auth.permissions,auth.overrides)}):json({error:"Autenticação necessária"},401);
  if(path==="/api/dashboard/summary"&&method==="GET"){const e=require(auth,"dashboard.view");if(e)return e;const a=await rows(env.DB,auth.role.name==="admin"?"SELECT * FROM activities ORDER BY created_at DESC":"SELECT * FROM activities WHERE team=? OR assigned_to_id=? ORDER BY created_at DESC",auth.user.team,auth.user.id);const active=x=>!["completed","cancelled"].includes(x.status), overdue=a.filter(x=>active(x)&&x.due_date&&x.due_date<now()).length;return json({metrics:[["pending","Pendentes",a.filter(x=>x.status==="pending").length,"warning"],["in_progress","Em andamento",a.filter(x=>x.status==="in_progress").length,"info"],["overdue","Atrasadas",overdue,"danger"],["completed","Concluídas",a.filter(x=>x.status==="completed").length,"success"]].map(([key,label,value,tone])=>({key,label,value,tone})),recentActivities:await Promise.all(a.slice(0,5).map(x=>activityView(env,x)))});}
  if(path==="/api/activity-templates"&&method==="GET"){const e=require(auth,"activities.view");if(e)return e;const q=coordinates(auth)?"SELECT * FROM activity_templates":"SELECT * FROM activity_templates WHERE team=? OR assigned_to_id=?",args=coordinates(auth)?[]:[auth.user.team,auth.user.id];return json(await rows(env.DB,q+" ORDER BY active DESC,next_run_at",...args));}
  if(path==="/api/activity-templates"&&method==="POST"){const e=require(auth,"activities.create");if(e)return e;const b=await body(request),team=clean(b?.team),starts=clean(b?.startsAt),kind=clean(b?.recurrenceType),interval=Math.max(1,Number.parseInt(b?.intervalValue,10)||1);if(clean(b?.title).length<3||!teams.has(team)||!priorities.has(b?.priority)||!["daily","weekly","monthly","custom"].includes(kind)||Number.isNaN(Date.parse(starts)))return json({error:"Dados da recorrência inválidos"},400);const assigned=clean(b?.assignedToId)||null,assignmentError=await assigneeError(env,team,assigned);if(assignmentError)return json({error:assignmentError},400);const ends=clean(b?.endsAt)||null;if(ends&&Number.isNaN(Date.parse(ends)))return json({error:"Data final inválida"},400);const t=now(),template={id:id(),title:clean(b.title),description:clean(b.description)||null,team,assigned,priority:b.priority,location:clean(b.location)||null,kind,interval,starts:new Date(starts).toISOString(),ends:ends?new Date(ends).toISOString():null};await env.DB.prepare("INSERT INTO activity_templates(id,title,description,team,assigned_to_id,priority,location,recurrence_type,interval_value,starts_at,ends_at,next_run_at,requires_evidence,created_by_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(template.id,template.title,template.description,team,assigned,template.priority,template.location,kind,interval,template.starts,template.ends,template.starts,bool(b.requiresEvidence)?1:0,auth.user.id,t,t).run();await audit(env,auth.user.id,"activity_template.created","activity_template",template.id);return json(template,201);}
  const templateStatus=path.match(/^\/api\/activity-templates\/([^/]+)\/status$/);if(templateStatus&&method==="PATCH"){const e=require(auth,"activities.update");if(e)return e;const b=await body(request),active=bool(b?.active),t=await one(env.DB,"SELECT * FROM activity_templates WHERE id=?",templateStatus[1]);if(!t||!visible(auth,t))return json({error:"Recorrência não encontrada"},404);await env.DB.prepare("UPDATE activity_templates SET active=?,updated_at=? WHERE id=?").bind(active?1:0,now(),t.id).run();await audit(env,auth.user.id,"activity_template.status_changed","activity_template",t.id,{active});return empty();}
  if(path==="/api/users"&&method==="GET"){const e=require(auth,"users.view");if(e)return e;let q="SELECT u.*,r.name role_name,r.label role_label FROM users u JOIN roles r ON r.id=u.role_id WHERE 1=1", args=[];if(url.searchParams.has("active")){q+=" AND u.active=?";args.push(bool(url.searchParams.get("active"))?1:0)}if(clean(url.searchParams.get("search"))){q+=" AND (u.name LIKE ? OR u.email LIKE ?)";args.push(`%${clean(url.searchParams.get("search"))}%`,`%${clean(url.searchParams.get("search"))}%`)}return json((await rows(env.DB,q+" ORDER BY u.name",...args)).map(userView));}
  const statusMatch=path.match(/^\/api\/users\/([^/]+)\/status$/);if(statusMatch&&method==="PATCH"){const e=require(auth,"users.manage");if(e)return e;const b=await body(request),active=bool(b?.active);if(!active&&statusMatch[1]===auth.user.id)return json({error:"Você não pode desativar seu próprio acesso"},400);const existing=await one(env.DB,"SELECT id FROM users WHERE id=?",statusMatch[1]);if(!existing)return json({error:"Usuário não encontrado"},404);await env.DB.prepare("UPDATE users SET active=? WHERE id=?").bind(active?1:0,statusMatch[1]).run();if(!active)await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(statusMatch[1]).run();const u=await one(env.DB,"SELECT u.*,r.name role_name,r.label role_label FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?",statusMatch[1]);return json(userView(u));}
  if(path==="/api/roles"&&method==="GET"){if(!allowed(auth,"roles.view")&&!allowed(auth,"roles.manage"))return json({error:"Permissão insuficiente"},403);return json(await rows(env.DB,"SELECT * FROM roles ORDER BY label"));}
  if(path==="/api/permissions"&&method==="GET"){if(!allowed(auth,"roles.view")&&!allowed(auth,"roles.manage"))return json({error:"Permissão insuficiente"},403);return json(await rows(env.DB,"SELECT *, module || '.' || action AS key FROM permissions ORDER BY module,action"));}
  if(path==="/api/activities/assignees"&&method==="GET"){
    if(!allowed(auth,"activities.create")&&!allowed(auth,"activities.update"))return json({error:"Você não tem permissão para atribuir atividades"},403);
    const team=clean(url.searchParams.get("team"));
    if(team&&!teams.has(team))return json({error:"Equipe inválida"},400);
    const query=team?"SELECT id,name,team FROM users WHERE active=1 AND team=? ORDER BY name":"SELECT id,name,team FROM users WHERE active=1 ORDER BY name";
    return json(await rows(env.DB,query,...(team?[team]:[])));
  }
  if(path==="/api/activities"&&method==="GET"){
    const e=require(auth,"activities.view");if(e)return e;
    let q=coordinates(auth)?"SELECT * FROM activities WHERE 1=1":"SELECT * FROM activities WHERE (team=? OR assigned_to_id=?)";
    const args=coordinates(auth)?[]:[auth.user.team,auth.user.id];
    const status=clean(url.searchParams.get("status")),team=clean(url.searchParams.get("team")),priority=clean(url.searchParams.get("priority")),source=clean(url.searchParams.get("source")),type=clean(url.searchParams.get("type"));
    if(status){if(!statuses.has(status))return json({error:"Status inválido"},400);q+=" AND status=?";args.push(status)}
    if(team){if(!teams.has(team))return json({error:"Equipe inválida"},400);q+=" AND team=?";args.push(team)}
    if(priority){if(!priorities.has(priority))return json({error:"Prioridade inválida"},400);q+=" AND priority=?";args.push(priority)}
    if(source){if(!sources.has(source))return json({error:"Origem inválida"},400);q+=" AND source=?";args.push(source)}
    if(type){if(!["one_off","recurring"].includes(type))return json({error:"Tipo inválido"},400);q+=" AND type=?";args.push(type)}
    if(clean(url.searchParams.get("assignedToId"))){q+=" AND assigned_to_id=?";args.push(clean(url.searchParams.get("assignedToId")))}
    if(clean(url.searchParams.get("search"))){q+=" AND (title LIKE ? OR description LIKE ? OR location LIKE ?)";const term=`%${clean(url.searchParams.get("search"))}%`;args.push(term,term,term)}
    if(clean(url.searchParams.get("from"))){q+=" AND due_date>=?";args.push(clean(url.searchParams.get("from")))}
    if(clean(url.searchParams.get("to"))){q+=" AND due_date<=?";args.push(clean(url.searchParams.get("to")))}
    if(bool(url.searchParams.get("overdue"))){q+=" AND due_date<? AND status NOT IN ('completed','cancelled')";args.push(now())}
    const page=Math.max(1,Number.parseInt(url.searchParams.get("page")||"1",10)||1),pageSize=Math.min(100,Math.max(1,Number.parseInt(url.searchParams.get("pageSize")||"20",10)||20));
    const total=Number((await one(env.DB,`SELECT COUNT(*) AS n FROM (${q})`,...args))?.n||0);
    const records=await rows(env.DB,q+" ORDER BY due_date,created_at DESC LIMIT ? OFFSET ?",...args,pageSize,(page-1)*pageSize);
    return json({items:await Promise.all(records.map(a=>activityView(env,a))),page,pageSize,total,totalPages:Math.max(1,Math.ceil(total/pageSize))});
  }
  if(path==="/api/activities"&&method==="POST"){
    const e=require(auth,"activities.create");if(e)return e;
    const b=await body(request),team=clean(b?.team),assigned=clean(b?.assignedToId)||null,due=clean(b?.dueDate);
    if(clean(b?.title).length<3||!teams.has(team)||!priorities.has(b?.priority)||!due||Number.isNaN(Date.parse(due)))return json({error:"Dados da atividade inválidos"},400);
    const assignmentError=await assigneeError(env,team,assigned);if(assignmentError)return json({error:assignmentError},400);
    const t=now(),a={id:id(),title:clean(b.title),description:clean(b.description)||null,team,assigned,priority:b.priority,location:clean(b.location)||null,due:new Date(due).toISOString(),evidence:bool(b.requiresEvidence)?1:0};
    await env.DB.prepare("INSERT INTO activities(id,title,description,team,assigned_to_id,priority,location,due_date,requires_evidence,requires_observation,created_by_id,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(a.id,a.title,a.description,a.team,a.assigned,a.priority,a.location,a.due,a.evidence,bool(b.requiresObservation)?1:0,auth.user.id,auth.role.name==="admin"?"admin":"zeladoria",t,t).run();
    await history(env,a.id,auth.user.id,"created","Atividade criada");
    return json(await activityView(env,await getActivity(env,a.id)),201);
  }
  const activityMatch=path.match(/^\/api\/activities\/([^/]+)(?:\/(start|complete|cancel|reopen|reassign|history|evidence))?$/);
  if(activityMatch){
    const [,aid,action]=activityMatch;
    const need=action==="start"?"activities.start":action==="complete"?"activities.complete":action==="cancel"||action==="reopen"||action==="reassign"?"activities.update":action==="evidence"?"activities.evidence":method==="PATCH"?"activities.update":"activities.view";
    const e=require(auth,need);if(e)return e;
    const a=await getActivity(env,aid);if(!a||!visible(auth,a))return json({error:"Atividade não encontrada"},404);
    if(!action&&method==="GET")return json(await activityView(env,a));
    if(action==="history"&&method==="GET"){
      const h=await rows(env.DB,"SELECT h.*,u.name performed_by_name,u.email performed_by_email FROM activity_history h JOIN users u ON u.id=h.performed_by_id WHERE h.activity_id=? ORDER BY h.created_at DESC",aid);
      return json(h.map(activityHistoryView));
    }
    if(!action&&method==="PATCH"){
      if(["completed","cancelled"].includes(a.status))return json({error:"Esta atividade não pode mais ser editada"},409);
      const b=await body(request);if(!b||clean(b.expectedUpdatedAt)!==a.updated_at)return json({error:"A atividade foi alterada por outra pessoa. Recarregue antes de salvar"},409);
      const nextTeam=Object.hasOwn(b,"team")?clean(b.team):a.team,nextAssigned=Object.hasOwn(b,"assignedToId")?(clean(b.assignedToId)||null):a.assigned_to_id;
      if(!teams.has(nextTeam))return json({error:"Equipe inválida"},400);
      const assignmentError=await assigneeError(env,nextTeam,nextAssigned);if(assignmentError)return json({error:assignmentError},400);
      if(Object.hasOwn(b,"priority")&&!priorities.has(b.priority))return json({error:"Prioridade inválida"},400);
      if(Object.hasOwn(b,"title")&&clean(b.title).length<3)return json({error:"Título inválido"},400);
      if(Object.hasOwn(b,"dueDate")&&Number.isNaN(Date.parse(clean(b.dueDate))))return json({error:"Prazo inválido"},400);
      const fields=[["title","title"],["description","description"],["team","team"],["assignedToId","assigned_to_id"],["priority","priority"],["location","location"],["dueDate","due_date"],["requiresEvidence","requires_evidence"]],sets=[],args=[],changed=[];
      for(const [input,col] of fields)if(Object.hasOwn(b,input)){sets.push(`${col}=?`);args.push(col==="requires_evidence"?(bool(b[input])?1:0):col==="assigned_to_id"?(clean(b[input])||null):col==="due_date"?new Date(clean(b[input])).toISOString():typeof b[input]==="string"?clean(b[input]):b[input]);changed.push(input)}
      if(!sets.length)return json(await activityView(env,a));
      const t=now();sets.push("updated_at=?");args.push(t,aid,a.updated_at);
      const result=await env.DB.prepare(`UPDATE activities SET ${sets.join(",")} WHERE id=? AND updated_at=?`).bind(...args).run();
      if(!result.meta?.changes)return json({error:"A atividade foi alterada por outra pessoa. Recarregue antes de salvar"},409);
      await history(env,aid,auth.user.id,"updated",`Campos alterados: ${changed.join(", ")}`);
      return json(await activityView(env,await getActivity(env,aid)));
    }
    if(action==="start"&&method==="POST"){
      if(a.status!=="pending")return json({error:"Somente atividades pendentes podem iniciar"},409);
      if(a.assigned_to_id&&a.assigned_to_id!==auth.user.id&&!coordinates(auth))return json({error:"Esta atividade está atribuída a outra pessoa"},403);
      const t=now(),executor=a.assigned_to_id||(a.team===auth.user.team?auth.user.id:null);
      const result=await env.DB.prepare("UPDATE activities SET status='in_progress',started_at=?,assigned_to_id=?,updated_at=? WHERE id=? AND status='pending'").bind(t,executor,t,aid).run();
      if(!result.meta?.changes)return json({error:"A atividade já foi alterada"},409);
      await history(env,aid,auth.user.id,"started","Atividade iniciada");
      return json(await activityView(env,await getActivity(env,aid)));
    }
    if(action==="complete"&&method==="POST"){
      const b=await body(request);
      if(a.status!=="in_progress")return json({error:"Inicie a atividade antes de concluí-la"},409);
      if(a.assigned_to_id&&a.assigned_to_id!==auth.user.id&&!coordinates(auth))return json({error:"Esta atividade está atribuída a outra pessoa"},403);
      if(a.requires_evidence&&!(await one(env.DB,"SELECT id FROM activity_evidence WHERE activity_id=? LIMIT 1",a.id)))return json({error:"Envie pelo menos uma evidência antes de concluir"},400);
      if(a.requires_observation&&clean(b?.note).length<3)return json({error:"Informe a observação de conclusão"},400);
      const t=now(),result=await env.DB.prepare("UPDATE activities SET status='completed',completed_at=?,completed_by_id=?,updated_at=? WHERE id=? AND status='in_progress'").bind(t,auth.user.id,t,aid).run();
      if(!result.meta?.changes)return json({error:"A atividade já foi alterada"},409);
      await history(env,aid,auth.user.id,"completed",clean(b?.note)||"Atividade concluída");
      await audit(env,auth.user.id,"activity.completed","activity",aid);
      return json(await activityView(env,await getActivity(env,aid)));
    }
    if(action==="reassign"&&method==="POST"){const b=await body(request),assigned=clean(b?.assignedToId)||null,error=await assigneeError(env,a.team,assigned);if(error)return json({error},400);if(a.status==="completed"||a.status==="cancelled")return json({error:"Atividade encerrada não pode ser transferida"},409);await env.DB.prepare("UPDATE activities SET assigned_to_id=?,updated_at=? WHERE id=?").bind(assigned,now(),aid).run();await history(env,aid,auth.user.id,a.assigned_to_id?"reassigned":"assigned",clean(b?.reason)||"Responsável alterado");return json(await activityView(env,await getActivity(env,aid)));}
    if(action==="reopen"&&method==="POST"){const b=await body(request);if(a.status!=="completed")return json({error:"Somente atividades concluídas podem ser reabertas"},409);if(clean(b?.reason).length<3)return json({error:"Informe o motivo da reabertura"},400);const t=now();await env.DB.prepare("UPDATE activities SET status='pending',updated_at=? WHERE id=?").bind(t,aid).run();await history(env,aid,auth.user.id,"reopened",clean(b.reason));await audit(env,auth.user.id,"activity.reopened","activity",aid);return json(await activityView(env,await getActivity(env,aid)));}
    if(action==="cancel"&&method==="POST"){
      const b=await body(request),reason=clean(b?.reason);
      if(reason.length<3)return json({error:"Informe o motivo do cancelamento"},400);
      if(["completed","cancelled"].includes(a.status))return json({error:"Esta atividade não pode ser cancelada"},409);
      const t=now(),result=await env.DB.prepare("UPDATE activities SET status='cancelled',updated_at=? WHERE id=? AND status NOT IN ('completed','cancelled')").bind(t,aid).run();
      if(!result.meta?.changes)return json({error:"A atividade já foi alterada"},409);
      await history(env,aid,auth.user.id,"cancelled",reason);
      return json(await activityView(env,await getActivity(env,aid)));
    }
    if(action==="evidence"){
      if(!env.BUCKET)return json({error:"R2 não configurado"},503);
      if(method==="POST"){
        const type=request.headers.get("content-type")||"",form=type.includes("multipart/form-data")?await request.formData():null,file=form?.get("file");
        if(!(file instanceof File))return json({error:"Envie o arquivo no campo file multipart"},400);
        if(!validActivityEvidence(file))return json({error:`A evidência deve ser uma imagem ou PDF de até ${Math.floor(MAX_ACTIVITY_EVIDENCE_BYTES/1024/1024)} MB`},413);
        const eid=id(),r2=`activities/${aid}/evidence/${eid}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"-")}`;
        await env.BUCKET.put(r2,file.stream(),{httpMetadata:{contentType:file.type||"application/octet-stream"}});
        await env.DB.prepare("INSERT INTO activity_evidence(id,activity_id,r2_key,filename,content_type,size,note,uploaded_by_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(eid,aid,r2,file.name,file.type||null,file.size,clean(form.get("note"))||null,auth.user.id,now()).run();
        await history(env,aid,auth.user.id,"evidence_uploaded",file.name);
        return json({id:eid,r2Key:r2},201);
      }
      if(method==="GET")return json(await rows(env.DB,"SELECT * FROM activity_evidence WHERE activity_id=? ORDER BY created_at DESC",aid));
    }
  }
  return null;
}
}
export default { async scheduled(_event,env,ctx) { ctx.waitUntil((async()=>{await initialize(env);await generateOccurrences(env);})()); }, async fetch(request,env) {
  try {
    const url=new URL(request.url), path=url.pathname;
    if (path==="/solicitar") return serveV11Asset(request,env,url,"v11-request.html");
    const routedPath=path.startsWith("/legacy/") ? path.slice("/legacy".length) : path;
    const canonicalPath=v11CanonicalPath(routedPath);
    if (path==="/sw.js") {
      const asset=await serveV11Asset(request,env,url,"v11-sw.js");
      const headers=new Headers(asset.headers);
      headers.set("cache-control","no-store"); headers.set("Service-Worker-Allowed","/");
      return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers});
    }
    const staticPermission=staticModulePermission(routedPath), v11Page=v11Pages[canonicalPath];
    // Only the public request *submission* bypasses authentication. The same
    // endpoint remains protected for the operational request listing (GET).
    const isPublicRequestSubmission=path==="/api/requests" && request.method==="POST";
    const needsIdentity=(path.startsWith("/api/") && path!=="/api/health" && !isPublicRequestSubmission) || !!staticPermission || canonicalPath==="/" || !!v11Page;
    let auth=null;
    if (needsIdentity) { await initialize(env); auth=await context(request,env); }
    if (routedPath==="/index.html") {
      return withRenewedSession(Response.redirect(new URL("/dashboard",url),302),auth);
    }
    if (path.startsWith("/api/files/") && request.method==="GET") {
      let decodedKey; try { decodedKey=decodeURIComponent(path.slice("/api/files/".length)); } catch { return json({error:"Arquivo não encontrado"},404); }
      const permission=await legacyFilePermission(env,decodedKey);
      if (!permission) return json({error:"Arquivo não encontrado"},404);
      const denied=require(auth,permission); if (denied) return denied;
      return withRenewedSession(await legacyWorker.fetch(request,env),auth);
    }
    const redirect=v11Redirect(canonicalPath,!!auth);
    if (redirect) return withRenewedSession(Response.redirect(new URL(redirect,url),302),auth);
    if (v11Page) {
      const pagePermissions=v11PagePermissions(canonicalPath);
      if (pagePermissions.length && !pagePermissions.some(permission=>allowed(auth,permission))) return auth?json({error:"Acesso negado"},403):json({error:"Autenticação necessária"},401);
      return withRenewedSession(await serveV11Asset(request,env,url,v11Page),auth);
    }
    if (staticPermission) {
      const denied=require(auth,staticPermission); if (denied) return denied;
      if (routedPath!==path) {
        const target=new URL(url); target.pathname=routedPath;
        return withRenewedSession(Response.redirect(target,302),auth);
      }
    }
    const response=await v11(request,env,url,auth);
    if (response) {
      if (auth && response.ok) {
        const status=path.match(/^\/api\/users\/([^/]+)\/status$/);
        const transition=path.match(/^\/api\/activities\/([^/]+)\/(start|cancel)$/);
        if (status && request.method==="PATCH") await audit(env,auth.user.id,"user.status_changed","user",status[1]);
        if (transition && request.method==="POST") await audit(env,auth.user.id,transition[2]==="start"?"activity.started":"activity.cancelled","activity",transition[1]);
      }
      return withRenewedSession(response,auth);
    }
    const legacy=routePermission(path,request.method);
    if(legacy){const denied=require(auth,legacy);if(denied)return denied;}
    return withRenewedSession(await legacyWorker.fetch(request,env),auth);
  } catch(error) { console.error(error); return json({error:"Erro interno."},500); }
} };
