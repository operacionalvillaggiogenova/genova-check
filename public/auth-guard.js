(async function(){
  try {
    const auth=await BlexoAuth.requireUser({allowOffline:true});
    const pathCode={
      '/check.html':'check','/leiturista.html':'leiturista','/scanner.html':'scanner',
      '/ronda.html':'ronda','/diario.html':'diary','/fiscalizacao.html':'inspection',
      '/rateios.html':'rateio','/orcamentos.html':'budgets','/reembolso.html':'reimbursement',
      '/adm-rateio.html':'admin-rateio','/adm.html':'reports','/adm-ronda.html':'reports',
      '/adm-fiscalizacao.html':'reports','/adm-diario.html':'reports','/admin-config.html':'settings',
      '/settings.html':'settings'
    };
    const required=pathCode[location.pathname];
    if(required&&!(auth.user.modules||[]).some(module=>module.code===required)){
      document.body.innerHTML='<main style="font-family:system-ui;max-width:620px;margin:12vh auto;padding:28px"><h1>Ferramenta não liberada</h1><p>Este módulo não está disponível para seu perfil e equipe. A liberação pode ser ajustada nas configurações do sistema.</p><p><a href="/">Voltar ao início</a></p></main>';
    }
  } catch (error) {
    if (!navigator.onLine && !BlexoAuth.remembered()) {
      document.documentElement.innerHTML='<body style="font-family:system-ui;padding:28px"><h1>Primeiro acesso necessário</h1><p>Conecte o aparelho à internet e faça login antes de utilizar esta ferramenta offline.</p></body>';
    }
  }
})();
