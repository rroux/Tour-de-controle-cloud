import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { dateTimeFr } from "./format.js";
import { availableYears, defaultYear, dpOf, figures, NO_DP, setBudgetRefYear, setObjectiveSettings, status } from "./model.js";
import Synthese from "./views/Synthese.jsx";
import Portefeuille from "./views/Portefeuille.jsx";
import Projets from "./views/Projets.jsx";
import Activite from "./views/Activite.jsx";
import Controle from "./views/Controle.jsx";
import Analyses from "./views/Analyses.jsx";
import Parametres from "./views/Parametres.jsx";

const VIEWS = [
  { id: "synthese", label: "Synthèse" },
  { id: "portefeuille", label: "Portefeuille DP" },
  { id: "projets", label: "Projets" },
  { id: "activite", label: "Activité" },
  { id: "controle", label: "Contrôle MAJ" },
  { id: "analyses", label: "Analyses" },
  { id: "parametres", label: "Paramètres" },
];

const ICONS = {
  synthese: (
    <>
      <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    </>
  ),
  portefeuille: (
    <>
      <circle cx="8" cy="5" r="2.6" />
      <path d="M2.5 14.5c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
    </>
  ),
  projets: <path d="M2 3.5h12M2 8h12M2 12.5h12" />,
  activite: <path d="M1.5 13.5h13M3.5 11V7M7 11V3M10.5 11V6M14 11V9" />,
  analyses: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.4 10.4l4 4M5 7.5l1.5 1.5L9.5 5.5" />
    </>
  ),
  controle: (
    <>
      <rect x="2" y="1.5" width="12" height="13" rx="1.5" />
      <path d="M5 8l2 2 4-4.5" />
    </>
  ),
  parametres: (
    <>
      <circle cx="8" cy="8" r="2.3" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
    </>
  ),
};

const LEVEL_RANK = { crit: 0, warn: 1, ok: 2, none: 3 };

const readHash = () => {
  const [view, key] = decodeURIComponent(location.hash.slice(1)).split("/");
  return { view: VIEWS.some((v) => v.id === view) ? view : "synthese", key: key || null };
};

export default function App() {
  const [route, setRoute] = useState(readHash);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [scan, setScan] = useState({ running: false });
  const [year, setYear] = useState(null);
  const [compare, setCompare] = useState(null);
  const [client, setClient] = useState("");
  const [entite, setEntite] = useState("");
  const [dp, setDp] = useState("");
  const [period, setPeriod] = useState("realise");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api.projects();
      setObjectiveSettings(d.objective);
      setBudgetRefYear(d.budgetRefYear);
      setData(d);
      setLoadError("");
      setYear((y) => y ?? defaultYear(d.projects));
    } catch (err) {
      setLoadError(`Impossible de joindre le serveur : ${err.message}`);
    }
  }, []);

  useEffect(() => {
    load();
    api.scanStatus().then(setScan).catch(() => {});
    const onHash = () => setRoute(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [load]);

  // Pendant un scan : suivi toutes les 1,5 s, puis rechargement des données.
  useEffect(() => {
    if (!scan.running) return;
    const t = setInterval(async () => {
      const s = await api.scanStatus().catch(() => ({ running: false }));
      setScan(s);
      if (!s.running) {
        await load();
        setToast("Scan terminé");
      }
    }, 1500);
    return () => clearInterval(t);
  }, [scan.running, load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const go = (view, key) => {
    location.hash = key ? `${view}/${encodeURIComponent(key)}` : view;
  };

  const startScan = async () => {
    const r = await api.scan();
    setScan({ running: true, progress: "Démarrage" });
    if (r.message) setToast(r.message);
  };

  const projects = data?.projects || [];
  const clients = useMemo(() => [...new Set(projects.map((p) => p.client || p.key))].sort((a, b) => a.localeCompare(b, "fr")), [projects]);
  const entites = useMemo(() => [...new Set(projects.map((p) => p.entite).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")), [projects]);
  const selected = useMemo(
    () => projects.filter((p) => (!client || (p.client || p.key) === client) && (!entite || p.entite === entite) && (!dp || dpOf(p) === dp)),
    [projects, client, entite, dp],
  );
  const years = useMemo(() => availableYears(projects), [projects]);
  const curYear = year ?? new Date().getFullYear();

  // Portefeuilles par directeur de projet : nombre de projets et état le plus grave, pour le rail.
  const dps = useMemo(() => {
    const map = new Map();
    for (const p of projects) {
      const k = dpOf(p);
      const lvl = status(p, figures(p, "annee", curYear)).level;
      const cur = map.get(k) || { dp: k, count: 0, level: "none" };
      cur.count += 1;
      if (LEVEL_RANK[lvl] < LEVEL_RANK[cur.level]) cur.level = lvl;
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => (a.dp === NO_DP) - (b.dp === NO_DP) || a.dp.localeCompare(b.dp, "fr"));
  }, [projects, curYear]);

  const filters = { year: curYear, setYear, years, compare: compare !== curYear && years.includes(compare) ? compare : null, setCompare, client, setClient, clients, entite, setEntite, entites, dp, setDp, dps: dps.map((d) => d.dp), period, setPeriod };
  const last = data?.lastScan;

  return (
    <div className="app">
      <nav className="rail" aria-label="Navigation">
        <div className="brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M12 3v18M7 21h10M9 7h6l-1 6h-4z" />
            <circle cx="12" cy="4" r="1.4" fill="currentColor" />
          </svg>
          <span>
            Tour de contrôle
            <small>Comptes d'exploitation</small>
          </span>
        </div>
        {VIEWS.map((v) => (
          <button key={v.id} className="nav" aria-current={route.view === v.id ? "page" : undefined} onClick={() => go(v.id)}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{ICONS[v.id]}</svg>
            {v.label}
          </button>
        ))}
        {dps.length > 0 && (
          <div className="dps" role="group" aria-label="Portefeuilles par directeur de projet">
            <div className="dps-h">Directeurs de projet</div>
            {[{ dp: "", count: projects.length }, ...dps].map((d) => (
              <button
                key={d.dp || "*"}
                className="dp"
                aria-pressed={dp === d.dp}
                onClick={() => {
                  setDp(d.dp);
                  go("portefeuille");
                }}
              >
                <span className={`lvl ${d.level || ""}`} aria-hidden="true" />
                <span className="n">{d.dp || "Tous les DP"}</span>
                <span className="c">{d.count}</span>
              </button>
            ))}
          </div>
        )}
        <div className="foot" aria-live="polite">
          {scan.running ? (
            <>
              <span className="dot run" />
              {scan.progress || "Scan en cours"}
            </>
          ) : last ? (
            <>
              <span className={`dot${last.errors ? " err" : ""}`} />
              Dernier scan : {dateTimeFr(last.startedAt)}
              <br />
              {projects.length} projet{projects.length > 1 ? "s" : ""} consolidé{projects.length > 1 ? "s" : ""}
              {last.errors ? ` · ${last.errors} erreur${last.errors > 1 ? "s" : ""}` : ""}
            </>
          ) : (
            "Aucun scan pour le moment"
          )}
        </div>
      </nav>

      {loadError && (
        <main>
          <div className="banner crit">{loadError}</div>
        </main>
      )}

      {data &&
        (route.view === "synthese" ? (
          <Synthese projects={selected} data={data} filters={filters} go={go} startScan={startScan} />
        ) : route.view === "portefeuille" ? (
          <Portefeuille projects={selected} data={data} filters={filters} go={go} />
        ) : route.view === "projets" ? (
          <Projets projects={selected} allProjects={projects} filters={filters} selectedKey={route.key} go={go} reload={load} setToast={setToast} />
        ) : route.view === "activite" ? (
          <Activite projects={selected} filters={filters} go={go} />
        ) : route.view === "controle" ? (
          <Controle projects={selected} filters={filters} go={go} />
        ) : route.view === "analyses" ? (
          <Analyses projects={selected} filters={filters} go={go} setDp={setDp} setToast={setToast} />
        ) : (
          <Parametres scan={scan} startScan={startScan} reload={load} setToast={setToast} projects={projects} />
        ))}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
