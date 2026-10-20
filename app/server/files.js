import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { decrypt } from "./secret.js";

const IS_WINDOWS = process.platform === "win32";
const EXTENSIONS = new Set([".xlsm", ".xlsx"]);
const MAX_DEPTH = 12;

// \\serveur\partage\dossier → \\serveur\partage (racine à authentifier avec net use)
export function uncRoot(p) {
  const m = /^\\\\([^\\/]+)[\\/]([^\\/]+)/.exec(p);
  return m ? `\\\\${m[1]}\\${m[2]}` : null;
}

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 30000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: `${stdout || ""}${stderr || ""}`.trim() });
    });
  });
}

/**
 * Ouvre l'accès à la source.
 * - Sans compte : la session Windows de l'utilisateur est utilisée (cas le plus courant en entreprise).
 * - Avec compte : `net use \\serveur\partage` avec les identifiants enregistrés.
 * Hors Windows (Docker plus tard), le partage doit être monté et `path` pointer sur le point de montage.
 */
export async function connect(source, passwordOverride) {
  const root = uncRoot(source.path);
  if (!IS_WINDOWS || !root || !source.username) return { connected: false };
  const user = source.domain ? `${source.domain}\\${source.username}` : source.username;
  const password = passwordOverride ?? decrypt(source.passwordEnc);
  const res = await run("net", ["use", root, password, `/user:${user}`, "/persistent:no"]);
  // 1219 : une connexion existe déjà vers ce serveur avec d'autres identifiants ; on tente la lecture quand même.
  if (!res.ok && !/1219/.test(res.out)) {
    throw new Error(`Connexion refusée à ${root} : ${res.out.split(/\r?\n/).filter(Boolean).pop() || "erreur inconnue"}`);
  }
  return { connected: res.ok, root };
}

export async function disconnect(state) {
  if (state?.connected && state.root) await run("net", ["use", state.root, "/delete", "/y"]);
}

export function isCandidate(name) {
  return !name.startsWith("~$") && EXTENSIONS.has(path.extname(name).toLowerCase());
}

// Code reconnu = premier code contenu dans le nom du fichier (casse ignorée).
export function matchCode(name, codes) {
  const low = name.toLowerCase();
  return codes.find((c) => low.includes(c.toLowerCase())) || null;
}

/** Liste récursive des fichiers Excel d'une source, avec date de modification et taille. */
export async function listFiles(source) {
  const out = [];
  const errors = [];
  async function walk(dir, depth) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (depth === 0) throw new Error(`Dossier inaccessible ${dir} : ${err.code || err.message}`);
      errors.push({ path: dir, message: err.code || err.message });
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (source.recursive && depth < MAX_DEPTH) await walk(full, depth + 1);
      } else if (e.isFile()) {
        if (!EXTENSIONS.has(path.extname(e.name).toLowerCase())) continue;
        try {
          const st = await fs.stat(full);
          out.push({ path: full, name: e.name, mtime: st.mtimeMs, size: st.size });
        } catch (err) {
          errors.push({ path: full, message: err.code || err.message });
        }
      }
    }
  }
  await walk(source.path, 0);
  return { files: out, errors };
}
