export const documentPermissions = {
  "/dashboard":"dashboard.view","/activities":"activities.view","/activity":"activities.view","/recorrencias":"activities.view","/users":"users.view","/settings":"settings.password",
  "/v11-dashboard.html":"dashboard.view","/v11-activities.html":"activities.view","/v11-activity.html":"activities.view","/v11-recurrences.html":"activities.view","/v11-users.html":"users.view","/v11-settings.html":"settings.password",
  "/check.html":"check.view","/leiturista.html":"leiturista.view","/scanner.html":"scanner.view","/ronda.html":"ronda.view","/adm-ronda.html":"ronda.admin",
  "/diario.html":"diario.view","/adm-diario.html":"diario.admin","/fiscalizacao.html":"fiscalizacao.view","/adm-fiscalizacao.html":"fiscalizacao.admin",
  "/rateios.html":"rateios.view","/adm-rateio.html":"rateios.admin","/orcamentos.html":"orcamentos.view","/reembolso.html":"reembolso.view","/adm.html":"rateios.admin"
};
export const canonicalOfflinePath = path => {
  const canonical = path.startsWith("/legacy/") ? path.slice("/legacy".length) : path;
  return canonical === "/index.html" ? "/dashboard" : canonical;
};
export function documentsForPermissions(permissions) {
  const granted = new Set(permissions || []);
  return Object.entries(documentPermissions).filter(([, permission]) => granted.has(permission)).map(([path]) => path);
}
