(function(){
  const dateField=document.getElementById('activityDiaryDate');
  const list=document.getElementById('activityDiaryList');
  if(!dateField||!list)return;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const localDate=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
  const status=value=>({PENDING:'Pendente',IN_PROGRESS:'Em andamento',COMPLETED:'Concluída',CANCELLED:'Cancelada'})[value]||value;
  const matches=(item,date)=>[item.due_at,item.started_at,item.completed_at].some(value=>String(value||'').slice(0,10)===date);
  function render(items){
    list.innerHTML=items.length?items.map(item=>`<a class="diary-activity-row" href="/activities.html?id=${encodeURIComponent(item.id)}"><span><strong>${esc(item.title)}</strong><small>${esc(item.team_name||'')} · ${esc(item.location||'Sem local')}</small></span><span class="diary-status ${String(item.status||'').toLowerCase()}">${esc(status(item.status))}</span></a>`).join(''):'<p class="hint">Nenhuma atividade registrada nesta data.</p>';
  }
  async function load(){
    const date=dateField.value||localDate();list.innerHTML='<p class="hint">Carregando atividades…</p>';
    try{
      if(navigator.onLine){const data=await BlexoAuth.request(`/api/activities/diary?date=${encodeURIComponent(date)}`);render(data.items||[])}
      else render((await BlexoOffline.cached()).filter(item=>matches(item,date)));
    }catch(error){list.innerHTML=`<p class="hint">${esc(error.message)}</p>`}
  }
  dateField.value=localDate();dateField.onchange=load;window.addEventListener('online',load);window.addEventListener('offline',load);load();
})();
