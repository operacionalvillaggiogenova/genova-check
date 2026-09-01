(function(){
  const API = '/api';
  const request = async (path, options={}) => {
    const r = await fetch(API + path, { ...options, headers: { ...(options.headers||{}) } });
    let data=null; try { data=await r.json(); } catch {}
    if(!r.ok) throw new Error(data?.error || `Erro HTTP ${r.status}`);
    return data;
  };
  const dataUrlToBlob = async src => {
    if(typeof src !== 'string') throw new Error('Imagem inválida.');
    const r=await fetch(src); return await r.blob();
  };
  window.BlexoCloud = {
    health:()=>request('/health'),
    syncLeiturista: async report => {
      const readings=[];
      for(const g of (report.groups||[])){
        if(g.gas!=='' && g.gas!=null) readings.push({utility:'gas',blockCode:g.title,previous:g.previousGas,current:g.gas,sourceGroupId:g.id});
        if(g.water!=='' && g.water!=null) readings.push({utility:'water',blockCode:g.title,previous:g.previousWater,current:g.water,sourceGroupId:g.id});
      }
      return request('/leiturista/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
        sourceReportId:report.id,name:report.name,client:report.client,location:report.location,service:report.service,
        technician:report.technician,notes:report.notes,activityId:report.activityId||null,reportDate:report.reportDate||new Date().toISOString().slice(0,10),
        reference:report.reference||report.reportDate?.slice(0,7)||new Date().toISOString().slice(0,7),readings
      })});
    },
    uploadEvidence: async (cycleId, report, pdfBlob, photos) => {
      const fd=new FormData();
      if(pdfBlob instanceof Blob) fd.append('pdf',pdfBlob,`blexo-evidencias-${report.reference||'ciclo'}.pdf`);
      const meta=[];
      for(const photo of photos||[]){
        const blob=photo.blob instanceof Blob ? photo.blob : await dataUrlToBlob(photo.src);
        const name=`${photo.id||crypto.randomUUID()}.jpg`;
        fd.append('photos',blob,name);
        meta.push({meter:photo.meter||'',utility:photo.meter||'',blockCode:photo.blockCode||''});
      }
      fd.append('photoMeta',JSON.stringify(meta));
      return request(`/leiturista/cycles/${encodeURIComponent(cycleId)}/evidence`,{method:'POST',body:fd});
    }
  };
})();
