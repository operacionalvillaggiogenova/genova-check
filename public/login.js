const form=document.getElementById('loginForm'),feedback=document.getElementById('feedback'),button=document.getElementById('submitButton');
const next=()=>{const value=new URLSearchParams(location.search).get('next')||'/';return value.startsWith('/')&&!value.startsWith('//')?value:'/'};
(async()=>{try{const status=await BlexoAuth.request('/api/auth/status');if(status.setupRequired)location.replace('/setup.html')}catch{}})();
form.addEventListener('submit',async event=>{
  event.preventDefault(); feedback.textContent=''; button.disabled=true; button.textContent='Entrando…';
  try{
    const data=await BlexoAuth.request('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:document.getElementById('username').value,password:document.getElementById('password').value})});
    BlexoAuth.remember(data.user); location.replace(next());
  }catch(error){feedback.textContent=error.message||'Não foi possível entrar.';}
  finally{button.disabled=false;button.textContent='Entrar'}
});

