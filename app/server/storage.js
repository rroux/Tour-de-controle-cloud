import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.resolve(process.env.CEP_DATA_DIR || path.join(APP_DIR, "data"));

fs.mkdirSync(DATA_DIR, { recursive: true });

export function dataPath(name) {
  return path.join(DATA_DIR, name);
}

export function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(dataPath(name), "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") console.error(`Lecture impossible de ${name} :`, err.message);
    return fallback;
  }
}

// Écriture atomique : fichier temporaire puis renommage, pour ne jamais laisser un JSON tronqué.
export function writeJson(name, value) {
  const target = dataPath(name);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, target);
}
