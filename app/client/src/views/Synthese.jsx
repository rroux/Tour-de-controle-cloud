import React, { useMemo } from "react";
import Band from "../components/Band.jsx";
import { MarginLine, MonthBars } from "../components/charts.jsx";
import { Block, Empty, Pill, Status } from "../components/ui.jsx";
import { fr, keur, monthLabel, MONTHS, pct, signed } from "../format.js";
import { alerts as buildAlerts, budgetLabel, budgetOf, figures, gainIa, joursAnnee, joursBudget, monthly, portfolioObjective, portfolioRef, status, totalFigures, yearMonths } from "../model.js";

// Position du mois de référence dans une année : 11 si l'année est entièrement réalisée, -1 si elle est à venir.
const refIndexOf = (ref, year) => (ref && ref.startsWith(`${year}-`) ? Number(ref.slice(5)) - 1 : ref && ref < `${year}-01` ? -1 : 11);

// La synthèse porte sur l'exercice complet : réalisé jusqu'au mois de référence, prévisionnel ensuite.
const PERIOD = "annee";

export default function Synthese({ projects, data, filters, go, startScan }) {
  const { year, compare } = filters;
  const ref = portfolioRef(projects);
  const months = yearMonths(year);
  const refIndex = refIndexOf(ref, year);

  const tot = useMemo(() => totalFigures(projects, PERIOD, year), [projects, year]);
  const caRealise = useMemo(() => totalFigures(projects, "realise", year).ca, [projects, year]);
  const caN1 = useMemo(() => totalFigures(projects, PERIOD, year - 1).ca, [projects, year]);
  const obj = portfolioObjective(projects, year);

  // Budget = trajectoire initiale de l'onglet Projection (CA net et coûts), comparé sur la même base CA net.
  const sumBudget = (key) => projects.reduce((a, p) => a + months.reduce((s, m) => s + (budgetOf(p, year)[key]?.[m] || 0), 0), 0);
  const budCaNet = sumBudget("caNet");
  const budTaux = budCaNet ? (budCaNet - sumBudget("couts")) / budCaNet : null;
  const tauxNet = tot.caNet ? (tot.caNet - tot.couts) / tot.caNet : 0;

  const joursConso = projects.reduce((a, p) => a + joursAnnee(p, year), 0);
  const joursBudADate = projects.reduce((a, p) => a + joursBudget(p, year, true), 0);
  const joursBudAn = projects.reduce((a, p) => a + joursBudget(p, year), 0);
  const gain = projects.reduce((a, p) => {
    const g = gainIa(p, year);
    return { realise: a.realise + g.realise, annee: a.annee + g.annee, n: a.n + (g.annee > 0 ? 1 : 0) };
  }, { realise: 0, annee: 0, n: 0 });

  const rows = useMemo(
    () =>
      projects
        .map((p) => {
          const f = figures(p, PERIOD, year);
          return { p, f, s: status(p, f) };
        })
        .sort((a, b) => b.f.ca - a.f.ca),
    [projects, year],
  );
  const maxCa = Math.max(1, ...rows.map((r) => r.f.ca));

  const coM = monthly(projects, (p) => p.cep.rows.totalCharges, year);
  const cnM = monthly(projects, (p) => p.cep.rows.caNet, year);
  // Année de comparaison (même graphique) : CA brut et taux de marge mois par mois.
  const cmpMonths = compare ? yearMonths(compare) : null;
  const cmpCa = compare ? monthly(projects, (p) => p.cep.rows.caNet, compare) : null;
  const budCaM = monthly(projects, (p) => budgetOf(p, year).caNet, year);
  const hasBud = Object.values(budCaM).some(Boolean);
  const cmpCo = compare ? monthly(projects, (p) => p.cep.rows.totalCharges, compare) : null;
  const cmpCn = compare ? monthly(projects, (p) => p.cep.rows.caNet, compare) : null;
  const cmpRef = compare ? refIndexOf(ref, compare) : null;
  const alertList = buildAlerts(projects, data.errors, PERIOD, year, data.staleDays);

  const band = (
    <Band
      title="Synthèse du portefeuille"
      eyebrow={`Consolidation des CEP V11-20${ref ? ` · mois de référence ${monthLabel(ref)}` : ""}`}
      filters={filters}
      showPeriod={false}
      showCompare
      figures={[
        {
          k: `CA brut ${year}`,
          v: keur(tot.ca),
          d: (
            <>
              dont réalisé {keur(caRealise)}
              {caN1 > 0 && (
                <span className={tot.ca >= caN1 ? "delta-up" : "delta-down"}>
                  {tot.ca >= caN1 ? "▲" : "▼"} {pct(Math.abs((tot.ca - caN1) / caN1))} vs N-1
                </span>
              )}
            </>
          ),
        },
        {
          k: `Taux de marge ${year}`,
          v: pct(tauxNet),
          d: (
            <>
              {keur(tot.caNet - tot.couts)} sur CA net
              <span className={tauxNet >= obj.value ? "delta-up" : "delta-down"} title={`Objectif global ${obj.mode === "auto" ? "calculé : objectifs des projets pondérés par le CA net" : "fixé dans les paramètres"}`}>
                {tauxNet >= obj.value ? "▲" : "▼"} {fr(Math.abs(tauxNet - obj.value) * 100, 1)} pt vs objectif {pct(obj.value)}
              </span>
              {budTaux != null && <span className="muted"> · budget {pct(budTaux)}</span>}
            </>
          ),
        },
        {
          k: `Jours consommés ${year}`,
          v: fr(Math.round(joursConso)),
          d: joursBudADate ? (
            <>
              {budgetLabel(year)} à date {fr(Math.round(joursBudADate))} j{" "}
              <span className={joursConso <= joursBudADate ? "delta-up" : "delta-down"}>{signed((joursConso - joursBudADate) / joursBudADate, (v) => pct(v))}</span>
              <span className="muted"> · {fr(Math.round(joursBudAn))} j sur l'année</span>
            </>
          ) : `${budgetLabel(year)} non disponible`,
        },
        {
          k: `Gain IA ${year}`,
          v: fr(Math.round(gain.annee)),
          unit: " j",
          d: gain.n ? `dont réalisé ${fr(Math.round(gain.realise))} j · ${gain.n} projet${gain.n > 1 ? "s" : ""}` : "aucun gain IA saisi (profil ZZZ_GAIN_IA)",
        },
      ]}
    />
  );

  if (!projects.length) {
    return (
      <main>
        <div className="wrap">
          {band}
          <div className="card">
            <Empty title="Aucun CEP consolidé">
              <p>Ajoutez une source SMB et les codes d'identification dans les paramètres, puis lancez un scan.</p>
              <div className="row">
                <button className="btn pri" onClick={() => go("parametres")}>Ouvrir les paramètres</button>
                <button className="btn" onClick={startScan}>Scanner maintenant</button>
              </div>
            </Empty>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="wrap">
        {band}

        <div className="grid2">
          <Block
            title={compare ? `CA net mensuel : ${year} et ${compare}` : "CA net mensuel : réel et budgété"}
            note={
              <div className="legend">
                <span><i className="sq" style={{ background: "var(--s1)" }} />Réel{compare ? ` ${year}` : ""}</span>
                {hasBud && <span><i className="sq" style={{ background: "var(--s3)" }} />Budget {compare ? year : ""}</span>}
                {compare && <span><i className="sq" style={{ background: "var(--s2)" }} />Réel {compare}</span>}
                {refIndex >= 0 && refIndex < 11 && <span><i className="dash" style={{ borderColor: "var(--ink-3)" }} />Prévisionnel (après {MONTHS[refIndex]} {ref.slice(0, 4)})</span>}
              </div>
            }
          >
            <div className="card">
              <MonthBars
                year={year}
                refIndex={refIndex}
                height={240}
                label={compare ? `CA net mensuel ${year} et ${compare}` : `CA net mensuel réel et budgété ${year}`}
                fmt={(v) => `${fr(v / 1e6, 1)} M€`}
                tipFmt={keur}
                series={[
                  { name: compare ? `Réel ${year}` : "CA net réel", data: months.map((m) => cnM[m]), color: "var(--s1)" },
                  ...(hasBud ? [{ name: compare ? `Budget ${year}` : "CA net budgété", data: months.map((m) => budCaM[m]), color: "var(--s3)", solid: true }] : []),
                  ...(compare ? [{ name: `Réel ${compare}`, data: cmpMonths.map((m) => cmpCa[m]), color: "var(--s2)", refIndex: cmpRef }] : []),
                ]}
                extraRows={(i) => {
                  const marge = (cn, co) => `${keur(cn - co)} · ${pct(cn ? (cn - co) / cn : 0)}`;
                  if (!compare) return [["Marge", marge(cnM[months[i]], coM[months[i]])]];
                  return [
                    [`Marge ${year}`, marge(cnM[months[i]], coM[months[i]])],
                    [`Marge ${compare}`, marge(cmpCn[cmpMonths[i]], cmpCo[cmpMonths[i]])],
                  ];
                }}
              />
            </div>
          </Block>
          <Block
            title="Taux de marge"
            note={
              compare ? (
                <div className="legend">
                  <span><i style={{ borderColor: "var(--s1)" }} />{year}</span>
                  <span><i style={{ borderColor: "var(--s2)" }} />{compare}</span>
                  <span>Objectif {pct(obj.value)}{obj.mode === "auto" ? " (auto)" : ""}</span>
                </div>
              ) : (
                `Base CA net · objectif ${pct(obj.value)}${obj.mode === "auto" ? " (pondéré par le CA)" : ""}`
              )
            }
          >
            <div className="card">
              <MarginLine
                year={year}
                refIndex={refIndex}
                objective={obj.value}
                rates={months.map((m) => (cnM[m] ? (cnM[m] - coM[m]) / cnM[m] : null))}
                amounts={months.map((m) => cnM[m] - coM[m])}
                compare={
                  compare
                    ? {
                        year: compare,
                        refIndex: cmpRef,
                        rates: cmpMonths.map((m) => (cmpCn[m] ? (cmpCn[m] - cmpCo[m]) / cmpCn[m] : null)),
                        amounts: cmpMonths.map((m) => cmpCn[m] - cmpCo[m]),
                      }
                    : null
                }
              />
            </div>
          </Block>
        </div>

        <div className="stack">
          <Block title="Projets" note={`Triés par CA ${year} · marge sur CA net comparée à l'objectif du projet`}>
            <div className="card flush tw">
              <table>
                <thead>
                  <tr>
                    <th>Projet</th>
                    <th className="n">CA {year}</th>
                    <th />
                    <th className="n">Marge</th>
                    <th className="n">Objectif</th>
                    <th className="n">Écart</th>
                    <th>État</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ p, f, s }) => (
                    <tr key={p.key} className="click" tabIndex={0} onClick={() => go("projets", p.key)} onKeyDown={(e) => e.key === "Enter" && go("projets", p.key)}>
                      <td>
                        <div>{p.client || "—"} · {p.projet || p.fileName}</div>
                        <div className="mono">{p.key}</div>
                      </td>
                      <td className="n">{keur(f.ca)}</td>
                      <td>
                        <div className="bar"><span style={{ width: `${(Math.max(0, f.ca) / maxCa) * 100}%` }} /></div>
                      </td>
                      <td className="n">{pct(f.tauxNet)}</td>
                      <td className="n">{pct(f.obj)}</td>
                      <td className={`n ${f.tauxNet >= f.obj ? "delta-up" : "delta-down"}`}>{signed((f.tauxNet - f.obj) * 100, (v) => fr(v, 1))} pt</td>
                      <td><Status s={s} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Block>
          <Block title="Points d'attention">
            <div className="card">
              {alertList.length ? (
                <ul className="alerts">
                  {alertList.slice(0, 30).map((a, i) => (
                    <li key={i} className={a.key ? "click" : ""} onClick={a.key ? () => go("projets", a.key) : undefined}>
                      <Pill level={a.level}>{a.tag}</Pill>
                      <span>{a.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Aucun point d'attention.</p>
              )}
            </div>
          </Block>
        </div>
      </div>
    </main>
  );
}
