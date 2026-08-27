const CACHE='blexo-suite-v49-cloud-rateio';
const ASSETS=['./','./index.html','./check.html','./leiturista.html','./adm-rateio.html','./scanner.html','./ronda.html','./diario.html','./fiscalizacao.html','./fiscalizacao.css','./fiscalizacao.js?v=1','./diario.css','./diario.js?v=46','./ronda.css','./ronda.js?v=1','./rateios.html','./orcamentos.html','./reembolso.html','./dashboard.css','./dashboard.js?v=22','./config.js?v=22','./styles.css','./observation-size.css','./photo-notes.css','./seals.css','./app.js?v=49','./cloud-api.js','./check-app.js?v=23','./offline-pdf.js?v=5','./scanner.css','./rateios.css','./rateios.js?v=9','./orcamentos.css','./reembolso.css','./orcamentos.js?v=3','./reembolso.js?v=46','./adm-rateio.css','./adm-rateio.js','./favicon.png','./apple-touch-icon.png','./icon-512.png','./icon-192.png','./scanner.js?v=22','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin===self.location.origin && url.pathname.startsWith('/api/')) return;
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{if(r.ok&&url.origin===self.location.origin)caches.open(CACHE).then(c=>c.put(e.request,r.clone()));return r}).catch(()=>e.request.mode==='navigate'?caches.match('./index.html'):Response.error())));
});
