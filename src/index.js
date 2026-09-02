import { assertSameOrigin, handleError, json } from './http.js';
import { currentUser, requireModule, requireUser } from './access.js';
import {
  accessConfig, authStatus, changePassword, createUser, listUsers, login, logout, me,
  resetUserPassword, setup, updateRoutingRules, updateTeamModules, updateUser
} from './auth-api.js';
import {
  activityDashboard, activityDiary, activityOptions, addActivityEvidence, cancelActivity, completeActivity,
  createActivity, downloadActivityEvidence, getActivity, homeData, listActivities, recordActivityToolResult,
  startActivity, syncOperations, validateActivityToolLink
} from './activities-api.js';
import {
  createRecurrence, generateDueRecurrences, listRecurrences, recurrenceOptions, setRecurrenceStatus
} from './recurrences-api.js';
import {
  convertRequest, createPublicRequest, downloadRequestPhoto, listRequests, publicRequestOptions
} from './requests-api.js';
import {
  createRateioSubmission, getRateioSubmission, listRateioSubmissions, updateRateioSubmission
} from './rateio-submissions-api.js';

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const num = (v, fallback = null) => {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
};
const safeName = (v='arquivo') => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(0,120);
const normalizeCommonAreaName = value => String(value || '').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
const COMMON_AREA_NAMES = new Set(['salao 1','salao 2','academia']);
const COMMON_AREA_ALIASES = new Map([['saloes 1','salao 1'],['saloes 2','salao 2']]);
const isCommonAreaReading = code => {
  const value = normalizeCommonAreaName(code);
  return COMMON_AREA_NAMES.has(value) || COMMON_AREA_NAMES.has(COMMON_AREA_ALIASES.get(value));
};


async function requireDb(env) {
  if (!env.DB || !env.BUCKET) throw new Error('D1/R2 ainda não configurados no Worker.');
}

async function runInBatches(env, statements, size = 50) {
  for (let index = 0; index < statements.length; index += size) {
    await env.DB.batch(statements.slice(index, index + size));
  }
}

async function upsertCollection(env, payload, user) {
  const t = now();
  const source = String(payload.sourceReportId || payload.id || id());
  const existing = await env.DB.prepare('SELECT * FROM collection_reports WHERE source_report_id = ?').bind(source).first();
  const reportId = existing?.id || id();
  await env.DB.prepare(`INSERT INTO collection_reports
    (id,source_report_id,name,condominium,location,service,technician,report_date,notes,pdf_key,created_at,updated_at,activity_id,submitted_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(source_report_id) DO UPDATE SET
      name=excluded.name, condominium=excluded.condominium, location=excluded.location,
      service=excluded.service, technician=excluded.technician, report_date=excluded.report_date,
      notes=excluded.notes, activity_id=COALESCE(excluded.activity_id,collection_reports.activity_id),
      submitted_by=COALESCE(collection_reports.submitted_by,excluded.submitted_by),updated_at=excluded.updated_at`).bind(
        reportId, source, payload.name||'', payload.client||'', payload.location||'', payload.service||'',
        payload.technician||'', payload.reportDate||'', payload.notes||'', existing?.pdf_key||null,
        existing?.created_at||t, t, payload.activityId||null, user.id).run();
  return { reportId, sourceReportId: source };
}

async function syncLeiturista(request, env, user) {
  await requireDb(env);
  assertSameOrigin(request);
  const payload = await request.json();
  await validateActivityToolLink(env,user,{activityId:payload.activityId,toolCode:'leiturista'});
  const { reportId } = await upsertCollection(env, payload, user);
  const readings = Array.isArray(payload.readings) ? payload.readings : [];
  const results = {};
  for (const utility of ['gas','water']) {
    const utilityReadings = readings.filter(r => r.utility === utility);
    if (!utilityReadings.length) continue;
    const reference = payload.reference || payload.reportDate || new Date().toISOString().slice(0,7);
    const existing = await env.DB.prepare('SELECT * FROM cycles WHERE report_id=? AND utility=?').bind(reportId, utility).first();
    const cycleId = existing?.id || id();
    const t = now();
    await env.DB.prepare(`INSERT INTO cycles
      (id,report_id,utility,reference,status,invoice_consumption,total_value,conversion_factor,units_per_block,condo_consumption,notes,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?, ?,?)
      ON CONFLICT(report_id,utility) DO UPDATE SET reference=excluded.reference,updated_at=excluded.updated_at`).bind(
      cycleId, reportId, utility, reference, existing?.status || 'OPEN', existing?.invoice_consumption ?? null,
      existing?.total_value ?? 0, utility === 'gas' ? 2.2 : 1, existing?.units_per_block ?? 16,
      existing?.condo_consumption ?? 0, existing?.notes || '', existing?.created_at || t, t).run();
    if ((existing?.status || 'OPEN') === 'OPEN') {
      const missingPrevious = [...new Set(utilityReadings
        .filter(r => num(r.previous) === null).map(r => String(r.blockCode || ''))
        .filter(Boolean))];
      const previousByBlock = new Map();
      if (missingPrevious.length) {
        const marks = missingPrevious.map(() => '?').join(',');
        const priorRows = await env.DB.prepare(`SELECT rr.block_code,rr.current_value
          FROM readings rr JOIN cycles pc ON pc.id=rr.cycle_id
          WHERE pc.utility=? AND pc.status='CLOSED' AND rr.block_code IN (${marks})
          ORDER BY pc.closed_at DESC`).bind(utility, ...missingPrevious).all();
        for (const prior of priorRows.results || []) {
          if (!previousByBlock.has(prior.block_code)) previousByBlock.set(prior.block_code, prior.current_value);
        }
      }
      const readingStatements = [];
      for (const r of utilityReadings) {
        let previous = num(r.previous);
        const current = num(r.current);
        if (previous === null) previous = previousByBlock.get(String(r.blockCode || '')) ?? null;
        const measured = previous !== null && current !== null ? current - previous : null;
        const rid = id();
        readingStatements.push(env.DB.prepare(`INSERT INTO readings
          (id,cycle_id,block_code,previous_value,current_value,measured_value,corrected,correction_reason,source_group_id,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(cycle_id,block_code) DO UPDATE SET
            previous_value=excluded.previous_value,current_value=excluded.current_value,
            measured_value=excluded.measured_value,source_group_id=excluded.source_group_id,updated_at=excluded.updated_at
          WHERE readings.corrected=0 AND readings.excluded=0`).bind(
            rid, cycleId, String(r.blockCode||''), previous, current, measured, 0, null, r.sourceGroupId||null, t));
      }
      await runInBatches(env, readingStatements);
    }
    results[utility] = cycleId;
  }
  const activity = await recordActivityToolResult(env,user,{
    activityId:payload.activityId,toolCode:'leiturista',recordType:'collection_report',recordId:reportId
  });
  return json({ ok:true, reportId, cycles:results, activity });
}


async function syncRonda(request, env, user) {
  await requireDb(env);
  assertSameOrigin(request);
  const form = await request.formData();
  let payload;
  try { payload = JSON.parse(String(form.get('payload') || '{}')); } catch { return json({error:'Dados da ronda inválidos.'},400); }
  if (!payload.id) return json({error:'Ronda sem identificador.'},400);
  await validateActivityToolLink(env,user,{activityId:payload.activityId,toolCode:'ronda'});
  const t=now();
  const existing=await env.DB.prepare('SELECT id FROM ronda_sessions WHERE source_local_id=?').bind(String(payload.id)).first();
  const sessionId=existing?.id || id();
  if(existing){
    await env.DB.prepare(`UPDATE ronda_sessions SET started_at=?,ended_at=?,vigilante=?,notes=?,
      activity_id=COALESCE(?,activity_id),submitted_by=COALESCE(submitted_by,?),updated_at=? WHERE id=?`)
      .bind(payload.startedAt||t,payload.endedAt||null,payload.vigilante||'',payload.notes||'',payload.activityId||null,user.id,t,sessionId).run();
  } else {
    await env.DB.prepare(`INSERT INTO ronda_sessions(id,started_at,ended_at,vigilante,notes,source_local_id,created_at,updated_at,activity_id,submitted_by)
      VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .bind(sessionId,payload.startedAt||t,payload.endedAt||null,payload.vigilante||'',payload.notes||'',String(payload.id),t,t,payload.activityId||null,user.id).run();
  }
  const points=Array.isArray(payload.points)?payload.points:[];
  const files=form.getAll('photos');
  let photoMeta=[]; try{photoMeta=JSON.parse(String(form.get('photoMeta')||'[]'));}catch{}
  const previousPoints = await env.DB.prepare('SELECT point_order,evidence_key FROM ronda_checkpoints WHERE session_id=?')
    .bind(sessionId).all();
  const evidenceByOrder = new Map((previousPoints.results || []).map(row => [Number(row.point_order), row.evidence_key]));
  const checkpointStatements=[];
  for(let i=0;i<points.length;i++){
    const point=points[i]||{};
    let evidenceKey=null;
    const fileIndex=photoMeta.findIndex(item=>Number(item?.index)===i);
    const file=fileIndex>=0?files[fileIndex]:null;
    if(file instanceof File && file.size){
      evidenceKey=`ronda/${sessionId}/${String(i).padStart(3,'0')}-${safeName(file.name||'evidencia.jpg')}`;
      await env.BUCKET.put(evidenceKey,file.stream(),{httpMetadata:{contentType:file.type||'image/jpeg'}});
    } else evidenceKey=evidenceByOrder.get(i)||null;
    checkpointStatements.push(env.DB.prepare(`INSERT INTO ronda_checkpoints
      (id,session_id,point_order,point_name,checked_at,status,occurrence,evidence_key,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(session_id,point_order) DO UPDATE SET
      point_name=excluded.point_name,checked_at=excluded.checked_at,status=excluded.status,
      occurrence=excluded.occurrence,evidence_key=COALESCE(excluded.evidence_key,ronda_checkpoints.evidence_key),updated_at=excluded.updated_at`)
      .bind(id(),sessionId,i,String(point.name||''),point.at||null,point.hasPhoto?'CHECKED':'PENDING',point.occurrence||null,evidenceKey,t,t));
  }
  await runInBatches(env,checkpointStatements);
  const activity=await recordActivityToolResult(env,user,{
    activityId:payload.activityId,toolCode:'ronda',recordType:'ronda_session',recordId:sessionId
  });
  return json({ok:true,sessionId,points:points.length,activity});
}

async function adminRondaList(request, env) {
  await requireDb(env);
  const url=new URL(request.url); const from=url.searchParams.get('from'); const to=url.searchParams.get('to'); const vigilante=url.searchParams.get('vigilante');
  let q=`SELECT s.id,s.started_at,s.ended_at,s.vigilante,s.notes,s.source_local_id,
    COUNT(c.id) AS total_points,
    SUM(CASE WHEN c.status='CHECKED' THEN 1 ELSE 0 END) AS checked_points,
    SUM(CASE WHEN c.occurrence IS NOT NULL AND TRIM(c.occurrence)<>'' THEN 1 ELSE 0 END) AS occurrences
    FROM ronda_sessions s LEFT JOIN ronda_checkpoints c ON c.session_id=s.id WHERE 1=1`;
  const args=[]; if(from){q+=' AND date(s.started_at)>=date(?)';args.push(from)} if(to){q+=' AND date(s.started_at)<=date(?)';args.push(to)} if(vigilante){q+=' AND lower(s.vigilante) LIKE lower(?)';args.push('%'+vigilante+'%')}
  q+=' GROUP BY s.id ORDER BY s.started_at DESC';
  const rows=await env.DB.prepare(q).bind(...args).all(); return json(rows.results||[]);
}
async function adminRondaDetail(request, env, sessionId){
  await requireDb(env); const s=await env.DB.prepare('SELECT * FROM ronda_sessions WHERE id=?').bind(sessionId).first(); if(!s)return json({error:'Ronda não encontrada.'},404);
  const pts=await env.DB.prepare('SELECT * FROM ronda_checkpoints WHERE session_id=? ORDER BY point_order').bind(sessionId).all();
  return json({...s,checkpoints:pts.results||[]});
}



async function syncFiscalizacao(request, env, user) {
  await requireDb(env);
  assertSameOrigin(request);
  const form = await request.formData();
  let payload;
  try { payload = JSON.parse(String(form.get('payload') || '{}')); } catch { return json({error:'Dados da fiscalização inválidos.'},400); }
  if (!payload.id) return json({error:'Fiscalização sem identificador.'},400);
  await validateActivityToolLink(env,user,{activityId:payload.activityId,toolCode:'inspection'});
  const t=now();
  const existing=await env.DB.prepare('SELECT id FROM fiscalizacao_reports WHERE source_local_id=?').bind(String(payload.id)).first();
  const reportId=existing?.id || id();
  if(existing){
    await env.DB.prepare(`UPDATE fiscalizacao_reports SET report_type=?,name=?,report_date=?,inspector=?,notes=?,
      activity_id=COALESCE(?,activity_id),submitted_by=COALESCE(submitted_by,?),updated_at=? WHERE id=?`)
      .bind(payload.reportType||'Fiscalização de Unidades',payload.name||'',payload.reportDate||'',payload.inspector||'',payload.notes||'',payload.activityId||null,user.id,t,reportId).run();
  } else {
    await env.DB.prepare(`INSERT INTO fiscalizacao_reports(id,report_type,name,report_date,inspector,notes,source_local_id,created_at,updated_at,activity_id,submitted_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(reportId,payload.reportType||'Fiscalização de Unidades',payload.name||'',payload.reportDate||'',payload.inspector||'',payload.notes||'',String(payload.id),t,t,payload.activityId||null,user.id).run();
  }
  const items=Array.isArray(payload.items)?payload.items:[];
  const files=form.getAll('photos');
  let meta=[]; try{meta=JSON.parse(String(form.get('photoMeta')||'[]'));}catch{}
  const metaByPhoto = new Map(meta.map(row => [`${row.itemId}:${Number(row.photoIndex)}`, row]));
  const existingItems = await env.DB.prepare('SELECT id,source_local_id FROM fiscalizacao_items WHERE report_id=?').bind(reportId).all();
  const itemBySource = new Map((existingItems.results || []).map(row => [String(row.source_local_id), row.id]));
  const existingEvidence = await env.DB.prepare(`SELECT e.r2_key FROM fiscalizacao_evidences e
    JOIN fiscalizacao_items i ON i.id=e.item_id WHERE i.report_id=?`).bind(reportId).all();
  const evidenceKeys = new Set((existingEvidence.results || []).map(row => row.r2_key));
  const itemStatements=[], evidenceStatements=[];
  for(const old of items){
    const sourceId=String(old.id), itemId=itemBySource.get(sourceId)||id();
    if(itemBySource.has(sourceId)){
      itemStatements.push(env.DB.prepare(`UPDATE fiscalizacao_items SET block=?,unit=?,category=?,description=?,updated_at=? WHERE id=?`)
        .bind(old.block||'',old.unit||'',old.category||'',old.description||'',t,itemId));
    } else {
      itemStatements.push(env.DB.prepare(`INSERT INTO fiscalizacao_items(id,report_id,block,unit,category,description,source_local_id,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?)`)
        .bind(itemId,reportId,old.block||'',old.unit||'',old.category||'',old.description||'',sourceId,t,t));
    }
    const itemPhotos=Array.isArray(old.photos)?old.photos:[];
    for(let j=0;j<itemPhotos.length;j++){
      const p=itemPhotos[j]||{}; const m=metaByPhoto.get(`${old.id}:${j}`);
      const fileIndex=m?Number(m.fileIndex):-1; const file=fileIndex>=0?files[fileIndex]:null;
      if(file instanceof File && file.size){
        const key=`fiscalizacao/${reportId}/${itemId}/${p.id||j}-${safeName(file.name||'evidencia.jpg')}`;
        if(!evidenceKeys.has(key)) {
          await env.BUCKET.put(key,file.stream(),{httpMetadata:{contentType:file.type||'image/jpeg'}});
          evidenceKeys.add(key);
          evidenceStatements.push(env.DB.prepare('INSERT INTO fiscalizacao_evidences(id,item_id,r2_key,filename,content_type,size,note,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id(),itemId,key,file.name||'evidencia.jpg',file.type||'image/jpeg',file.size,p.note||'',t));
        }
      }
    }
  }
  await runInBatches(env,itemStatements);
  await runInBatches(env,evidenceStatements);
  const activity=await recordActivityToolResult(env,user,{
    activityId:payload.activityId,toolCode:'inspection',recordType:'fiscalizacao_report',recordId:reportId
  });
  return json({ok:true,reportId,items:items.length,activity});
}

async function adminFiscalizacaoList(request, env) {
  await requireDb(env);
  const u=new URL(request.url),from=u.searchParams.get('from'),to=u.searchParams.get('to'),inspector=u.searchParams.get('inspector'),category=u.searchParams.get('category');
  let q=`SELECT r.id,r.name,r.report_date,r.inspector,r.notes,
    COUNT(DISTINCT i.id) items_count,COUNT(e.id) evidence_count,
    COUNT(DISTINCT CASE WHEN TRIM(COALESCE(i.block,''))<>'' THEN i.block END) blocks_count
    FROM fiscalizacao_reports r LEFT JOIN fiscalizacao_items i ON i.report_id=r.id LEFT JOIN fiscalizacao_evidences e ON e.item_id=i.id WHERE 1=1`;
  const a=[]; if(from){q+=' AND date(r.report_date)>=date(?)';a.push(from)} if(to){q+=' AND date(r.report_date)<=date(?)';a.push(to)} if(inspector){q+=' AND lower(r.inspector) LIKE lower(?)';a.push('%'+inspector+'%')} if(category){q+=' AND i.category=?';a.push(category)}
  q+=' GROUP BY r.id ORDER BY r.report_date DESC,r.updated_at DESC'; const rows=await env.DB.prepare(q).bind(...a).all(); return json(rows.results||[]);
}
async function adminFiscalizacaoDetail(request, env, reportId){
  await requireDb(env); const r=await env.DB.prepare('SELECT * FROM fiscalizacao_reports WHERE id=?').bind(reportId).first(); if(!r)return json({error:'Fiscalização não encontrada.'},404);
  const items=await env.DB.prepare('SELECT * FROM fiscalizacao_items WHERE report_id=? ORDER BY CAST(block AS INTEGER),block,unit').bind(reportId).all();
  const evid=await env.DB.prepare(`SELECT e.*,i.block,i.unit,i.category FROM fiscalizacao_evidences e JOIN fiscalizacao_items i ON i.id=e.item_id WHERE i.report_id=? ORDER BY e.created_at`).bind(reportId).all();
  return json({...r,items:items.results||[],evidences:evid.results||[]});
}


async function syncDiario(request, env, user) {
  await requireDb(env);
  assertSameOrigin(request);
  const form = await request.formData();
  let payload;
  try { payload = JSON.parse(String(form.get('payload') || '{}')); } catch { return json({error:'Dados do diário inválidos.'},400); }
  if (!payload.id) return json({error:'Diário sem identificador.'},400);
  await validateActivityToolLink(env,user,{activityId:payload.activityId,toolCode:'diary'});
  const t=now();
  const existing=await env.DB.prepare('SELECT id FROM diario_reports WHERE source_local_id=?').bind(String(payload.id)).first();
  const reportId=existing?.id || id();
  if(existing){
    await env.DB.prepare(`UPDATE diario_reports SET employee=?,started_at=?,ended_at=?,general_notes=?,
      activity_id=COALESCE(?,activity_id),submitted_by=COALESCE(submitted_by,?),updated_at=? WHERE id=?`)
      .bind(payload.employee||'',payload.startedAt||null,payload.endedAt||null,payload.generalNotes||'',payload.activityId||null,user.id,t,reportId).run();
  } else {
    await env.DB.prepare(`INSERT INTO diario_reports(id,employee,started_at,ended_at,general_notes,source_local_id,created_at,updated_at,activity_id,submitted_by)
      VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .bind(reportId,payload.employee||'',payload.startedAt||null,payload.endedAt||null,payload.generalNotes||'',String(payload.id),t,t,payload.activityId||null,user.id).run();
  }
  const services=Array.isArray(payload.services)?payload.services:[];
  const files=form.getAll('photos');
  let meta=[]; try{meta=JSON.parse(String(form.get('photoMeta')||'[]'));}catch{}
  for(const old of services){
    const existingSvc=await env.DB.prepare('SELECT id FROM diario_services WHERE report_id=? AND source_local_id=?').bind(reportId,String(old.id)).first().catch(()=>null);
    const serviceId=existingSvc?.id||id();
    // source_local_id é adicionado pela migration 0007 em bancos mais antigos.
    if(existingSvc){
      await env.DB.prepare(`UPDATE diario_services SET title=?,location=?,notes=?,updated_at=? WHERE id=?`)
        .bind(old.title||'',old.location||'',old.notes||'',t,serviceId).run();
    } else {
      await env.DB.prepare(`INSERT INTO diario_services(id,report_id,title,location,notes,source_local_id,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?)`)
        .bind(serviceId,reportId,old.title||'',old.location||'',old.notes||'',String(old.id),t,t).run();
    }
    await env.DB.prepare('DELETE FROM diario_materials WHERE service_id=?').bind(serviceId).run();
    for(const m of (Array.isArray(old.materials)?old.materials:[])){
      await env.DB.prepare('INSERT INTO diario_materials(id,service_id,name,qty,unit,created_at) VALUES(?,?,?,?,?,?)').bind(id(),serviceId,m.name||'',m.qty||'',m.unit||'',t).run();
    }
    const photos=Array.isArray(old.photos)?old.photos:[];
    for(let j=0;j<photos.length;j++){
      const p=photos[j]||{}, mm=meta.find(x=>x.serviceId===old.id&&Number(x.photoIndex)===j), fileIndex=mm?Number(mm.fileIndex):-1, file=fileIndex>=0?files[fileIndex]:null;
      if(file instanceof File && file.size){
        const key=`diario/${reportId}/${serviceId}/${p.id||j}-${safeName(file.name||'evidencia.jpg')}`;
        await env.BUCKET.put(key,file.stream(),{httpMetadata:{contentType:file.type||'image/jpeg'}});
        const exists=await env.DB.prepare('SELECT id FROM diario_evidences WHERE service_id=? AND r2_key=?').bind(serviceId,key).first();
        if(!exists) await env.DB.prepare(`INSERT INTO diario_evidences(id,service_id,r2_key,filename,content_type,size,taken_at,time_verified,source,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(id(),serviceId,key,file.name||'evidencia.jpg',file.type||'image/jpeg',file.size,p.takenAtIso||null,p.timeVerified?1:0,p.source||'',p.note||'',t).run();
      }
    }
  }
  const activity=await recordActivityToolResult(env,user,{
    activityId:payload.activityId,toolCode:'diary',recordType:'diario_report',recordId:reportId
  });
  return json({ok:true,reportId,services:services.length,activity});
}

async function adminDiarioList(request, env) {
  await requireDb(env);
  const u=new URL(request.url),from=u.searchParams.get('from'),to=u.searchParams.get('to'),employee=u.searchParams.get('employee'),location=u.searchParams.get('location');
  let q=`SELECT r.id,r.employee,r.started_at,r.ended_at,r.general_notes,
    COUNT(DISTINCT s.id) services_count,COUNT(DISTINCT m.id) materials_count,COUNT(e.id) evidence_count
    FROM diario_reports r LEFT JOIN diario_services s ON s.report_id=r.id LEFT JOIN diario_materials m ON m.service_id=s.id LEFT JOIN diario_evidences e ON e.service_id=s.id WHERE 1=1`;
  const a=[];
  if(from){q+=' AND date(r.started_at)>=date(?)';a.push(from)} if(to){q+=' AND date(r.started_at)<=date(?)';a.push(to)}
  if(employee){q+=' AND lower(r.employee) LIKE lower(?)';a.push('%'+employee+'%')} if(location){q+=' AND lower(COALESCE(s.location,\'\')) LIKE lower(?)';a.push('%'+location+'%')}
  q+=' GROUP BY r.id ORDER BY r.started_at DESC,r.updated_at DESC';
  const rows=await env.DB.prepare(q).bind(...a).all(); return json(rows.results||[]);
}
async function adminDiarioDetail(request, env, reportId) {
  await requireDb(env);
  const r=await env.DB.prepare('SELECT * FROM diario_reports WHERE id=?').bind(reportId).first(); if(!r)return json({error:'Diário não encontrado.'},404);
  const services=await env.DB.prepare('SELECT * FROM diario_services WHERE report_id=? ORDER BY created_at').bind(reportId).all();
  const materials=await env.DB.prepare(`SELECT m.*,s.title AS service_title FROM diario_materials m JOIN diario_services s ON s.id=m.service_id WHERE s.report_id=? ORDER BY m.created_at`).bind(reportId).all();
  const evid=await env.DB.prepare(`SELECT e.*,s.title AS service_title,s.location FROM diario_evidences e JOIN diario_services s ON s.id=e.service_id WHERE s.report_id=? ORDER BY e.created_at`).bind(reportId).all();
  return json({...r,services:services.results||[],materials:materials.results||[],evidences:evid.results||[]});
}

async function uploadEvidence(request, env, cycleId) {
  await requireDb(env);
  const cycle = await env.DB.prepare('SELECT * FROM cycles WHERE id=?').bind(cycleId).first();
  if (!cycle) return json({error:'Ciclo não encontrado.'},404);
  const form = await request.formData();
  const reportId = cycle.report_id;
  const t = now();
  const pdf = form.get('pdf');
  if (pdf instanceof File) {
    const key = `reports/${reportId}/evidence-${Date.now()}.pdf`;
    await env.BUCKET.put(key, pdf.stream(), { httpMetadata:{contentType:'application/pdf'} });
    await env.DB.prepare('UPDATE collection_reports SET pdf_key=?,updated_at=? WHERE id=?').bind(key,t,reportId).run();
  }
  const photos = form.getAll('photos');
  let photoMeta = [];
  try { photoMeta = JSON.parse(String(form.get('photoMeta') || '[]')); } catch {}
  for (let i = 0; i < photos.length; i++) {
    const file = photos[i];
    if (!(file instanceof File) || !file.size) continue;
    const meta = photoMeta[i] || {};
    const utility = String(meta.utility || cycle.utility);
    const meter = String(meta.meter || '');
    const blockCode = String(meta.blockCode || '');
    const reading = blockCode ? await env.DB.prepare('SELECT id FROM readings WHERE cycle_id=? AND block_code=?').bind(cycleId,blockCode).first() : null;
    const key = `reports/${reportId}/${utility}/${cycleId}/${id()}-${safeName(file.name)}`;
    await env.BUCKET.put(key, file.stream(), { httpMetadata:{contentType:file.type || 'image/jpeg'} });
    await env.DB.prepare(`INSERT INTO evidences
      (id,report_id,cycle_id,reading_id,utility,meter,r2_key,filename,content_type,size,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id(),reportId,cycleId,reading?.id||null,utility,meter,key,file.name,file.type||'image/jpeg',file.size,t).run();
  }
  return json({ok:true});
}

function calculate(cycle, readings, costs) {
  const items = costs || [];
  const totalValue = items.reduce((s,x)=>s+Number(x.amount||0),0) || Number(cycle.total_value||0);
  const factor = Number(cycle.conversion_factor||1);
  const measured = readings.map(r => ({
    ...r,
    is_common_area: isCommonAreaReading(r.block_code),
    delta: Number(r.measured_value||0),
    converted: Number(r.measured_value||0)*factor
  }));
  const blockReadings = measured.filter(r=>!r.is_common_area);
  const commonReadings = measured.filter(r=>r.is_common_area);
  const blockSum = blockReadings.reduce((s,r)=>s+r.converted,0);
  const commonSum = commonReadings.reduce((s,r)=>s+r.converted,0);
  const sum = blockSum + commonSum;
  const invoiceConsumption = Number(cycle.invoice_consumption||0);
  const denominator = cycle.utility === 'water' && invoiceConsumption > 0 ? invoiceConsumption : sum;
  const condo = commonSum;
  return {
    totalValue, factor, measured, blockReadings, commonReadings,
    sum, blockSum, commonSum, invoiceConsumption, condo,
    consumerPool: blockSum, denominator
  };
}

async function getCycle(env, cycleId) {
  const cycle = await env.DB.prepare('SELECT * FROM cycles WHERE id=?').bind(cycleId).first();
  if (!cycle) return null;
  const readings = await env.DB.prepare('SELECT * FROM readings WHERE cycle_id=? AND excluded=0 ORDER BY CAST(block_code AS INTEGER), block_code').bind(cycleId).all();
  const costs = await env.DB.prepare('SELECT * FROM cost_items WHERE cycle_id=? ORDER BY created_at').bind(cycleId).all();
  const evidences = await env.DB.prepare('SELECT id,utility,meter,r2_key,filename,content_type,size,created_at FROM evidences WHERE cycle_id=? ORDER BY created_at').bind(cycleId).all();
  const report=await env.DB.prepare('SELECT pdf_key FROM collection_reports WHERE id=?').bind(cycle.report_id).first();
  return {...cycle, pdf_key:report?.pdf_key||null, readings:readings.results||[], costs:costs.results||[], evidences:evidences.results||[], results:[], calculation:calculate(cycle,readings.results||[],costs.results||[])};
}

async function adminList(request, env) {
  await requireDb(env);
  const url = new URL(request.url);
  const utility = url.searchParams.get('utility');
  const status = url.searchParams.get('status');
  let q = `SELECT c.*, r.name, r.report_date, r.condominium FROM cycles c JOIN collection_reports r ON r.id=c.report_id WHERE 1=1`;
  const args=[];
  if (utility) { q+=' AND c.utility=?'; args.push(utility); }
  if (status) { q+=' AND c.status=?'; args.push(status); }
  q+=' ORDER BY c.reference DESC, c.utility';
  const rows=await env.DB.prepare(q).bind(...args).all();
  return json(rows.results||[]);
}

async function adminSaveCycle(request, env, cycleId) {
  await requireDb(env);
  const cycle=await env.DB.prepare('SELECT * FROM cycles WHERE id=?').bind(cycleId).first();
  if(!cycle) return json({error:'Ciclo não encontrado.'},404);
  if(cycle.status==='CLOSED') return json({error:'Ciclo fechado. Reabra o ciclo antes de alterar dados.'},409);
  const p=await request.json();
  const t=now();
  await env.DB.prepare(`UPDATE cycles SET reference=?,invoice_consumption=?,total_value=?,conversion_factor=?,units_per_block=?,condo_consumption=?,notes=?,updated_at=? WHERE id=?`).bind(
    p.reference||cycle.reference,num(p.invoiceConsumption),num(p.totalValue,0),num(p.conversionFactor,cycle.conversion_factor),Math.max(1,Math.floor(num(p.unitsPerBlock,cycle.units_per_block))),num(p.condoConsumption,0),p.notes||'',t,cycleId).run();
  if(Array.isArray(p.costs)) {
    await env.DB.prepare('DELETE FROM cost_items WHERE cycle_id=?').bind(cycleId).run();
    await runInBatches(env,p.costs.map(x=>env.DB.prepare('INSERT INTO cost_items(id,cycle_id,description,invoice_number,due_date,amount,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id(),cycleId,String(x.description||'Conta'),x.invoiceNumber||null,x.dueDate||null,num(x.amount,0),t,t)));
  }
  if(Array.isArray(p.readings)) {
    const readingStatements=[];
    for(const r of p.readings) {
      const current=num(r.currentValue), previous=num(r.previousValue);
      const measured = previous!==null && current!==null ? current-previous : null;
      readingStatements.push(env.DB.prepare(`UPDATE readings SET previous_value=?,current_value=?,measured_value=?,corrected=?,correction_reason=?,updated_at=? WHERE id=? AND cycle_id=? AND excluded=0`).bind(
        previous,current,measured,r.corrected?1:0,r.correctionReason||null,t,r.id,cycleId));
    }
    await runInBatches(env,readingStatements);
  }
  return json(await getCycle(env,cycleId));
}

async function excludeReading(request, env, cycleId, readingId) {
  await requireDb(env);
  const cycle=await env.DB.prepare('SELECT * FROM cycles WHERE id=?').bind(cycleId).first();
  if(!cycle) return json({error:'Ciclo não encontrado.'},404);
  if(cycle.status==='CLOSED') return json({error:'Ciclo fechado. Reabra o ciclo antes de excluir uma leitura.'},409);
  const reading=await env.DB.prepare('SELECT id,block_code FROM readings WHERE id=? AND cycle_id=? AND excluded=0').bind(readingId,cycleId).first();
  if(!reading) return json({error:'Leitura não encontrada.'},404);
  await env.DB.prepare('UPDATE readings SET excluded=1,updated_at=? WHERE id=? AND cycle_id=?').bind(now(),readingId,cycleId).run();
  await env.DB.prepare('DELETE FROM rateio_results WHERE cycle_id=?').bind(cycleId).run();
  return json({ok:true,excluded:{id:reading.id,block_code:reading.block_code},cycle:await getCycle(env,cycleId)});
}

async function reopenCycle(request, env, cycleId) {
  await requireDb(env);
  const cycle=await env.DB.prepare('SELECT * FROM cycles WHERE id=?').bind(cycleId).first();
  if(!cycle) return json({error:'Ciclo não encontrado.'},404);
  if(cycle.status!=='CLOSED') return json({error:'O ciclo já está aberto.'},409);
  const t=now();
  await env.DB.prepare('UPDATE cycles SET status=\'OPEN\',closed_at=NULL,updated_at=? WHERE id=?').bind(t,cycleId).run();
  await env.DB.prepare('DELETE FROM rateio_results WHERE cycle_id=?').bind(cycleId).run();
  return json(await getCycle(env,cycleId));
}

async function writeRateioResults(env, cycleId) {
  const detail=await getCycle(env,cycleId);
  const cycle=detail;
  const calc=detail.calculation;
  if(!detail.readings.length) throw new Error('Não há leituras para recalcular o ciclo.');
  if(detail.readings.some(r=>r.previous_value===null || r.current_value===null || Number(r.measured_value)<0)) throw new Error('Existem leituras incompletas ou negativas.');
  if(cycle.utility==='water' && Number(cycle.invoice_consumption||0)>0) {
    const diff = Math.abs((calc.blockSum + calc.commonSum) - Number(cycle.invoice_consumption));
    if(diff>0.01) throw new Error(`O consumo dos blocos + áreas comuns não fecha com o consumo da fatura. Diferença: ${diff.toFixed(2)}.`);
  }
  if(calc.totalValue<=0) throw new Error('Informe pelo menos um valor de conta/fatura antes do recálculo.');
  const t=now();
  await env.DB.prepare('DELETE FROM rateio_results WHERE cycle_id=?').bind(cycleId).run();
  const invoice = Number(cycle.invoice_consumption || 0);
  const denominator = cycle.utility === 'water' && invoice > 0 ? invoice : (calc.blockSum + calc.commonSum);
  const units = Math.max(1, Number(cycle.units_per_block || 16));
  const totalUnits = units * 26;
  const commonPoolAmount = denominator > 0 ? calc.totalValue * (calc.commonSum / denominator) : 0;
  const commonPerUnit = totalUnits > 0 ? commonPoolAmount / totalUnits : 0;
  const resultStatements=[];
  for (const r of detail.readings) {
    const measured = Math.max(0, Number(r.measured_value || 0));
    const converted = measured * Number(cycle.conversion_factor || 1);
    const pct = denominator > 0 ? converted / denominator : 0;
    const amount = calc.totalValue * pct;
    const isCommon = isCommonAreaReading(r.block_code);
    const blockAmount = isCommon ? 0 : amount;
    const condoAmount = isCommon ? amount : commonPerUnit;
    const apartmentAmount = isCommon ? 0 : (blockAmount / units) + commonPerUnit;
    resultStatements.push(env.DB.prepare(`INSERT INTO rateio_results
      (id,cycle_id,block_code,measured_consumption,converted_consumption,percentage,block_amount,condo_amount,apartment_amount,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(
      id(), cycleId, r.block_code, measured, converted, pct, blockAmount, condoAmount, apartmentAmount, t));
  }
  await runInBatches(env,resultStatements);
  return await getCycle(env,cycleId);
}

async function recalculateCycle(request, env, cycleId) {
  await requireDb(env);
  const cycle=await env.DB.prepare('SELECT * FROM cycles WHERE id=?').bind(cycleId).first();
  if(!cycle) return json({error:'Ciclo não encontrado.'},404);
  if(cycle.status==='CLOSED') return json({error:'Ciclo fechado. Reabra o ciclo antes de recalcular.'},409);
  try { return json(await writeRateioResults(env,cycleId)); }
  catch(e) { return json({error:e?.message||'Não foi possível recalcular o ciclo.'},400); }
}

async function closeCycle(request, env, cycleId) {
  await requireDb(env);
  const cycle=await env.DB.prepare('SELECT * FROM cycles WHERE id=?').bind(cycleId).first();
  if(!cycle) return json({error:'Ciclo não encontrado.'},404);
  if(cycle.status==='CLOSED') return json({error:'Ciclo já está fechado.'},409);
  try {
    const detail=await writeRateioResults(env,cycleId);
    const t=now();
    await env.DB.prepare('UPDATE cycles SET status=\'CLOSED\',closed_at=?,updated_at=? WHERE id=?').bind(t,t,cycleId).run();
    return json(await getCycle(env,cycleId));
  } catch(e) { return json({error:e?.message||'Não foi possível fechar o ciclo.'},400); }
}

async function downloadObject(env,key,download=false) {
  const obj=await env.BUCKET.get(key);
  if(!obj) return new Response('Arquivo não encontrado.',{status:404});
  const headers=new Headers(); obj.writeHttpMetadata(headers); headers.set('etag',obj.httpEtag); headers.set('cache-control','private, max-age=3600');
  if(download) headers.set('content-disposition',`attachment; filename="${safeName(key.split('/').pop()||'arquivo')}"`);
  else if(!headers.has('content-type')) headers.set('content-type','application/octet-stream');
  return new Response(obj.body,{headers});
}

export default { async fetch(request, env) {
  try {
    const url=new URL(request.url); const path=url.pathname.replace(/\/+$/,'')||'/'; let m;
    if(path==='/api/health') return json({ok:true,d1:!!env.DB,r2:!!env.BUCKET});

    // Bootstrap e autenticação.
    if(path==='/api/auth/status' && request.method==='GET') return authStatus(env);
    if(path==='/api/auth/setup' && request.method==='POST') return setup(request,env);
    if(path==='/api/auth/login' && request.method==='POST') return login(request,env);
    if(path==='/api/auth/logout' && request.method==='POST') return logout(request,env);
    if(path==='/api/auth/me' && request.method==='GET') return me(request,env);
    if(path==='/api/auth/change-password' && request.method==='POST') return changePassword(request,env);
    if(path==='/api/home' && request.method==='GET') return homeData(request,env);

    // Página pública de chamados.
    if(path==='/api/public/request-options' && request.method==='GET') return publicRequestOptions(env);
    if(path==='/api/public/requests' && request.method==='POST') return createPublicRequest(request,env);

    // Administração de usuários, equipes, módulos e roteamentos.
    if(path==='/api/admin/users' && request.method==='GET') return listUsers(request,env);
    if(path==='/api/admin/users' && request.method==='POST') return createUser(request,env);
    m=path.match(/^\/api\/admin\/users\/([^/]+)$/);
    if(m && request.method==='PATCH') return updateUser(request,env,m[1]);
    m=path.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/);
    if(m && request.method==='POST') return resetUserPassword(request,env,m[1]);
    if(path==='/api/admin/access-config' && request.method==='GET') return accessConfig(request,env);
    m=path.match(/^\/api\/admin\/teams\/([^/]+)\/modules$/);
    if(m && request.method==='PUT') return updateTeamModules(request,env,m[1]);
    if(path==='/api/admin/routing' && request.method==='PUT') return updateRoutingRules(request,env);

    // Atividades e sincronização offline.
    if(path==='/api/activities/options' && request.method==='GET') return activityOptions(request,env);
    if(path==='/api/activities/dashboard' && request.method==='GET') return activityDashboard(request,env);
    if(path==='/api/activities/diary' && request.method==='GET') return activityDiary(request,env);
    if(path==='/api/activities' && request.method==='GET') return listActivities(request,env);
    if(path==='/api/activities' && request.method==='POST') return createActivity(request,env);
    if(path==='/api/sync/operations' && request.method==='POST') return syncOperations(request,env);
    m=path.match(/^\/api\/activities\/([^/]+)$/);
    if(m && request.method==='GET') return getActivity(request,env,m[1]);
    m=path.match(/^\/api\/activities\/([^/]+)\/start$/);
    if(m && request.method==='POST') return startActivity(request,env,m[1]);
    m=path.match(/^\/api\/activities\/([^/]+)\/complete$/);
    if(m && request.method==='POST') return completeActivity(request,env,m[1]);
    m=path.match(/^\/api\/activities\/([^/]+)\/cancel$/);
    if(m && request.method==='POST') return cancelActivity(request,env,m[1]);
    m=path.match(/^\/api\/activities\/([^/]+)\/evidence$/);
    if(m && request.method==='POST') return addActivityEvidence(request,env,m[1]);
    m=path.match(/^\/api\/activity-evidence\/([^/]+)$/);
    if(m && request.method==='GET') return downloadActivityEvidence(request,env,m[1]);

    // Recorrências.
    if(path==='/api/recurrences/options' && request.method==='GET') return recurrenceOptions(request,env);
    if(path==='/api/recurrences' && request.method==='GET') return listRecurrences(request,env);
    if(path==='/api/recurrences' && request.method==='POST') return createRecurrence(request,env);
    m=path.match(/^\/api\/recurrences\/([^/]+)\/status$/);
    if(m && request.method==='PATCH') return setRecurrenceStatus(request,env,m[1]);

    // Chamados internos.
    if(path==='/api/requests' && request.method==='GET') return listRequests(request,env);
    m=path.match(/^\/api\/requests\/([^/]+)\/convert$/);
    if(m && request.method==='POST') return convertRequest(request,env,m[1]);
    m=path.match(/^\/api\/requests\/([^/]+)\/photo$/);
    if(m && request.method==='GET') return downloadRequestPhoto(request,env,m[1]);

    // Ferramentas de campo exigem identidade e liberação explícita para a equipe.
    if(path==='/api/leiturista/sync' && request.method==='POST') { const user=await requireUser(request,env,'tools.view'); requireModule(user,'leiturista'); return syncLeiturista(request,env,user); }
    if(path==='/api/ronda/sync' && request.method==='POST') { const user=await requireUser(request,env,'tools.view'); requireModule(user,'ronda'); return syncRonda(request,env,user); }
    if(path==='/api/fiscalizacao/sync' && request.method==='POST') { const user=await requireUser(request,env,'tools.view'); requireModule(user,'inspection'); return syncFiscalizacao(request,env,user); }
    if(path==='/api/diario/sync' && request.method==='POST') { const user=await requireUser(request,env,'tools.view'); requireModule(user,'diary'); return syncDiario(request,env,user); }
    if(path==='/api/rateio/submissions' && request.method==='POST') return createRateioSubmission(request,env);
    if(path==='/api/adm-rateio/submissions' && request.method==='GET') return listRateioSubmissions(request,env);
    m=path.match(/^\/api\/adm-rateio\/submissions\/([^/]+)$/);
    if(m && request.method==='GET') return getRateioSubmission(request,env,m[1]);
    if(m && request.method==='PATCH') return updateRateioSubmission(request,env,m[1]);
    if(path==='/api/adm/fiscalizacao' && request.method==='GET') { await requireUser(request,env,'reports.view'); return adminFiscalizacaoList(request,env); }
    if(path==='/api/adm/diario' && request.method==='GET') { await requireUser(request,env,'reports.view'); return adminDiarioList(request,env); }
    m=path.match(/^\/api\/adm\/fiscalizacao\/([^/]+)$/); if(m && request.method==='GET') { await requireUser(request,env,'reports.view'); return adminFiscalizacaoDetail(request,env,m[1]); }
    m=path.match(/^\/api\/adm\/diario\/([^/]+)$/); if(m && request.method==='GET') { await requireUser(request,env,'reports.view'); return adminDiarioDetail(request,env,m[1]); }
    if(path==='/api/adm/ronda' && request.method==='GET') { await requireUser(request,env,'reports.view'); return adminRondaList(request,env); }
    m=path.match(/^\/api\/adm\/ronda\/([^/]+)$/); if(m && request.method==='GET') { await requireUser(request,env,'reports.view'); return adminRondaDetail(request,env,m[1]); }
    m=path.match(/^\/api\/leiturista\/cycles\/([^/]+)\/evidence$/); if(m && request.method==='POST') { const user=await requireUser(request,env,'tools.view'); requireModule(user,'leiturista'); return uploadEvidence(request,env,m[1]); }
    if(path==='/api/adm-rateio/cycles' && request.method==='GET') { await requireUser(request,env,'rateio.view'); return adminList(request,env); }
    m=path.match(/^\/api\/adm-rateio\/cycles\/([^/]+)$/); if(m && request.method==='GET') { await requireUser(request,env,'rateio.view'); const c=await getCycle(env,m[1]); return c?json(c):json({error:'Ciclo não encontrado.'},404); }
    if(m && request.method==='PUT') { await requireUser(request,env,'rateio.manage'); return adminSaveCycle(request,env,m[1]); }
    m=path.match(/^\/api\/adm-rateio\/cycles\/([^/]+)\/reopen$/); if(m && request.method==='POST') { await requireUser(request,env,'rateio.manage'); return reopenCycle(request,env,m[1]); }
    m=path.match(/^\/api\/adm-rateio\/cycles\/([^/]+)\/recalculate$/); if(m && request.method==='POST') { await requireUser(request,env,'rateio.manage'); return recalculateCycle(request,env,m[1]); }
    m=path.match(/^\/api\/adm-rateio\/cycles\/([^/]+)\/readings\/([^/]+)$/); if(m && request.method==='DELETE') { await requireUser(request,env,'rateio.manage'); return excludeReading(request,env,m[1],m[2]); }
    m=path.match(/^\/api\/adm-rateio\/cycles\/([^/]+)\/close$/); if(m && request.method==='POST') { await requireUser(request,env,'rateio.manage'); return closeCycle(request,env,m[1]); }
    m=path.match(/^\/api\/files\/(.+)$/); if(m && request.method==='GET') { await requireUser(request,env,'reports.view'); const u=new URL(request.url); return downloadObject(env,m[1],u.searchParams.get('download')==='1'); }

    if(path.startsWith('/api/')) return json({error:'Endpoint não encontrado.'},404);

    // Os shells HTML não carregam dados protegidos. A validação de identidade é
    // feita pelos clientes e, obrigatoriamente, em cada API. Assim o Service
    // Worker consegue preservar as ferramentas offline sem armazenar respostas
    // administrativas ou dados do D1.
    if ((path === '/login.html' || path === '/setup.html') && request.method === 'GET') {
      const user = await currentUser(request,env,true);
      if (user) return Response.redirect(`${url.origin}/`,302);
    }
    return env.ASSETS.fetch(request);
  } catch (e) {
    return handleError(e);
  }
},
async scheduled(controller,env,ctx) {
  ctx.waitUntil(generateDueRecurrences(env, new Date(controller.scheduledTime)));
} };
