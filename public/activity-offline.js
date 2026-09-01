(function(){
  const DB='blexo-suite-v11',VERSION=1,ACTIVITIES='activity_cache',OUTBOX='outbox',EVIDENCE='evidence_outbox';
  function open(){return new Promise((ok,no)=>{const r=indexedDB.open(DB,VERSION);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(ACTIVITIES))d.createObjectStore(ACTIVITIES,{keyPath:'id'});if(!d.objectStoreNames.contains(OUTBOX))d.createObjectStore(OUTBOX,{keyPath:'id'});if(!d.objectStoreNames.contains(EVIDENCE))d.createObjectStore(EVIDENCE,{keyPath:'id'})};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
  async function tx(store,mode,work){const db=await open();return new Promise((ok,no)=>{const t=db.transaction(store,mode),s=t.objectStore(store),result=work(s);t.oncomplete=()=>{db.close();ok(result)};t.onerror=()=>{db.close();no(t.error)}})}
  const all=store=>new Promise(async(ok,no)=>{try{const db=await open(),r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>{db.close();ok(r.result||[])};r.onerror=()=>no(r.error)}catch(e){no(e)}});
  async function cache(items){await tx(ACTIVITIES,'readwrite',store=>(items||[]).forEach(item=>store.put(item)))}
  const cached=()=>all(ACTIVITIES);
  async function updateLocal(id,changes){const rows=await cached(),item=rows.find(x=>x.id===id);if(item)await tx(ACTIVITIES,'readwrite',s=>s.put({...item,...changes,local_pending:true}))}
  async function enqueue(type,entityId,payload={}){const op={id:crypto.randomUUID(),type,entityId,payload,occurredAt:new Date().toISOString(),createdAt:new Date().toISOString()};await tx(OUTBOX,'readwrite',s=>s.put(op));return op}
  const pendingOperations=()=>all(OUTBOX);const pendingEvidence=()=>all(EVIDENCE);
  async function pending(){return[...(await pendingOperations()),...(await pendingEvidence())]}
  async function remove(id){await tx(OUTBOX,'readwrite',s=>s.delete(id))}
  async function queueEvidence(activityId,file,description=''){
    const item={id:crypto.randomUUID(),activityId,blob:file,filename:file.name||'evidencia.jpg',contentType:file.type||'image/jpeg',description,capturedAt:new Date().toISOString(),createdAt:new Date().toISOString()};
    async function upload(){const fd=new FormData();fd.append('id',item.id);fd.append('file',item.blob,item.filename);fd.append('description',item.description);fd.append('capturedAt',item.capturedAt);return BlexoAuth.request(`/api/activities/${encodeURIComponent(activityId)}/evidence`,{method:'POST',body:fd})}
    if(navigator.onLine){try{return{...(await upload()),queued:false}}catch(error){if(error.status&&error.status<500)throw error}}
    await tx(EVIDENCE,'readwrite',s=>s.put(item));return{ok:true,id:item.id,queued:true}
  }
  async function syncEvidence(){const rows=await pendingEvidence();for(const item of rows){try{const fd=new FormData();fd.append('id',item.id);fd.append('file',item.blob,item.filename);fd.append('description',item.description||'');fd.append('capturedAt',item.capturedAt||item.createdAt);await BlexoAuth.request(`/api/activities/${encodeURIComponent(item.activityId)}/evidence`,{method:'POST',body:fd});await tx(EVIDENCE,'readwrite',s=>s.delete(item.id))}catch(error){if(error.status===401)throw error}}}
  async function run(type,entityId,payload={}){
    const op={id:crypto.randomUUID(),type,entityId,payload,occurredAt:new Date().toISOString()};
    const path=type==='START_ACTIVITY'?`/api/activities/${encodeURIComponent(entityId)}/start`:`/api/activities/${encodeURIComponent(entityId)}/complete`;
    if(navigator.onLine){try{const result=await BlexoAuth.request(path,{method:'POST',headers:{'content-type':'application/json','x-blexo-operation-id':op.id},body:JSON.stringify({...payload,occurredAt:op.occurredAt})});await updateLocal(entityId,{status:type==='START_ACTIVITY'?'IN_PROGRESS':'COMPLETED',local_pending:false});return {...result,queued:false}}catch(error){if(error.status&&error.status<500)throw error}}
    await tx(OUTBOX,'readwrite',s=>s.put(op));await updateLocal(entityId,{status:type==='START_ACTIVITY'?'IN_PROGRESS':'COMPLETED'});return {ok:true,queued:true}
  }
  async function sync(){if(!navigator.onLine)return{pending:(await pending()).length};await syncEvidence();const operations=await pendingOperations();let results=[];if(operations.length){const data=await BlexoAuth.request('/api/sync/operations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operations})});results=data.results||[];for(const result of results)if(result.ok)await remove(result.id)}return{pending:(await pending()).length,results}}
  window.BlexoOffline={cache,cached,enqueue,pending,run,sync,updateLocal,queueEvidence,pendingEvidence};
})();
