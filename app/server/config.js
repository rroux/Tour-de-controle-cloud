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
  // Objectifs de taux de marge (base CA net). Par projet : taux de la trajectoire initiale du CEP,
  // `defaut` à défaut. Global (vues consolidées) : `auto` = objectifs des projets pondérés par le CA, sinon `global`.
  objective: { defaut: 0.25, mode: "auto", global: 0.25 },
  // Exercice à partir duquel le budget est la référence figée de l'onglet CEP (avant : trajectoire initiale).
  budgetRefYear: 2027,
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
config = { ...DEFAULTS, ...config, schedule: { ...DEFAULTS.schedule, ...config.schedule }, objective: migrateObjective(config.objective) };

// Ancien format { value, useCep } : la valeur devient l'objectif par défaut et l'objectif global fixe.
function migrateObjective(o = {}) {
  if (o.value != null && o.defaut == null) return { defaut: o.value, mode: "auto", global: o.value };
  return { ...DEFAULTS.objective, ...o };
}

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
    const rate = (v, prev) => (Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) < 1 ? Number(v) : prev);
    config.objective = {
      defaut: rate(body.objective.defaut, config.objective.defaut),
      mode: ["auto", "fixe"].includes(body.objective.mode) ? body.objective.mode : config.objective.mode,
      global: rate(body.objective.global, config.objective.global),
    };
  }
  if (Number.isInteger(Number(body.budgetRefYear)) && Number(body.budgetRefYear) >= 2000 && Number(body.budgetRefYear) <= 2100) config.budgetRefYear = Number(body.budgetRefYear);
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
