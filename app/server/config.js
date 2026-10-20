import crypto from "node:crypto";
import path from "node:path";
import { APP_DIR, readJson, writeJson } from "./storage.js";
import { encrypt } from "./secret.js";

const FILE = "config.json";

const DEFAULTS = {
  sources: [],
  codes: [],
  schedule: { mode: "daily", time: "06:00" },
  onlyModified: true,
  staleDays: 30,
  // Objectif de taux de marge : valeur unique, ou marge minimum saisie dans chaque CEP si `useCep`.
  objective: { value: 0.25, useCep: false },
};

// Premier lancement : une source « Exemples » pointe sur le dossier demo/ pour voir l'application remplie.
function firstRun() {
  return {
    ...DEFAULTS,
    sources: [
      {
        id: crypto.randomUUID(),
        name: "Exemples (démo)",
        path: path.join(APP_DIR, "demo"),
        domain: "",
        username: "",
        passwordEnc: "",
        recursive: true,
        enabled: true,
      },
    ],
    codes: ["DEMO-ACME", "DEMO-BETA", "DEMO-GAMMA", "DEMO-DELTA", "DEMO-EPSI", "DEMO-ZETA"],
  };
}

let config = readJson(FILE, null);
if (!config) {
  config = firstRun();
  writeJson(FILE, config);
}
config = { ...DEFAULTS, ...config, schedule: { ...DEFAULTS.schedule, ...config.schedule }, objective: { ...DEFAULTS.objective, ...config.objective } };

export function getConfig() {
  return config;
}

// Version envoyée au navigateur : jamais de mot de passe, seulement un indicateur.
export function publicConfig() {
  return {
    ...config,
    sources: config.sources.map(({ passwordEnc, ...s }) => ({ ...s, hasPassword: Boolean(passwordEnc) })),
  };
}

function save() {
  writeJson(FILE, config);
}

const SCHEDULE_MODES = ["daily", "workdays", "hourly", "manual"];

export function updateSettings(body) {
  if (Array.isArray(body.codes)) {
    const seen = new Set();
    config.codes = body.codes
      .map((c) => String(c).trim())
      .filter((c) => c && !seen.has(c.toLowerCase()) && seen.add(c.toLowerCase()));
  }
  if (body.schedule) {
    const mode = SCHEDULE_MODES.includes(body.schedule.mode) ? body.schedule.mode : config.schedule.mode;
    const time = /^\d{2}:\d{2}$/.test(body.schedule.time || "") ? body.schedule.time : config.schedule.time;
    config.schedule = { mode, time };
  }
  if (body.objective) {
    const v = Number(body.objective.value);
    config.objective = {
      value: Number.isFinite(v) && v > 0 && v < 1 ? v : config.objective.value,
      useCep: typeof body.objective.useCep === "boolean" ? body.objective.useCep : config.objective.useCep,
    };
  }
  if (typeof body.onlyModified === "boolean") config.onlyModified = body.onlyModified;
  if (Number.isFinite(Number(body.staleDays)) && Number(body.staleDays) > 0) config.staleDays = Math.round(Number(body.staleDays));
  save();
  return publicConfig();
}

function cleanSource(input, previous = {}) {
  const src = {
    id: previous.id || crypto.randomUUID(),
    name: String(input.name ?? previous.name ?? "").trim() || "Source sans nom",
    path: String(input.path ?? previous.path ?? "").trim(),
    domain: String(input.domain ?? previous.domain ?? "").trim(),
    username: String(input.username ?? previous.username ?? "").trim(),
    passwordEnc: previous.passwordEnc || "",
    recursive: input.recursive ?? previous.recursive ?? true,
    enabled: input.enabled ?? previous.enabled ?? true,
  };
  // Mot de passe : absent = inchangé, chaîne vide explicite avec clearPassword = effacé.
  if (input.clearPassword) src.passwordEnc = "";
  else if (input.password) src.passwordEnc = encrypt(input.password);
  if (!src.path) throw Object.assign(new Error("Le chemin de la source est obligatoire."), { status: 400 });
  return src;
}

export function addSource(input) {
  const src = cleanSource(input);
  config.sources.push(src);
  save();
  return src.id;
}

export function updateSource(id, input) {
  const i = config.sources.findIndex((s) => s.id === id);
  if (i < 0) throw Object.assign(new Error("Source introuvable."), { status: 404 });
  config.sources[i] = cleanSource(input, config.sources[i]);
  save();
}

export function deleteSource(id) {
  config.sources = config.sources.filter((s) => s.id !== id);
  save();
}
