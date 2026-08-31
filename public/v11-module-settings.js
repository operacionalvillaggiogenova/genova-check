(function (global) {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const reportFields = [
    ["check", "Checagem"],
    ["leiturista", "Leiturista"],
    ["scanner", "Scanner"],
    ["ronda", "Ronda"],
    ["rateio", "Rateios"],
    ["orcamentos", "Orçamentos"],
    ["reembolso", "Reembolso"],
  ];

  const value = (id) => byId(id).value;
  const checked = (id) => byId(id).checked;
  const lines = (id) =>
    value(id)
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  const amount = (id) => {
    const number = Number(value(id));
    return Number.isFinite(number) && number >= 0 ? number : 0;
  };

  function setValue(id, nextValue) {
    const field = byId(id);
    if (field) field.value = nextValue == null ? "" : nextValue;
  }

  function setChecked(id, nextValue) {
    const field = byId(id);
    if (field) field.checked = Boolean(nextValue);
  }

  function renderRefundItems(items) {
    const list = byId("moduleRefundItems");
    list.replaceChildren();
    items.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "refund-config-row";

      const name = document.createElement("input");
      name.type = "text";
      name.maxLength = 80;
      name.placeholder = "Tipo do item";
      name.value = item.name || "";
      name.dataset.refundName = String(index);
      name.setAttribute("aria-label", `Nome do item ${index + 1}`);

      const itemValue = document.createElement("input");
      itemValue.type = "number";
      itemValue.min = "0";
      itemValue.step = "0.01";
      itemValue.value = String(Number(item.value) || 0);
      itemValue.dataset.refundValue = String(index);
      itemValue.setAttribute("aria-label", `Valor do item ${index + 1}`);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn-danger";
      remove.textContent = "Remover";
      remove.addEventListener("click", () => {
        const current = readRefundItems();
        current.splice(index, 1);
        renderRefundItems(current);
      });

      row.append(name, itemValue, remove);
      list.append(row);
    });
  }

  function readRefundItems() {
    return Array.from(
      document.querySelectorAll("[data-refund-name]"),
      (name, index) => ({
        name: name.value.trim(),
        value: Number(
          document.querySelector(`[data-refund-value="${index}"]`)?.value,
        ) || 0,
      }),
    ).filter((item) => item.name);
  }

  function render(config) {
    setChecked("moduleWatermark", config.watermark);
    setChecked("moduleEnableGas", config.enableGas);
    setChecked("moduleEnableWater", config.enableWater);
    setValue("modulePhotoTemplate", config.photoTemplate);
    setValue("moduleCheckPhotoTemplate", config.checkPhotoTemplate);
    setValue(
      "moduleLeituristaPhotoTemplate",
      config.leituristaPhotoTemplate,
    );
    setValue(
      "moduleOrcamentosPhotoTemplate",
      config.orcamentosPhotoTemplate,
    );
    setValue("moduleBlockCount", config.blockCount);
    setValue("moduleCommonAreas", (config.commonAreas || []).join("\n"));
    setValue("moduleRondaAreas", (config.rondaAreas || []).join("\n"));
    setValue("moduleSealConfig", config.sealConfig);
    setValue("moduleTagPedestreValue", config.tagPedestreValue);
    setValue("moduleTagVeiculoValue", config.tagVeiculoValue);
    setValue("moduleMudancaEntradaValue", config.mudancaEntradaValue);
    setValue("moduleMudancaSaidaValue", config.mudancaSaidaValue);
    reportFields.forEach(([prefix]) => {
      const key = prefix === "rateio" ? "rateio" : prefix;
      setValue(
        `module-${prefix}-name`,
        config[`${key}HeaderName`],
      );
      setValue(
        `module-${prefix}-color`,
        config[`${key}HeaderColor`],
      );
      byId(`module-${prefix}-color-value`).textContent =
        config[`${key}HeaderColor`].toUpperCase();
    });
    renderRefundItems(config.ressarcimentoItems || []);
  }

  function collect() {
    const config = {
      watermark: checked("moduleWatermark"),
      enableGas: checked("moduleEnableGas"),
      enableWater: checked("moduleEnableWater"),
      photoTemplate: value("modulePhotoTemplate"),
      checkPhotoTemplate: value("moduleCheckPhotoTemplate"),
      leituristaPhotoTemplate: value("moduleLeituristaPhotoTemplate"),
      orcamentosPhotoTemplate: value("moduleOrcamentosPhotoTemplate"),
      blockCount: Math.min(
        200,
        Math.floor(amount("moduleBlockCount")),
      ),
      commonAreas: lines("moduleCommonAreas"),
      rondaAreas: lines("moduleRondaAreas"),
      sealConfig: value("moduleSealConfig"),
      tagPedestreValue: amount("moduleTagPedestreValue"),
      tagVeiculoValue: amount("moduleTagVeiculoValue"),
      mudancaEntradaValue: amount("moduleMudancaEntradaValue"),
      mudancaSaidaValue: amount("moduleMudancaSaidaValue"),
      ressarcimentoItems: readRefundItems(),
    };
    reportFields.forEach(([prefix]) => {
      const key = prefix === "rateio" ? "rateio" : prefix;
      config[`${key}HeaderName`] = value(`module-${prefix}-name`);
      config[`${key}HeaderColor`] = value(`module-${prefix}-color`);
    });
    return config;
  }

  function showMessage(text, kind) {
    const message = byId("moduleSettingsMessage");
    message.textContent = text;
    message.className = `settings-message ${kind || ""}`;
    message.hidden = false;
    clearTimeout(showMessage.timeout);
    showMessage.timeout = setTimeout(() => {
      message.hidden = true;
    }, 5000);
  }

  function init() {
    const section = byId("moduleSettingsSection");
    if (!section || !global.BlexoConfigBridge) return;
    section.hidden = false;
    render(global.BlexoConfigBridge.load());

    reportFields.forEach(([prefix]) => {
      byId(`module-${prefix}-color`).addEventListener("input", (event) => {
        byId(`module-${prefix}-color-value`).textContent =
          event.target.value.toUpperCase();
      });
    });

    byId("moduleAddRefundItem").addEventListener("click", () => {
      renderRefundItems([...readRefundItems(), { name: "", value: 0 }]);
    });

    byId("moduleSettingsForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const saved = global.BlexoConfigBridge.save(collect());
      render(saved);
      showMessage(
        "Configurações salvas neste aparelho e disponíveis nos módulos.",
        "success",
      );
    });

    byId("moduleResetSettings").addEventListener("click", () => {
      if (
        !global.confirm(
          "Restaurar todas as configurações dos módulos para os valores padrão?",
        )
      ) {
        return;
      }
      render(global.BlexoConfigBridge.reset());
      showMessage("Configurações padrão restauradas.", "success");
    });
  }

  global.initBlexoModuleSettings = init;
})(window);