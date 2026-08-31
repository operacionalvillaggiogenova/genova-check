(function (global) {
  "use strict";

  const CONFIG_KEY = "blexo-unificado-config-v2";
  const VERSION_KEY = "blexo-app-version";
  const APP_VERSION = "51.0";
  const DEFAULTS = {
    watermark: true,
    photoTemplate: "four",
    checkPhotoTemplate: "four",
    leituristaPhotoTemplate: "two",
    orcamentosPhotoTemplate: "two",
    sealConfig:
      "Antes|texto|#123047\nDepois|texto|#176d9a\nVerde|bolinha|#36a269\nAmarelo|bolinha|#e5b22e\nVermelho|bolinha|#cb4c4c",
    blockCount: 26,
    commonAreas: ["Salão 1", "Salão 2", "Academia"],
    rondaAreas: [
      "Salão 1",
      "Salão 2",
      "Academia",
      "Brinquedoteca",
      "Quadra",
      "Churrasqueira Aberta",
      "Espaço Pet",
      "Sede",
      "Portão dos Fundos",
    ],
    rondaHeaderColor: "#123047",
    rondaHeaderName: "Ronda",
    enableGas: true,
    enableWater: true,
    tagPedestreValue: 15,
    tagVeiculoValue: 30,
    mudancaEntradaValue: 180,
    mudancaSaidaValue: 180,
    ressarcimentoItems: [
      { name: "Copo", value: 10 },
      { name: "Prato", value: 20 },
      { name: "Talher", value: 5 },
      { name: "Outros", value: 1 },
    ],
    checkHeaderColor: "#123047",
    leituristaHeaderColor: "#123047",
    scannerHeaderColor: "#123047",
    rateioHeaderColor: "#123047",
    orcamentosHeaderColor: "#123047",
    reembolsoHeaderColor: "#123047",
    checkHeaderName: "Check",
    leituristaHeaderName: "Leiturista",
    scannerHeaderName: "Scanner",
    rateioHeaderName: "Rateio",
    orcamentosHeaderName: "Orçamento",
    reembolsoHeaderName: "Reembolso",
    checkHeaderIcon: "✓",
    leituristaHeaderIcon: "L",
    scannerHeaderIcon: "S",
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const text = (value, fallback, max) => {
    const normalized = typeof value === "string" ? value.trim() : "";
    return normalized ? normalized.slice(0, max || 40) : fallback;
  };
  const color = (value, fallback) =>
    typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
      ? value.toLowerCase()
      : fallback;
  const amount = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  };
  const template = (value, fallback) =>
    ["one", "two", "four", "six"].includes(String(value)) ? value : fallback;
  const lines = (value, fallback) =>
    Array.isArray(value)
      ? value.map((item) => String(item).trim()).filter(Boolean)
      : clone(fallback);

  function normalize(value) {
    const defaults = clone(DEFAULTS);
    const saved =
      value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
      ...defaults,
      ...saved,
      watermark:
        typeof saved.watermark === "boolean"
          ? saved.watermark
          : defaults.watermark,
      photoTemplate: template(saved.photoTemplate, defaults.photoTemplate),
      checkPhotoTemplate: template(
        saved.checkPhotoTemplate,
        defaults.checkPhotoTemplate,
      ),
      leituristaPhotoTemplate: template(
        saved.leituristaPhotoTemplate,
        defaults.leituristaPhotoTemplate,
      ),
      orcamentosPhotoTemplate: template(
        saved.orcamentosPhotoTemplate,
        defaults.orcamentosPhotoTemplate,
      ),
      blockCount: Math.min(
        200,
        Math.floor(amount(saved.blockCount, defaults.blockCount)),
      ),
      commonAreas: lines(saved.commonAreas, defaults.commonAreas),
      rondaAreas: lines(saved.rondaAreas, defaults.rondaAreas),
      enableGas:
        typeof saved.enableGas === "boolean"
          ? saved.enableGas
          : defaults.enableGas,
      enableWater:
        typeof saved.enableWater === "boolean"
          ? saved.enableWater
          : defaults.enableWater,
      sealConfig: text(saved.sealConfig, defaults.sealConfig, 4000),
      checkHeaderName: text(
        saved.checkHeaderName,
        defaults.checkHeaderName,
      ),
      leituristaHeaderName: text(
        saved.leituristaHeaderName,
        defaults.leituristaHeaderName,
      ),
      scannerHeaderName: text(
        saved.scannerHeaderName,
        defaults.scannerHeaderName,
      ),
      rondaHeaderName: text(
        saved.rondaHeaderName,
        defaults.rondaHeaderName,
      ),
      rateioHeaderName: text(
        saved.rateioHeaderName,
        defaults.rateioHeaderName,
      ),
      orcamentosHeaderName: text(
        saved.orcamentosHeaderName,
        defaults.orcamentosHeaderName,
      ),
      reembolsoHeaderName: text(
        saved.reembolsoHeaderName,
        defaults.reembolsoHeaderName,
      ),
      checkHeaderColor: color(
        saved.checkHeaderColor,
        defaults.checkHeaderColor,
      ),
      leituristaHeaderColor: color(
        saved.leituristaHeaderColor,
        defaults.leituristaHeaderColor,
      ),
      scannerHeaderColor: color(
        saved.scannerHeaderColor,
        defaults.scannerHeaderColor,
      ),
      rondaHeaderColor: color(
        saved.rondaHeaderColor,
        defaults.rondaHeaderColor,
      ),
      rateioHeaderColor: color(
        saved.rateioHeaderColor,
        defaults.rateioHeaderColor,
      ),
      orcamentosHeaderColor: color(
        saved.orcamentosHeaderColor,
        defaults.orcamentosHeaderColor,
      ),
      reembolsoHeaderColor: color(
        saved.reembolsoHeaderColor,
        defaults.reembolsoHeaderColor,
      ),
      tagPedestreValue: amount(
        saved.tagPedestreValue,
        defaults.tagPedestreValue,
      ),
      tagVeiculoValue: amount(
        saved.tagVeiculoValue,
        defaults.tagVeiculoValue,
      ),
      mudancaEntradaValue: amount(
        saved.mudancaEntradaValue,
        defaults.mudancaEntradaValue,
      ),
      mudancaSaidaValue: amount(
        saved.mudancaSaidaValue,
        defaults.mudancaSaidaValue,
      ),
      ressarcimentoItems: Array.isArray(saved.ressarcimentoItems)
        ? saved.ressarcimentoItems
            .map((item) => ({
              name: text(item && item.name, "", 80),
              value: amount(item && item.value, 0),
            }))
            .filter((item) => item.name)
        : defaults.ressarcimentoItems,
    };
  }

  function load() {
    try {
      const raw = global.localStorage.getItem(CONFIG_KEY);
      return raw ? normalize(JSON.parse(raw)) : clone(DEFAULTS);
    } catch {
      return clone(DEFAULTS);
    }
  }

  function save(value) {
    const normalized = normalize({ ...load(), ...(value || {}) });
    global.localStorage.setItem(CONFIG_KEY, JSON.stringify(normalized));
    global.localStorage.setItem(VERSION_KEY, APP_VERSION);
    global.dispatchEvent(
      new CustomEvent("blexo-config-changed", { detail: normalized }),
    );
    return normalized;
  }

  function reset() {
    const defaults = clone(DEFAULTS);
    global.localStorage.setItem(CONFIG_KEY, JSON.stringify(defaults));
    global.localStorage.setItem(VERSION_KEY, APP_VERSION);
    global.dispatchEvent(
      new CustomEvent("blexo-config-changed", { detail: defaults }),
    );
    return defaults;
  }

  global.BlexoConfigBridge = {
    APP_VERSION,
    CONFIG_KEY,
    DEFAULTS: clone(DEFAULTS),
    load,
    normalize,
    reset,
    save,
  };
})(window);