import React, { useMemo, useState } from "react";
import Band from "../components/Band.jsx";
import { Block, Empty, Pill } from "../components/ui.jsx";
import { analyses, THEMES } from "../analyses.js";

const LEVEL = { crit: "Critique", warn: "À surveiller", info: "Information" };

export default function Analyses({ projects, filters, go, setDp }) {
  const { year } = filters;
  const [theme, setTheme] = useState("");
  const [level, setLevel] = useState("");
  const all = useMemo(() => analyses(projects, year), [projects, year]);
  const shown = all.filter((a) => (!theme || a.theme === theme) && (!level || a.level === level));
  const count = (l, t = theme) => all.filter((a) => a.level === l && (!t || a.theme === t)).length;

  const band = (
    <Band
      title="Analyses"
      eyebrow={`Constats calculés à partir des CEP · exercice ${year} · ${projects.length} projet${projects.length > 1 ? "s" : ""}`}
      filters={filters}
      showPeriod={false}
      figures={[
        { k: "Critiques", v: String(count("crit", "")), d: "à traiter en priorité", tone: count("crit", "") ? "down" : "" },
        { k: "À surveiller", v: String(count("warn", "")), d: "signaux faibles" },
        { k: "Informations", v: String(count("info", "")), d: "leviers et échéances" },
        { k: "Projets concernés", v: String(new Set(all.filter((a) => a.key).map((a) => a.key)).size), unit: ` / ${projects.length}` },
      ]}
    />
  );

  if (!projects.length) {
    return (
      <main>
        <div className="wrap">
          {band}
          <div className="card"><Empty title="Aucun projet">Aucun CEP consolidé pour ce filtre.</Empty></div>
        </div>
      </main>
    );
  }

  const open = (a) => {
    if (a.key) go("projets", a.key);
    else if (a.dp) {
      setDp(a.dp);
      go("portefeuille");
    }
  };

  return (
    <main>
      <div className="wrap">
        {band}
        <div className="row an-filters" role="group" aria-label="Filtrer par thème">
          <button className="chip" aria-pressed={!theme} onClick={() => setTheme("")}>Tous les thèmes <b>{all.length}</b></button>
          {THEMES.map((t) => {
            const n = all.filter((a) => a.theme === t.id).length;
            return (
              <button key={t.id} className="chip" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)} disabled={!n}>
                {t.label} <b>{n}</b>
              </button>
            );
          })}
          <select className="i" style={{ width: "auto", marginLeft: "auto" }} aria-label="Gravité" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">Toutes les gravités</option>
            {Object.entries(LEVEL).map(([id, l]) => <option key={id} value={id}>{l} ({count(id)})</option>)}
          </select>
        </div>
        <Block title={theme ? THEMES.find((t) => t.id === theme).label : "Tous les constats"} note="Du plus grave au moins grave · cliquer pour ouvrir le projet">
          <div className="card flush">
            {shown.length ? (
              <ul className="findings">
                {shown.map((a, i) => (
                  <li key={i} className={a.key || a.dp ? "click" : ""} tabIndex={a.key || a.dp ? 0 : undefined} onClick={() => open(a)} onKeyDown={(e) => e.key === "Enter" && open(a)}>
                    <Pill level={a.level === "info" ? "none" : a.level}>{LEVEL[a.level]}</Pill>
                    <div>
                      <div className="t">
                        <b>{a.title}</b>
                        <span className="th">{THEMES.find((t) => t.id === a.theme).label}</span>
                      </div>
                      {a.project && <div className="mono">{a.project}</div>}
                      <p>{a.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted" style={{ padding: 14 }}>Aucun constat pour ce filtre.</p>
            )}
          </div>
        </Block>
        <p className="hint">
          Règles et seuils : marge à date ou en fin d'année à plus de 3 pt sous le budget, taux de marge en baisse 3 mois de suite, prévisionnel à plus
          de 5 pt au-dessus du réalisé ; jours à plus de 10 % au-dessus du budget, plus de 21 j par personne et par mois ; facturation à plus de 10 %
          sous le prévu, plus de 15 % du CA non facturé ; leviers PAM non intégrés ou en retard ; 3 projets à plus de 60 % du CA, un client à plus de
          40 %, fins de contrat dans les 6 mois, portefeuille DP à plus de 5 % sous le budget de CA ; mois de saisie incomplète, coûts sans CA, CA sans
          jours, TJM à plus de 15 % du vendu.
        </p>
      </div>
    </main>
  );
}
