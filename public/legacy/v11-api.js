const api = {
  async req(path, options = {}) {
    const isFormData = options.body instanceof FormData;
    const headers = { ...options.headers };
    if (!isFormData && options.body && typeof options.body !== 'string') {
      options.body = JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
    }
    
    try {
      const res = await fetch(path, { ...options, headers });
      if (res.status === 401) {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'BLEXO_LOGOUT' });
        }
        if (!window.location.pathname.match(/\/(login|v11-login\.html)$/)) {
          window.location.href = '/login';
        }
        throw new Error('Sessão expirada. Faça login novamente.');
      }
      
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro na requisição');
        return data;
      }
      
      if (!res.ok) throw new Error('Erro na requisição HTTP ' + res.status);
      return res;
    } catch (e) {
      if (e.message.includes('Failed to fetch') || !navigator.onLine) {
        throw new Error('Você está offline. Verifique sua conexão com a internet.');
      }
      throw e;
    }
  },
  
  auth: {
    login: (email, password) => api.req('/api/auth/login', { method: 'POST', body: { email, password } }),
    logout: () => api.req('/api/auth/logout', { method: 'POST' }),
    me: () => api.req('/api/auth/me'),
    changePassword: (currentPassword, newPassword) => api.req('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } })
  },
  
  dashboard: {
    summary: () => api.req('/api/dashboard/summary')
  },
  
  users: {
    list: (active, search) => {
      const q = new URLSearchParams();
      if (active !== undefined) q.set('active', active);
      if (search) q.set('search', search);
      return api.req(`/api/users?${q.toString()}`);
    },
    create: (data) => api.req('/api/users', { method: 'POST', body: data }),
    update: (id, data) => api.req(`/api/users/${id}`, { method: 'PATCH', body: data }),
    setStatus: (id, active) => api.req(`/api/users/${id}/status`, { method: 'PATCH', body: { active } }),
    resetPassword: (id, password) => api.req(`/api/users/${id}/reset-password`, { method: 'POST', body: { password } }),
    permissions: (id) => api.req(`/api/users/${id}/permissions`),
    setPermissions: (id, overrides) => api.req(`/api/users/${id}/permissions`, { method: 'PUT', body: { overrides } })
  },
  
  roles: {
    list: () => api.req('/api/roles'),
    create: (data) => api.req('/api/roles', { method: 'POST', body: data }),
    update: (id, data) => api.req(`/api/roles/${id}`, { method: 'PATCH', body: data }),
    permissions: (id) => api.req(`/api/roles/${id}/permissions`),
    setPermissions: (id, permissionIds) => api.req(`/api/roles/${id}/permissions`, { method: 'PUT', body: { permissionIds } })
  },
  
  permissions: {
    list: () => api.req('/api/permissions')
  },
  teams: { list: () => api.req('/api/teams'), create: data => api.req('/api/teams',{method:'POST',body:data}), update: (code,data) => api.req(`/api/teams/${code}`,{method:'PATCH',body:data}) },
  recurrences: {
    list: () => api.req('/api/activity-templates'),
    create: (data) => api.req('/api/activity-templates', { method: 'POST', body: data }),
    update: (id, data) => api.req(`/api/activity-templates/${id}`, { method: 'PATCH', body: data }),
    history: id => api.req(`/api/activity-templates/${id}/history`),
    setStatus: (id, active) => api.req(`/api/activity-templates/${id}/status`, { method: 'PATCH', body: { active } })
  },
  
  activities: {
    list: (status, search, overdue) => {
      const q = new URLSearchParams();
      if (status) q.set('status', status);
      if (search) q.set('search', search);
      if (overdue) q.set('overdue', 'true');
      return api.req(`/api/activities?${q.toString()}`).then(data => Array.isArray(data) ? data : (data.items || []));
    },
    get: (id) => api.req(`/api/activities/${id}`),
    create: (data) => api.req('/api/activities', { method: 'POST', body: data }),
    update: (id, data) => api.req(`/api/activities/${id}`, { method: 'PATCH', body: data }),
    start: (id) => api.req(`/api/activities/${id}/start`, { method: 'POST' }),
    complete: (id, note) => api.req(`/api/activities/${id}/complete`, { method: 'POST', body: { note } }),
    cancel: (id) => api.req(`/api/activities/${id}/cancel`, { method: 'POST' }),
    history: (id) => api.req(`/api/activities/${id}/history`),
    evidence: (id) => api.req(`/api/activities/${id}/evidence`),
    uploadEvidence: (id, file, note, source = 'gallery') => {
      const fd = new FormData();
      fd.append('file', file);
      if (note) fd.append('note', note);
      fd.append('source', source);
      fd.append('capturedAt', new Date(source === 'camera' ? Date.now() : (file.lastModified || Date.now())).toISOString());
      return api.req(`/api/activities/${id}/evidence`, { method: 'POST', body: fd });
    },
    getEvidenceUrl: (id, evidenceId) => `/api/activities/${id}/evidence/${evidenceId}`
  },
  activityNotes: { list: activityId => api.req(`/api/activities/${activityId}/notes`), create: (activityId,body) => api.req(`/api/activities/${activityId}/notes`,{method:'POST',body:{body}}) },
  materials: { list: activityId => api.req(`/api/activities/${activityId}/materials`), create: (activityId,data) => api.req(`/api/activities/${activityId}/materials`,{method:'POST',body:data}) },
  checklists: { list: activityId => api.req(`/api/activities/${activityId}/checklists`), create: (activityId,data) => api.req(`/api/activities/${activityId}/checklists`,{method:'POST',body:data}), setItem: (activityId,checklistId,itemId,checked) => api.req(`/api/activities/${activityId}/checklists/${checklistId}/items/${itemId}`,{method:'PATCH',body:{checked}}) }
};
window.api = api;
