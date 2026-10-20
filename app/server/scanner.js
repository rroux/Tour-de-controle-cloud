import path from "node:path";
import { getConfig } from "./config.js";
import { connect, disconnect, isCandidate, listFiles, matchCode } from "./files.js";
import { parseCepFile, PARSER_VERSION } from "./cepParser.js";
import { readJson, writeJson } from "./storage.js";

const STORE = "projects.json";
const HISTORY = "scans.json";
const MAX_HISTORY = 50;

// store.files : { [chemin]: { mtime, size, parser, sourceId, code, project | error } }
let store = readJson(STORE, { files: {} });
let history = readJson(HISTORY, []);
let running = null;

export function getHistory() {
  return history;
}

export function scanStatus() {
  return running ? { running: true, startedAt: running.startedAt, progress: running.progress } : { running: false };
}

/**
 * Projets consolidés : un projet par code (CODE PROJET ou préfixe du nom de fichier).
 * Si plusieurs fichiers portent le même code, le plus récemment modifié l'emporte.
 */
export function getProjects() {
  const cfg = getConfig();
  const enabled = new Set(cfg.sources.filter((s) => s.enabled).map((s) => s.id));
  const byKey = new Map();
  const errors = [];
  for (const [file, entry] of Object.entries(store.files)) {
    if (!enabled.has(entry.sourceId)) continue;
    if (entry.error) {
      errors.push({ file, name: path.basename(file), code: entry.code, message: entry.error, mtime: entry.mtime });
      continue;
    }
    const p = entry.project;
    if (!p) continue;
    const prev = byKey.get(p.key);
    const item = { ...p, file, fileName: path.basename(file), fileMtime: entry.mtime, matchedCode: entry.code, sourceId: entry.sourceId };
    if (!prev || prev.fileMtime < entry.mtime) {
      if (prev) item.duplicates = [...(prev.duplicates || []), prev.file];
      else item.duplicates = [];
      byKey.set(p.key, item);
    } else {
      prev.duplicates.push(file);
    }
  }
  return { projects: [...byKey.values()], errors, lastScan: history[0] || null, staleDays: cfg.staleDays, objective: cfg.objective };
}

/** Lance un scan de toutes les sources actives. `trigger` = "Planifié" | "Manuel". */
export async function runScan(trigger = "Manuel") {
  if (running) return { alreadyRunning: true };
  const cfg = getConfig();
  const started = Date.now();
  running = { startedAt: new Date(started).toISOString(), progress: "Préparation" };
  const run = {
    id: started.toString(36),
    startedAt: running.startedAt,
    trigger,
    retained: 0,
    unchanged: 0,
    ignored: 0,
    errors: 0,
    items: [],
    sources: [],
  };
  const log = (status, file, detail, code) => run.items.length < 2000 && run.items.push({ status, file, detail, code });
  const seen = new Set();

  try {
    if (!cfg.codes.length) log("warning", "", "Aucun code d'identification : aucun fichier ne peut être retenu.");
    for (const source of cfg.sources.filter((s) => s.enabled)) {
      running.progress = `Lecture de ${source.name}`;
      const srcLog = { id: source.id, name: source.name, ok: true, files: 0, message: "" };
      let conn;
      try {
        conn = await connect(source);
        const { files, errors } = await listFiles(source);
        for (const e of errors) log("error", e.path, e.message);
        for (const f of files) {
          seen.add(f.path);
          if (!isCandidate(f.name)) {
            run.ignored++;
            log("ignored", f.path, "Fichier temporaire Excel");
            continue;
          }
          const code = matchCode(f.name, cfg.codes);
          if (!code) {
            run.ignored++;
            log("ignored", f.path, "Aucun code reconnu dans le nom");
            delete store.files[f.path];
            continue;
          }
          srcLog.files++;
          const prev = store.files[f.path];
          if (cfg.onlyModified && prev && prev.mtime === f.mtime && prev.size === f.size && prev.parser === PARSER_VERSION && prev.code === code) {
            if (prev.error) {
              run.errors++;
              log("error", f.path, `${prev.error} (fichier inchangé)`, code);
            } else {
              run.retained++;
              run.unchanged++;
            }
            continue;
          }
          running.progress = `Lecture de ${f.name}`;
          try {
            const project = await parseCepFile(f.path, f.name);
            store.files[f.path] = { mtime: f.mtime, size: f.size, parser: PARSER_VERSION, sourceId: source.id, code, project };
            run.retained++;
            log("retained", f.path, `Code ${code}`, code);
          } catch (err) {
            store.files[f.path] = { mtime: f.mtime, size: f.size, parser: PARSER_VERSION, sourceId: source.id, code, error: err.message };
            run.errors++;
            log("error", f.path, err.message, code);
          }
        }
      } catch (err) {
        srcLog.ok = false;
        srcLog.message = err.message;
        run.errors++;
        log("error", source.path, err.message);
      } finally {
        await disconnect(conn);
      }
      run.sources.push(srcLog);
    }

    // Fichiers disparus des sources joignables : retirés de la consolidation.
    const reachable = new Set(run.sources.filter((s) => s.ok).map((s) => s.id));
    for (const [file, entry] of Object.entries(store.files)) {
      if (!seen.has(file) && (reachable.has(entry.sourceId) || !cfg.sources.some((s) => s.id === entry.sourceId))) {
        delete store.files[file];
      }
    }
    writeJson(STORE, store);
  } finally {
    run.finishedAt = new Date().toISOString();
    run.durationMs = Date.now() - started;
    history = [run, ...history].slice(0, MAX_HISTORY);
    writeJson(HISTORY, history);
    running = null;
  }
  return run;
}

/** Test d'une source sans l'enregistrer : accès, nombre de fichiers visibles et retenus. */
// Compte utilisé pour lire la source : le compte de service saisi, sinon la session Windows qui a lancé l'application.
function sessionIdentity(source) {
  if (source.username) return source.domain ? `${source.domain}\\${source.username}` : source.username;
  const user = process.env.USERNAME || process.env.USER || "";
  return process.env.USERDOMAIN && user ? `${process.env.USERDOMAIN}\\${user}` : user;
}

export async function testSource(source, password) {
  const cfg = getConfig();
  let conn;
  try {
    conn = await connect(source, password);
    const { files } = await listFiles(source);
    const candidates = files.filter((f) => isCandidate(f.name));
    const matching = candidates.filter((f) => matchCode(f.name, cfg.codes));
    return {
      ok: true,
      visible: candidates.length,
      matching: matching.length,
      sample: matching.slice(0, 8).map((f) => f.name),
      identity: sessionIdentity(source),
    };
  } catch (err) {
    return { ok: false, message: err.message };
  } finally {
    await disconnect(conn);
  }
}
