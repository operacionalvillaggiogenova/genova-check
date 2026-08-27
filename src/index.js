const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const num = (v, fallback = null) => {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
};
const ADMIN_HOST = 'rateio.blexo.com.br';

const safeName = (v='arquivo') => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(0,120);

async function requireDb(env) {
  if (!env.DB || !env.BUCKET) throw new Error('D1/R2 ainda não configurados no Worker.');
}

async function upsertCollection(env, payload) {
  const t = now();
  const source = String(payload.sourceReportId || payload.id || id());
  const existing = await env.DB.prepare('SELECT * FROM collection_reports WHERE source_report_id = ?').bind(source).first();
  const reportId = existing?.id || id();
  await env.DB.prepare(`INSERT INTO collection_reports
    (id,source_report_id,name,condominium,location,service,technician,report_date,notes,pdf_key,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(source_report_id) DO UPDATE SET
      name=excluded.name, condominium=excluded.condominium, location=excluded.location,
      service=excluded.service, technician=excluded.technician, report_date=excluded.report_date,
      notes=excluded.notes, updated_at=excluded.updated_at`).bind(
        reportId, source, payload.name||'', payload.client||'', payload.location||'', payload.service||'',
        payload.technician||'', payload.reportDate||'', payload.notes||'', existing?.pdf_key||null,
        existing?.created_at||t, t).run();
  return { reportId, sourceReportId: source };
}

async function syncLeiturista(request, env) {
  await requireDb(env);
  const payload = await request.json();
  const { reportId } = await upsertCollection(env, payload);
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
      for (const r of utilityReadings) {
        let previous = num(r.previous);
        const current = num(r.current);
        if (previous === null) {
          const prior = await env.DB.prepare(`SELECT rr.current_value FROM readings rr JOIN cycles pc ON pc.id=rr.cycle_id WHERE pc.utility=? AND pc.status='CLOSED' AND rr.block_code=? ORDER BY pc.closed_at DESC LIMIT 1`).bind(utility,String(r.blockCode||'')).first();
          previous = prior?.current_value ?? null;
        }
        const measured = previous !== null && current !== null ? current - previous : null;
        const rid = id();
        await env.DB.prepare(`INSERT INTO readings
          (id,cycle_id,block_code,previous_value,current_value,measured_value,corrected,correction_reason,source_group_id,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(cycle_id,block_code) DO UPDATE SET
            previous_value=excluded.previous_value,current_value=excluded.current_value,
            measured_value=excluded.measured_value,source_group_id=excluded.source_group_id,updated_at=excluded.updated_at
          WHERE readings.corrected=0`).bind(
            rid, cycleId, String(r.blockCode||''), previous, current, measured, 0, null, r.sourceGroupId||null, t).run();
      }
    }
    results[utility] = cycleId;
  }
  return json({ ok:true, reportId, cycles:results });
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
  const measured = readings.map(r => ({...r, delta: Number(r.measured_value||0), converted: Number(r.measured_value||0)*factor}));
  const sum = measured.reduce((s,r)=>s+r.converted,0);
  const invoiceConsumption = Number(cycle.invoice_consumption||0);
  const condo = cycle.utility === 'water' && invoiceConsumption > 0 ? Math.max(0, invoiceConsumption - sum) : Number(cycle.condo_consumption||0);
  const consumerPool = cycle.utility === 'water' ? sum : sum;
  return { totalValue, factor, measured, sum, invoiceConsumption, condo, consumerPool };
}

async function getCycle(env, cycleId) {
  const cycle = await env.DB.prepare('SELECT * FROM cycles WHERE id=?').bind(cycleId).first();
  if (!cycle) return null;
  const readings = await env.DB.prepare('SELECT * FROM readings WHERE cycle_id=? ORDER BY CAST(block_code AS INTEGER), block_code').bind(cycleId).all();
  const costs = await env.DB.prepare('SELECT * FROM cost_items WHERE cycle_id=? ORDER BY created_at').bind(cycleId).all();
  const evidences = await env.DB.prepare('SELECT id,utility,meter,r2_key,filename,content_type,size,created_at FROM evidences WHERE cycle_id=? ORDER BY created_at').bind(cycleId).all();
  const report=await env.DB.prepare('SELECT pdf_key FROM collection_reports WHERE id=?').bind(cycle.report_id).first(); return {...cycle, pdf_key:report?.pdf_key||null, readings:readings.results||[], costs:costs.results||[], evidences:evidences.results||[], results:results.results||[], calculation:calculate(cycle,readings.results||[],costs.results||[])};
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
    for(const x of p.costs) await env.DB.prepare('INSERT INTO cost_items(id,cycle_id,description,invoice_number,due_date,amount,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id(),cycleId,String(x.description||'Conta'),x.invoiceNumber||null,x.dueDate||null,num(x.amount,0),t,t).run();
  }
  if(Array.isArray(p.readings)) {
    for(const r of p.readings) {
      const current=num(r.currentValue), previous=num(r.previousValue);
      const measured = previous!==null && current!==null ? current-previous : null;
      await env.DB.prepare(`UPDATE readings SET previous_value=?,current_value=?,measured_value=?,corrected=?,correction_reason=?,updated_at=? WHERE id=? AND cycle_id=?`).bind(
        previous,current,measured,r.corrected?1:0,r.correctionReason||null,t,r.id,cycleId).run();
    }
  }
  return json(await getCycle(env,cycleId));
}

async function closeCycle(request, env, cycleId) {
  await requireDb(env);
  const cycle=await env.DB.prepare('SELECT * FROM cycles WHERE id=?').bind(cycleId).first();
  if(!cycle) return json({error:'Ciclo não encontrado.'},404);
  if(cycle.status==='CLOSED') return json({error:'Ciclo já está fechado.'},409);
  const detail=await getCycle(env,cycleId);
  const calc=detail.calculation;
  if(!detail.readings.length) return json({error:'Não há leituras para fechar o ciclo.'},400);
  if(detail.readings.some(r=>r.previous_value===null || r.current_value===null || Number(r.measured_value)<0)) return json({error:'Existem leituras incompletas ou negativas.'},400);
  if(cycle.utility==='water' && Number(cycle.invoice_consumption||0)>0 && Math.abs((calc.sum+calc.condo)-Number(cycle.invoice_consumption))>0.01) return json({error:'O consumo dos blocos + consumo do condomínio não fecha com o consumo da fatura.'},400);
  if(calc.totalValue<=0) return json({error:'Informe pelo menos um valor de conta/fatura antes do fechamento.'},400);
  const t=now();
  await env.DB.prepare('DELETE FROM rateio_results WHERE cycle_id=?').bind(cycleId).run();
  const invoice = Number(cycle.invoice_consumption || 0);
  const convertedSum = calc.sum || 0;
  const denominator = cycle.utility === 'water' && invoice > 0 ? invoice : convertedSum;
  const condoConsumption = cycle.utility === 'water' && invoice > 0 ? Math.max(0, invoice - convertedSum) : Number(cycle.condo_consumption || 0);
  for (const r of detail.readings) {
    const measured = Math.max(0, Number(r.measured_value || 0));
    const converted = measured * Number(cycle.conversion_factor || 1);
    const pct = denominator > 0 ? converted / denominator : 0;
    const blockAmount = calc.totalValue * pct;
    const condoAmount = cycle.utility === 'water' && invoice > 0 ? calc.totalValue * (condoConsumption / invoice) : 0;
    const apartmentAmount = (blockAmount + condoAmount) / Math.max(1, Number(cycle.units_per_block || 16));
    await env.DB.prepare(`INSERT INTO rateio_results
      (id,cycle_id,block_code,measured_consumption,converted_consumption,percentage,block_amount,condo_amount,apartment_amount,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(
      id(), cycleId, r.block_code, measured, converted, pct, blockAmount, condoAmount, apartmentAmount, t).run();
  }
  await env.DB.prepare('UPDATE cycles SET status=\'CLOSED\',closed_at=?,updated_at=? WHERE id=?').bind(t,t,cycleId).run();
  return json(await getCycle(env,cycleId));
}

async function downloadObject(env,key) {
  const obj=await env.BUCKET.get(key);
  if(!obj) return new Response('Arquivo não encontrado.',{status:404});
  const headers=new Headers(); obj.writeHttpMetadata(headers); headers.set('etag',obj.httpEtag); headers.set('cache-control','private, max-age=3600');
  return new Response(obj.body,{headers});
}

export default { async fetch(request, env) {
  try {
    const url=new URL(request.url); const path=url.pathname.replace(/\/+$/,'')||'/';
    const isAdminPath = path === '/adm-rateio.html' || path.startsWith('/api/adm-rateio') || path.startsWith('/api/files/');
    if (isAdminPath && url.hostname !== ADMIN_HOST) {
      return json({error:`Módulo administrativo disponível somente em https://${ADMIN_HOST}`},403);
    }
    if(path==='/api/health') return json({ok:true,d1:!!env.DB,r2:!!env.BUCKET});
    if(path==='/api/leiturista/sync' && request.method==='POST') return syncLeiturista(request,env);
    let m=path.match(/^\/api\/leiturista\/cycles\/([^/]+)\/evidence$/); if(m && request.method==='POST') return uploadEvidence(request,env,m[1]);
    if(path==='/api/adm-rateio/cycles' && request.method==='GET') return adminList(request,env);
    m=path.match(/^\/api\/adm-rateio\/cycles\/([^/]+)$/); if(m && request.method==='GET') { const c=await getCycle(env,m[1]); return c?json(c):json({error:'Ciclo não encontrado.'},404); }
    if(m && request.method==='PUT') return adminSaveCycle(request,env,m[1]);
    m=path.match(/^\/api\/adm-rateio\/cycles\/([^/]+)\/close$/); if(m && request.method==='POST') return closeCycle(request,env,m[1]);
    m=path.match(/^\/api\/files\/(.+)$/); if(m && request.method==='GET') return downloadObject(env,m[1]);
    if(path.startsWith('/api/')) return json({error:'Endpoint não encontrado.'},404);
    return env.ASSETS.fetch(request);
  } catch (e) {
    console.error(e); return json({error:e?.message||'Erro interno.'},500);
  }
} };
