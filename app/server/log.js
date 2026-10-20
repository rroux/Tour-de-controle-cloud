import fs from "node:fs";
import path from "node:path";
import util from "node:util";
import { APP_DIR } from "./storage.js";

// Toute la sortie console du serveur est aussi écrite dans logs/server.log (horodatée).
const DIR = path.resolve(process.env.CEP_LOG_DIR || path.join(APP_DIR, "logs"));
export const LOG_FILE = path.join(DIR, "server.log");
const MAX_SIZE = 5 * 1024 * 1024;

let stream = null;
try {
  fs.mkdirSync(DIR, { recursive: true });
  try {
    if (fs.statSync(LOG_FILE).size > MAX_SIZE) fs.renameSync(LOG_FILE, `${LOG_FILE}.old`);
  } catch {}
  stream = fs.createWriteStream(LOG_FILE, { flags: "a" });
  stream.on("error", () => (stream = null));
} catch (err) {
  console.warn(`Journal impossible à écrire dans ${DIR} : ${err.message}`);
}

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

for (const level of ["log", "info", "warn", "error"]) {
  const original = console[level].bind(console);
  const tag = level === "log" ? "INFO " : level.toUpperCase().padEnd(5);
  console[level] = (...args) => {
    original(...args);
    stream?.write(`${stamp()} ${tag} ${util.format(...args)}\n`);
  };
}

/** Termine le processus après avoir vidé le journal sur le disque. */
export function exitAfterLog(code) {
  if (!stream) process.exit(code);
  stream.end(() => process.exit(code));
  setTimeout(() => process.exit(code), 1000).unref();
}
