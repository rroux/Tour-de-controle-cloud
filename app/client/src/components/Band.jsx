import React from "react";
import { PERIODS } from "../model.js";
import { Seg } from "./ui.jsx";

/** En-tête de page : titre, filtres globaux à droite, puis une rangée de cartes KPI (les deux premières mises en avant). */
export default function Band({ eyebrow, title, figures, filters, showPeriod = true }) {
  return (
    <>
      <header className="top">
        <div>
          <h1>{title}</h1>
          <div className="sub">{eyebrow}</div>
        </div>
        <div className="filters">
          <select aria-label="Exercice" value={filters.year} onChange={(e) => filters.setYear(Number(e.target.value))}>
            {(filters.years.length ? filters.years : [filters.year]).map((y) => (
              <option key={y} value={y}>Exercice {y}</option>
            ))}
          </select>
          <select aria-label="Client" value={filters.client} onChange={(e) => filters.setClient(e.target.value)}>
            <option value="">Tous les clients</option>
            {filters.clients.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select aria-label="Entité" value={filters.entite} onChange={(e) => filters.setEntite(e.target.value)}>
            <option value="">Toutes les entités</option>
            {filters.entites.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {filters.dps && (
            <select aria-label="Directeur de projet" value={filters.dp} onChange={(e) => filters.setDp(e.target.value)}>
              <option value="">Tous les DP</option>
              {filters.dps.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          {showPeriod && <Seg label="Période" options={PERIODS} value={filters.period} onChange={filters.setPeriod} />}
        </div>
      </header>
      <div className="kpis">
        {figures.map((f, i) => (
          <div className={`kpi${i < 2 ? " hero" : ""}`} key={f.k}>
            <span className="lbl">{f.k}</span>
            <span className="val">
              {f.v}
              {f.unit && <small>{f.unit}</small>}
            </span>
            {f.d && <span className={`meta ${f.tone === "up" ? "delta-up" : f.tone === "down" ? "delta-down" : ""}`}>{f.d}</span>}
          </div>
        ))}
      </div>
    </>
  );
}
