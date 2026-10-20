// Empreintes des dépendances npm et des sources de l'interface, utilisées par start.bat :
// il ne relance npm install / npm run build que si elles ont changé (après un git pull par exemple).
//   node scripts/build-state.mjs check deps|build   → code 0 si à jour, 1 sinon
//   node scripts/build-state.mjs save deps|build    → enregistre l'empreinte après une installation réussie
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TARGETS = {
  deps: { inputs: ["package.json", "package-lock.json"], stamp: "node_modules/.cep-deps", required: ["express", "xlsx", "vite", "react"] },
  build: { inputs: ["package-lock.json", "vite.config.js", "client"], stamp: "dist/.cep-build", required: [] },
};

function files(rel) {
  const full = path.join(APP, rel);
  if (!fs.existsSync(full)) return [];
  if (fs.statSync(full).isFile()) return [rel];
  return fs
    .readdirSync(full, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((e) => files(path.join(rel, e.name)));
}

function fingerprint(target) {
  const h = crypto.createHash("sha256");
  for (const rel of target.inputs.flatMap(files)) {
    h.update(rel.replace(/\\/g, "/"));
    // Fins de ligne normalisées : une conversion CRLF/LF par git ne doit pas forcer une recompilation.
    h.update(fs.readFileSync(path.join(APP, rel), "utf8").replace(/\r\n/g, "\n"));
  }
  return h.digest("hex");
}

const [action, name] = process.argv.slice(2);
const target = TARGETS[name];
if (!target || !["check", "save"].includes(action)) {
  console.error("Usage : node scripts/build-state.mjs check|save deps|build");
  process.exit(2);
}
const stamp = path.join(APP, target.stamp);

if (action === "save") {
  fs.mkdirSync(path.dirname(stamp), { recursive: true });
  fs.writeFileSync(stamp, fingerprint(target));
  process.exit(0);
}

const missing = target.required.filter((pkg) => !fs.existsSync(path.join(APP, "node_modules", pkg, "package.json")));
if (missing.length) {
  console.log(`Dépendances manquantes : ${missing.join(", ")}`);
  process.exit(1);
}
let saved = "";
try {
  saved = fs.readFileSync(stamp, "utf8").trim();
} catch {}
if (saved !== fingerprint(target)) {
  console.log(saved ? "Les fichiers ont changé depuis la dernière installation." : "Aucune installation enregistrée.");
  process.exit(1);
}
process.exit(0);
