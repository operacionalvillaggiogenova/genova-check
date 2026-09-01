const form=document.getElementById('setupForm'),feedback=document.getElementById('feedback'),button=document.getElementById('submitButton');
(async()=>{try{const status=await BlexoAuth.request('/api/auth/status');if(!status.setupRequired)location.replace('/login.html')}catch(error){feedback.textContent=error.message}})();
form.addEventListener('submit',async event=>{
  event.preventDefault();feedback.textContent='';button.disabled=true;button.textContent='Criando…';
  try{
    const data=await BlexoAuth.request('/api/auth/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:document.getElementById('name').value,username:document.getElementById('username').value,email:document.getElementById('email').value,teamCode:document.getElementById('team').value,password:document.getElementById('password').value})});
    BlexoAuth.remember(data.user);location.replace('/');
  }catch(error){feedback.textContent=error.message||'Não foi possível concluir a configuração.'}
  finally{button.disabled=false;button.textContent='Criar administrador'}
});

