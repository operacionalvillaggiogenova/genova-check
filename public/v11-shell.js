const shell = {
  user: null,
  role: null,
  permissions: [],
  
  async init() {
    const isLogin = window.location.pathname.match(/\/(login|v11-login\.html)$/);
    try {
      const data = await api.auth.me();
      this.user = data.user;
      this.role = data.role;
      this.permissions = data.permissions || [];
      
      if (isLogin) {
        window.location.href = '/dashboard';
        return;
      }
      this.renderTopBar();
      this.initServiceWorker();
    } catch (e) {
      if (!isLogin) {
        window.location.href = '/login';
      }
    }
  },
  
  async initServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      
      const sendSession = (worker) => {
        if (worker && this.user) {
          worker.postMessage({ type: 'BLEXO_SESSION', userId: this.user.id, permissions: this.permissions });
        }
      };

      if (navigator.serviceWorker.controller) {
        sendSession(navigator.serviceWorker.controller);
      } else {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          sendSession(navigator.serviceWorker.controller);
        });
      }
    } catch (err) {
      console.error('SW registration failed:', err);
    }
  },

  async logout() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const sw = navigator.serviceWorker.controller;
      await new Promise(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => resolve();
        sw.postMessage({ type: 'BLEXO_LOGOUT', userId: this.user ? this.user.id : null }, [channel.port2]);
        setTimeout(resolve, 300);
      });
    }
    try { await api.auth.logout(); } catch(e) {}
    window.location.href = '/login';
  },

  has(perm) {
    return this.permissions.includes(perm);
  },
  
  renderTopBar() {
    const header = document.createElement('header');
    header.className = 'topbar';
    header.innerHTML = `
      <a href="/dashboard" class="brand-link">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        Blexo Suite
      </a>
      <div class="flex items-center gap-4">
        <div class="text-sm hidden-mobile" style="color:var(--sky)">${this.escape(this.user.name)}</div>
        <a href="/settings" class="btn btn-outline" aria-label="Configurações" style="border:none; color:var(--white); padding: 8px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        </a>
        <button id="shellLogoutBtn" class="btn btn-outline" aria-label="Sair" style="border:none; color:var(--white); padding: 8px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
        </button>
      </div>
    `;
    document.body.prepend(header);
    
    document.getElementById('shellLogoutBtn')?.addEventListener('click', () => this.logout());

    if (!document.getElementById('shell-style')) {
      const style = document.createElement('style');
      style.id = 'shell-style';
      style.textContent = `@media(max-width: 600px) { .hidden-mobile { display: none !important; } }`;
      document.head.appendChild(style);
    }
  },
  
  formatDate(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  },
  
  escape(str) {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
};
