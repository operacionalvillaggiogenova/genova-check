(function () {
  const LAST_USER_KEY = 'blexo-suite-last-user-v1';

  async function request(path, options = {}) {
    const response = await fetch(path, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...options,
      headers: { ...(options.headers || {}) }
    });
    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(data?.error || `Erro HTTP ${response.status}`);
      error.status = response.status;
      error.code = data?.code;
      throw error;
    }
    return data;
  }

  function remember(user) {
    if (!user) return;
    const safe = {
      id: user.id, name: user.name, username: user.username,
      role: user.role, team: user.team, permissions: user.permissions || [],
      modules: user.modules || [], validatedAt: new Date().toISOString()
    };
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(safe));
  }

  function remembered() {
    try { return JSON.parse(localStorage.getItem(LAST_USER_KEY) || 'null'); }
    catch { return null; }
  }

  async function me({ allowOffline = true } = {}) {
    try {
      const data = await request('/api/auth/me');
      remember(data.user);
      return { ...data, offline: false };
    } catch (error) {
      if (allowOffline && !navigator.onLine) {
        const user = remembered();
        if (user) return { user, product: 'blexo-suite', version: '11.0.0', offline: true };
      }
      throw error;
    }
  }

  async function requireUser(options = {}) {
    try {
      return await me(options);
    } catch (error) {
      if (error.status === 401 && navigator.onLine) {
        const next = encodeURIComponent(location.pathname + location.search);
        location.replace(`/login.html?next=${next}`);
      }
      throw error;
    }
  }

  async function logout() {
    try { await request('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); }
    finally {
      localStorage.removeItem(LAST_USER_KEY);
      location.replace('/login.html');
    }
  }

  window.BlexoAuth = { request, me, requireUser, logout, remembered, remember };
})();

