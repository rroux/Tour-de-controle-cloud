import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import Band from "../components/Band.jsx";
import { Block, Empty, Pill } from "../components/ui.jsx";
import { analyses, isAcked, THEMES } from "../analyses.js";
import { dateFr } from "../format.js";

const LEVEL = { crit: "Critique", warn: "À surveiller", info: "Information" };

export default function Analyses({ projects, filters, go, setDp, setToast }) {
  const { year } = filters;
  const [theme, setTheme] = useState("");
  const [level, setLevel] = useState("");
  const [showAcked, setShowAcked] = useState(false);
  const [acks, setAcks] = useState({});
  useEffect(() => {
    api.acks().then(setAcks).catch(() => {});
  }, []);
  const found = useMemo(() => analyses(projects, year), [projects, year]);
  // Les compteurs et les filtres portent sur les constats à traiter, ou sur les acquittés si ce filtre est actif.
  const acked = found.filter((a) => isAcked(a, acks));
  const all = showAcked ? acked : found.filter((a) => !isAcked(a, acks));
  const open = found.length - acked.length;
  const shown = all.filter((a) => (!theme || a.theme === theme) && (!level || a.level === level));
  const count = (l, t = theme) => all.filter((a) => a.level === l && (!t || a.theme === t)).length;
  const toggleAck = async (a) => {
    try {
      setAcks(showAcked ? await api.unack(a.id) : await api.ack(a.id, a.level));
      setToast(showAcked ? "Constat remis à traiter" : "Constat acquitté");
    } catch (err) {
      setToast(err.message);
    }
  };

  const band = (
    <Band
      title="Analyses"
      eyebrow={`Constats calculés à partir des CEP · exercice ${year} · ${projects.length} projet${projects.length > 1 ? "s" : ""}`}
      filters={filters}
      showPeriod={false}
      figures={[
        { k: "Critiques", v: String(found.filter((a) => a.level === "crit" && !isAcked(a, acks)).length), d: "à traiter en priorité, hors acquittés", tone: found.some((a) => a.level === "crit" && !isAcked(a, acks)) ? "down" : "" },
        { k: "À surveiller", v: String(found.filter((a) => a.level === "warn" && !isAcked(a, acks)).length), d: "signaux faibles" },
        { k: "Informations", v: String(found.filter((a) => a.level === "info" && !isAcked(a, acks)).length), d: "leviers et échéances" },
        { k: "Acquittés", v: String(acked.length), d: "vus et pris en compte" },
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

  const openFinding = (a) => {
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
          <button className="chip" aria-pressed={!showAcked && !theme} onClick={() => { setShowAcked(false); setTheme(""); }}>À traiter <b>{open}</b></button>
          {THEMES.map((t) => {
            const n = all.filter((a) => a.theme === t.id).length;
            return (
              <button key={t.id} className="chip" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)} disabled={!n}>
                {t.label} <b>{n}</b>
              </button>
            );
          })}
          <button className="chip" style={{ marginLeft: "auto" }} aria-pressed={showAcked} onClick={() => { setShowAcked(!showAcked); setTheme(""); }}>Acquittés <b>{acked.length}</b></button>
          <select className="i" style={{ width: "auto" }} aria-label="Gravité" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">Toutes les gravités</option>
            {Object.entries(LEVEL).map(([id, l]) => <option key={id} value={id}>{l} ({count(id)})</option>)}
          </select>
        </div>
        <Block
          title={`${showAcked ? "Constats acquittés" : "Constats à traiter"}${theme ? ` · ${THEMES.find((t) => t.id === theme).label}` : ""}`}
          note={showAcked ? "Un constat acquitté revient à traiter s'il s'aggrave · « Remettre à traiter » pour l'annuler" : "Du plus grave au moins grave · cliquer pour ouvrir le projet"}
        >
          <div className="card flush">
            {shown.length ? (
              <ul className="findings">
                {shown.map((a, i) => (
                  <li key={a.id + i} className={a.key || a.dp ? "click" : ""} tabIndex={a.key || a.dp ? 0 : undefined} onClick={() => openFinding(a)} onKeyDown={(e) => e.target === e.currentTarget && e.key === "Enter" && openFinding(a)}>
                    <Pill level={a.level === "info" ? "none" : a.level}>{LEVEL[a.level]}</Pill>
                    <div>
                      <div className="t">
                        <b>{a.title}</b>
                        <span className="th">{THEMES.find((t) => t.id === a.theme).label}</span>
                      </div>
                      {a.project && <div className="mono">{a.project}</div>}
                      <p>{a.text}</p>
                      {showAcked && acks[a.id] && <div className="acked">Acquitté le {dateFr(acks[a.id].at)}</div>}
                    </div>
                    <button
                      className="btn ack"
                      title={showAcked ? "Remettre ce constat dans les constats à traiter" : "Constat vu et pris en compte : le ranger dans « Acquittés »"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAck(a);
                      }}
                    >
                      {showAcked ? "Remettre à traiter" : "Acquitter"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted" style={{ padding: 14 }}>{showAcked ? "Aucun constat acquitté pour ce filtre." : "Aucun constat à traiter pour ce filtre."}</p>
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
