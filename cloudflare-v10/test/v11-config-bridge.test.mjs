import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const bridgeSource = readFileSync(
  new URL("../../public/legacy/blexo-config-bridge.js", import.meta.url),
  "utf8",
);
const legacyConfigSource = readFileSync(
  new URL("../../public/legacy/config.js", import.meta.url),
  "utf8",
);

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

function loadBridge(initial = {}) {
  const localStorage = storage(initial);
  const window = {
    localStorage,
    dispatchEvent() {},
  };
  const sandbox = {
    console,
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    window,
  };
  vm.runInNewContext(bridgeSource, sandbox);
  return { bridge: window.BlexoConfigBridge, localStorage };
}

test("V11 bridge defaults stay identical to the preserved legacy defaults", () => {
  const localStorage = storage({ "blexo-app-version": "51.0" });
  const sandbox = { console, localStorage };
  vm.runInNewContext(
    `${legacyConfigSource}\nglobalThis.legacyDefaults = BLEXO_DEFAULT_CONFIG;`,
    sandbox,
  );
  const { bridge } = loadBridge();
  assert.deepEqual(
    JSON.parse(JSON.stringify(bridge.DEFAULTS)),
    JSON.parse(JSON.stringify(sandbox.legacyDefaults)),
  );
});

test("opening settings reads existing values without rewriting storage", () => {
  const saved = {
    checkHeaderName: "Condomínio Aurora",
    tagPedestreValue: 27.5,
    unknownFutureField: "preserve",
  };
  const raw = JSON.stringify(saved);
  const { bridge, localStorage } = loadBridge({
    "blexo-unificado-config-v2": raw,
  });
  const loaded = bridge.load();
  assert.equal(loaded.checkHeaderName, "Condomínio Aurora");
  assert.equal(loaded.tagPedestreValue, 27.5);
  assert.equal(loaded.unknownFutureField, "preserve");
  assert.equal(localStorage.getItem("blexo-unificado-config-v2"), raw);
  assert.equal(localStorage.getItem("blexo-app-version"), null);
});

test("saving uses the legacy key and marks the compatible app version", () => {
  const { bridge, localStorage } = loadBridge();
  bridge.save({
    blockCount: 999,
    commonAreas: [" Salão ", "", "Academia"],
    enableGas: false,
  });
  const saved = JSON.parse(
    localStorage.getItem("blexo-unificado-config-v2"),
  );
  assert.equal(saved.blockCount, 200);
  assert.deepEqual(saved.commonAreas, ["Salão", "Academia"]);
  assert.equal(saved.enableGas, false);
  assert.equal(localStorage.getItem("blexo-app-version"), "51.0");
});