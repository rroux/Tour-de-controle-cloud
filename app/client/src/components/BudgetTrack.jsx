import React from "react";
import { Lines, MonthBars } from "./charts.jsx";
import { Block } from "./ui.jsx";
import { fr, keur, signed } from "../format.js";
import { budgetLabel, cumulate } from "../model.js";

/** Taux de marge cumulé depuis janvier : marge cumulée / CA net cumulé. */
export const cumRate = (m, c) => {
  const cm = cumulate(m), cc = cumulate(c);
  return cm.map((v, i) => (cc[i] ? v / cc[i] : null));
};

/**
 * Réel contre budget (Portefeuille DP et Synthèse) : courbe des cumuls, puis barres mois par mois.
 * `monthly` : { real, bud, fmt, tipFmt, gap }. Les barres du réel s'arrêtent au mois de référence :
 * après, seul le budget est affiché.
 */
export default function BudgetTrack({ title, year, refIndex, real, bud, budgetOk, opts = {}, monthly = null }) {
  return (
    <Block
      title={title}
      note={
        <div className="legend">
          <span><i style={{ borderColor: "var(--s1)" }} />Réel{refIndex < 11 ? " puis prévisionnel" : ""}</span>
          <span><i className="dash" style={{ borderColor: "var(--ink-3)" }} />Budget</span>
        </div>
      }
    >
      <div className="card">
        {budgetOk ? null : <p className="banner">Aucun CEP de ce portefeuille n'a de {budgetLabel(year)} pour {year} : seul le réel est affiché.</p>}
        <Lines
          year={year}
          refIndex={refIndex}
          fmt={opts.fmt || keur}
          axisFmt={opts.axisFmt || opts.fmt || keur}
          label={`${title}, cumul ${year}`}
          series={[
            { name: "Réel", data: real, color: "var(--s1)", area: !opts.rate, split: true },
            ...(budgetOk ? [{ name: "Budget", data: bud, color: "var(--ink-3)", dash: true, thin: true }] : []),
          ]}
          extraRows={(i) =>
            budgetOk && real[i] != null && bud[i] != null
              ? [["Écart", opts.rate ? `${signed((real[i] - bud[i]) * 100, (v) => fr(v, 1))} pt` : signed(real[i] - bud[i], keur)]]
              : []
          }
        />
        {monthly && (
          <>
            <div className="chart-sub">Mois par mois</div>
            <MonthBars
              year={year}
              refIndex={refIndex}
              height={160}
              label={`${title}, mois par mois ${year}`}
              fmt={monthly.fmt}
              tipFmt={monthly.tipFmt}
              series={[
                { name: "Réel", data: monthly.real.map((v, i) => (budgetOk && i > refIndex ? null : v)), color: "var(--s1)" },
                ...(budgetOk ? [{ name: "Budget", data: monthly.bud, color: "var(--s3)", solid: true }] : []),
              ]}
              extraRows={(i) => (budgetOk && i <= refIndex ? [["Écart", monthly.gap(i)]] : [])}
            />
          </>
        )}
      </div>
    </Block>
  );
}
