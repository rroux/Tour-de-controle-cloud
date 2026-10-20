import { exitAfterLog, LOG_FILE } from "./log.js";
import express from "express";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { APP_DIR, DATA_DIR } from "./storage.js";
import { addSource, deleteSource, getConfig, publicConfig, updateSettings, updateSource } from "./config.js";
import { getHistory, getProjects, runScan, scanStatus, testSource } from "./scanner.js";
import { nextRun, startScheduler } from "./scheduler.js";

const PORT = Number(process.env.PORT || 3000);
// Par défaut l'application n'écoute que sur ce PC. HOST=0.0.0.0 pour l'ouvrir au réseau.
const HOST = process.env.HOST || "127.0.0.1";

const app = express();
app.use(express.json({ limit: "1mb" }));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

app.get("/api/projects", (req, res) => res.json(getProjects()));

app.get("/api/config", (req, res) => res.json({ ...publicConfig(), nextRun: nextRun(getConfig().schedule) }));
app.put("/api/config", (req, res) => res.json({ ...updateSettings(req.body || {}), nextRun: nextRun(getConfig().schedule) }));

app.post("/api/sources", (req, res) => res.status(201).json({ id: addSource(req.body || {}) }));
app.put("/api/sources/:id", (req, res) => {
  updateSource(req.params.id, req.body || {});
  res.json({ ok: true });
});
app.delete("/api/sources/:id", (req, res) => {
  deleteSource(req.params.id);
  res.json({ ok: true });
});

// Test d'une source : soit une source enregistrée (id), soit les champs du formulaire.
app.post(
  "/api/sources/test",
  wrap(async (req, res) => {
    const body = req.body || {};
    const saved = body.id && getConfig().sources.find((s) => s.id === body.id);
    const source = { ...(saved || {}), ...body, recursive: body.recursive ?? saved?.recursive ?? true };
    if (!source.path) return res.status(400).json({ ok: false, message: "Indiquez le chemin de la source." });
    res.json(await testSource(source, body.password || undefined));
  }),
);

app.post("/api/scan", (req, res) => {
  const status = scanStatus();
  if (status.running) return res.status(409).json({ message: "Un scan est déjà en cours.", ...status });
  runScan("Manuel").catch((err) => console.error("Scan en échec :", err));
  res.status(202).json({ started: true });
});
app.get("/api/scan/status", (req, res) => res.json(scanStatus()));
app.get("/api/scans", (req, res) => res.json(getHistory()));

app.use("/api", (req, res) => res.status(404).json({ message: "Route inconnue." }));

const dist = path.join(APP_DIR, "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  app.get("/", (req, res) => res.type("text").send("Interface non compilée : lancez « npm run build » puis relancez le serveur."));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Erreur interne." });
});

const APP_URL = `http://${HOST === "0.0.0.0" || HOST === "127.0.0.1" ? "localhost" : HOST}:${PORT}`;

function openBrowser(url) {
  const [cmd, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  execFile(cmd, args, { windowsHide: true }, (err) => err && console.warn(`Ouverture du navigateur impossible : ouvrez ${url} à la main.`));
}

console.log(`Démarrage · Node.js ${process.version} · ${os.platform()} ${os.release()} · utilisateur ${os.userInfo().username}`);
console.log(`Application : ${APP_DIR}`);
console.log(`Données : ${DATA_DIR}`);
console.log(`Journal : ${LOG_FILE}`);

const server = app.listen(PORT, HOST, () => {
  console.log("");
  console.log(`  OK  Application démarrée : ${APP_URL}`);
  console.log("      Laissez cette fenêtre ouverte ; la fermer arrête l'application.");
  console.log("");
  startScheduler();
  if (process.env.OPEN_BROWSER === "1") openBrowser(APP_URL);
  // Premier lancement : scan immédiat pour remplir l'application.
  if (!getHistory().length) runScan("Premier lancement").catch((err) => console.error(err));
});

server.on("error", async (err) => {
  if (err.code === "EADDRINUSE") {
    // Le port est pris : est-ce déjà la Tour de contrôle lancée dans une autre fenêtre ?
    const running = await fetch(`http://127.0.0.1:${PORT}/api/scan/status`)
      .then((r) => r.json())
      .then((d) => typeof d.running === "boolean")
      .catch(() => false);
    if (running) {
      console.log(`L'application tourne déjà dans une autre fenêtre : ouverture de ${APP_URL}`);
      if (process.env.OPEN_BROWSER === "1") openBrowser(APP_URL);
      return exitAfterLog(0);
    }
    console.error(`ERREUR : le port ${PORT} est déjà utilisé par un autre programme.`);
    console.error(`Choisissez un autre port : dans une invite de commandes, tapez « set PORT=3010 » puis lancez start.bat.`);
  } else if (err.code === "EACCES") {
    console.error(`ERREUR : accès refusé au port ${PORT}. Choisissez un port au-dessus de 1024 (set PORT=3010).`);
  } else {
    console.error(`ERREUR : démarrage du serveur impossible : ${err.message}`);
  }
  exitAfterLog(2);
});

process.on("uncaughtException", (err) => {
  console.error("ERREUR inattendue :", err);
  exitAfterLog(1);
});
