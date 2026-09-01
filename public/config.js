// ==========================================
// BLEXO - CONTROLE DE CONFIGURAÇÃO E VERSÃO
// ==========================================

// IMPORTANTE:
// Ao alterar esta versão, todas as configurações
// locais antigas serão substituídas pelos padrões
// definidos abaixo.
// Versão do produto exibida apenas na área de informações das configurações.
const BLEXO_PRODUCT_VERSION = '11.0.0';

// Versão do formato das preferências locais. Ela permanece independente da
// versão do produto para evitar apagar configurações existentes sem necessidade.
const BLEXO_APP_VERSION = '51.0';

// Chave que registra qual versão já foi aplicada
const BLEXO_VERSION_KEY = 'blexo-app-version';

// Chave das configurações do sistema
const BLEXO_CONFIG_KEY = 'blexo-unificado-config-v2';


// ==========================================
// CONFIGURAÇÕES PADRÃO
// ==========================================

const BLEXO_DEFAULT_CONFIG = {
  watermark: true,

  // Modelos de fotos
  photoTemplate: 'four',
  checkPhotoTemplate: 'four',
  leituristaPhotoTemplate: 'two',
  orcamentosPhotoTemplate: 'two',

  // Selos da Checagem
  sealConfig:
    'Antes|texto|#123047\n' +
    'Depois|texto|#176d9a\n' +
    'Verde|bolinha|#36a269\n' +
    'Amarelo|bolinha|#e5b22e\n' +
    'Vermelho|bolinha|#cb4c4c',

  // Estrutura do condomínio
  blockCount: 26,

  commonAreas: [
    'Salão 1',
    'Salão 2',
    'Academia'
  ],

  // Áreas da Ronda
  rondaAreas: [
    'Salão 1',
    'Salão 2',
    'Academia',
    'Brinquedoteca',
    'Quadra',
    'Churrasqueira Aberta',
    'Espaço Pet',
    'Sede',
    'Portão dos Fundos'
  ],

  // Cabeçalho Ronda
  rondaHeaderColor: '#123047',
  rondaHeaderName: 'Ronda',

  // Rateios
  enableGas: true,
  enableWater: true,

  tagPedestreValue: 15,
  tagVeiculoValue: 30,

  mudancaEntradaValue: 180,
  mudancaSaidaValue: 180,

  // Itens de ressarcimento
  ressarcimentoItems: [
    { name: 'Copo', value: 10 },
    { name: 'Prato', value: 20 },
    { name: 'Talher', value: 5 },
    { name: 'Outros', value: 1 }
  ],

  // Cores dos cabeçalhos
  checkHeaderColor: '#123047',
  leituristaHeaderColor: '#123047',
  scannerHeaderColor: '#123047',
  rateioHeaderColor: '#123047',
  orcamentosHeaderColor: '#123047',
  reembolsoHeaderColor: '#123047',

  // Nomes dos módulos
  checkHeaderName: 'Check',
  leituristaHeaderName: 'Leiturista',
  scannerHeaderName: 'Scanner',
  rateioHeaderName: 'Rateio',
  orcamentosHeaderName: 'Orçamento',
  reembolsoHeaderName: 'Reembolso',

  // Ícones dos módulos
  checkHeaderIcon: '✓',
  leituristaHeaderIcon: 'L',
  scannerHeaderIcon: 'S'
};


// ==========================================
// CÓPIA SEGURA DAS CONFIGURAÇÕES
// ==========================================

function cloneBlexoConfig(config) {
  return JSON.parse(JSON.stringify(config));
}


// ==========================================
// APLICA / FORÇA NOVA VERSÃO
// ==========================================

function aplicarVersaoBlexo() {
  try {
    const versaoSalva = localStorage.getItem(BLEXO_VERSION_KEY);

    // Se a versão publicada mudou, limpa SOMENTE
    // as configurações e aplica os novos padrões.
    if (versaoSalva !== BLEXO_APP_VERSION) {

      console.log(
        `[BLEXO] Atualizando configurações: ` +
        `${versaoSalva || 'sem versão'} → ${BLEXO_APP_VERSION}`
      );

      // Remove configuração antiga
      localStorage.removeItem(BLEXO_CONFIG_KEY);

      // Salva uma cópia limpa dos padrões atuais
      localStorage.setItem(
        BLEXO_CONFIG_KEY,
        JSON.stringify(cloneBlexoConfig(BLEXO_DEFAULT_CONFIG))
      );

      // Marca esta versão como aplicada
      localStorage.setItem(
        BLEXO_VERSION_KEY,
        BLEXO_APP_VERSION
      );
    }

  } catch (error) {
    console.error(
      '[BLEXO] Erro ao aplicar versão das configurações:',
      error
    );
  }
}


// ==========================================
// EXECUTA ANTES DE QUALQUER LEITURA
// ==========================================

aplicarVersaoBlexo();


// ==========================================
// CARREGA CONFIGURAÇÕES
// ==========================================

function blexoConfig() {
  try {
    const raw = localStorage.getItem(BLEXO_CONFIG_KEY);

    // Se não existir configuração, cria com padrão
    if (!raw) {
      const defaults = cloneBlexoConfig(BLEXO_DEFAULT_CONFIG);

      localStorage.setItem(
        BLEXO_CONFIG_KEY,
        JSON.stringify(defaults)
      );

      return defaults;
    }

    const saved = JSON.parse(raw);

    // Proteção contra dados inválidos
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
      throw new Error('Configuração local inválida');
    }

    return {
      ...cloneBlexoConfig(BLEXO_DEFAULT_CONFIG),
      ...saved
    };

  } catch (error) {

    console.error(
      '[BLEXO] Erro ao carregar configurações. Restaurando padrão:',
      error
    );

    const defaults = cloneBlexoConfig(BLEXO_DEFAULT_CONFIG);

    localStorage.setItem(
      BLEXO_CONFIG_KEY,
      JSON.stringify(defaults)
    );

    return defaults;
  }
}


// ==========================================
// SALVA CONFIGURAÇÕES
// ==========================================

function saveBlexoConfig(config) {

  const atual = blexoConfig();

  const merged = {
    ...cloneBlexoConfig(BLEXO_DEFAULT_CONFIG),
    ...atual,
    ...(config || {})
  };

  localStorage.setItem(
    BLEXO_CONFIG_KEY,
    JSON.stringify(merged)
  );

  return merged;
}


// ==========================================
// RESTAURA PADRÕES MANUALMENTE
// ==========================================

function resetBlexoConfig() {

  const defaults = cloneBlexoConfig(BLEXO_DEFAULT_CONFIG);

  localStorage.setItem(
    BLEXO_CONFIG_KEY,
    JSON.stringify(defaults)
  );

  // Mantém a versão atual marcada
  localStorage.setItem(
    BLEXO_VERSION_KEY,
    BLEXO_APP_VERSION
  );

  return defaults;
}
