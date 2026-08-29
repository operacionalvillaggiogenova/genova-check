const CACHE='blexo-suite-v52-cloudflare';
const ASSETS=['./','./index.html','./check.html','./leiturista.html','./adm.html','./adm-rateio.html','./adm-ronda.html','./adm-fiscalizacao.html','./adm-diario.html','./scanner.html','./ronda.html','./diario.html','./fiscalizacao.html','./rateios.html','./orcamentos.html','./reembolso.html','./dashboard.css','./styles.css','./observation-size.css','./photo-notes.css','./seals.css','./adm.css','./adm-rateio.css','./ronda.css','./diario.css','./fiscalizacao.css','./rateios.css','./orcamentos.css','./reembolso.css','./scanner.css','./config.js','./cloud-api.js','./dashboard.js','./app.js','./check-app.js','./offline-pdf.js','./scanner.js','./ronda.js','./diario.js','./fiscalizacao.js','./rateios.js','./orcamentos.js','./reembolso.js','./adm-rateio.js','./favicon.png','./apple-touch-icon.png','./icon-512.png','./icon-192.png','./manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Navegação: sempre tenta a versão publicada primeiro.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // Recursos estáticos: rede primeiro para receber publicações novas.
  // Se estiver offline, usa o cache local.
  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => caches.match(event.request))
  );
});
