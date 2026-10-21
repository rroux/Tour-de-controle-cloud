import React, { useMemo, useState } from "react";
import { api } from "../api.js";
import { MonthBars } from "../components/charts.jsx";
import { Block, Empty, Status } from "../components/ui.jsx";
import { dateFr, dateTimeFr, eur, fr, jours, keur, monthLabel, MONTHS, pct, signed } from "../format.js";
import { budgetFigures, budgetLabel, budgetOf, figures, gainIa, joursAnnee, joursPrevus, objectiveInfo, PERIODS, projectTrack, raf, status, sumObj, yearMonths } from "../model.js";

const STATUS_COLOR = { ok: "var(--good)", warn: "var(--warn)", crit: "var(--crit)", none: "var(--none)" };

export default function Projets({ projects, filters, selectedKey, go, reload, setToast }) {
  const { year, period, setPeriod } = filters;
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("bons");

  const list = useMemo(
    () =>
      projects
        .map((p) => {
          const f = figures(p, period, year);
          return { p, f, s: status(p, f) };
        })
        .sort((a, b) => b.f.ca - a.f.ca),
    [projects, period, year],
  );
  const shown = list.filter(({ p }) => `${p.key} ${p.client} ${p.projet}`.toLowerCase().includes(q.toLowerCase()));
  const cur = list.find((x) => x.p.key === selectedKey) || list[0];

  if (!cur) {
    return (
      <main>
        <div className="wrap">
          <div className="card">
            <Empty title="Aucun projet">
              <p>Aucun CEP n'est consolidé pour ce filtre.</p>
            </Empty>
          </div>
        </div>
      </main>
    );
  }

  const { p, f, s } = cur;
  const k = p.kpi || {};
  const months = yearMonths(year);
  const refIndex = p.moisRef?.startsWith(`${year}-`) ? Number(p.moisRef.slice(5)) - 1 : p.moisRef && p.moisRef < `${year}-01` ? -1 : 11;
  const track = projectTrack(p, year);
  const bf = budgetFigures(p, year);
  const obj = objectiveInfo(p, year);
  const bud = budgetOf(p, year);
  const acceptRef = async () => {
    await api.acceptBudgetRefs({ keys: [p.key], year });
    await reload();
    setToast(`Nouvelle version prise comme budget de référence ${year}`);
  };
  const reste = raf(p);
  const gain = gainIa(p, year);
  const consoAn = joursAnnee(p, year);
  const prevuADate = joursPrevus(p, year, true);
  const pl = [
    ["CA brut", f.ca, "hl0"],
    ["Prestation", f.caPresta, "sub"],
    ["Reventes, frais refacturés", f.caRevente, "sub"],
    ["Sous-traitance refacturée", f.caStt, "sub"],
    ["Remise contrat cadre (RFA)", -f.rfa, ""],
    ["CA net", f.caNet, "hl"],
    ["Salaires chargés", -f.salaires, "sub"],
    ["Achats, frais", -f.achats, "sub"],
    ["Sous-traitance externe", -f.sttExt, "sub"],
    ["Sous-traitance interne", -f.sttInt, "sub"],
    ["Total charges", -f.couts, "hl"],
    ["Marge brute", f.marge, "hl"],
    ["Marge nette", f.margeNette, "hl"],
  ];

  return (
    <main>
      <div className="wrap">
        <div className="md">
          <div className="plist">
            <input placeholder="Rechercher un projet ou un code" aria-label="Rechercher un projet" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="items" role="listbox" aria-label="Projets">
              {shown.map((x) => (
                <button key={x.p.key} className="pi" role="option" aria-selected={x.p.key === p.key} onClick={() => go("projets", x.p.key)}>
                  <span className="rail" style={{ background: STATUS_COLOR[x.s.level] }} />
                  <span style={{ minWidth: 0 }}>
                    <div className="t">{x.p.client || x.p.key} · {x.p.projet || "—"}</div>
                    <div className="m">{x.p.key}</div>
                  </span>
                  <span className="r">
                    {keur(x.f.ca)}
                    <div className="m">{pct(x.f.tauxNet)}</div>
                  </span>
                </button>
              ))}
              {!shown.length && <p className="muted" style={{ padding: 12 }}>Aucun projet ne correspond.</p>}
            </div>
          </div>

          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="ph">
              <div style={{ minWidth: 0 }}>
                <div className="mono" style={{ overflowWrap: "anywhere" }}>{p.fileName} · modifié le {dateTimeFr(new Date(p.fileMtime).toISOString())}</div>
                <h1>{p.client || p.key} · {p.projet || "—"}</h1>
                <div className="sub">{[p.key, p.dp && `DP ${p.dp}`, p.moisRef && `réf. ${monthLabel(p.moisRef)}`].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="row">
                <select className="i" style={{ width: "auto" }} aria-label="Période" value={period} onChange={(e) => setPeriod(e.target.value)}>
                  {PERIODS.map((x) => <option key={x.id} value={x.id}>{x.label} {year}</option>)}
                </select>
                <Status s={s} />
              </div>
            </div>

            {bud.pending && (
              <div className="banner row" style={{ justifyContent: "space-between" }}>
                <span>
                  Le CEP {year} a changé depuis le budget de référence du {dateFr(bud.frozenAt)} : CA net {keur(sumObj(bud.caNet))} → {keur(bud.pending.caNet)},
                  marge {keur(sumObj(bud.caNet) - sumObj(bud.couts))} → {keur(bud.pending.caNet - bud.pending.couts)}. Le budget ne change que si vous le décidez.
                </span>
                <button className="btn" onClick={acceptRef}>Prendre cette version comme référence</button>
              </div>
            )}
            <div className="facts">
              <div><div className="k">CA brut</div><div className="v">{keur(f.ca)}</div><div className="s">CA net {keur(f.caNet)}</div></div>
              <div>
                <div className="k">Taux de marge</div>
                <div className="v">{pct(f.tauxNet)}</div>
                <div className="s">
                  {keur(f.margeNette)} · objectif {pct(obj.value)}{" "}
                  <span title={obj.source === "defaut" ? "Pas de budget pour cet exercice : objectif par défaut des paramètres" : `Taux du ${obj.source === "reference" ? "budget de référence figé" : "trajectoire initiale (onglet Projection)"}`}>
                    ({obj.source === "defaut" ? "par défaut" : obj.source === "reference" ? "budget de référence" : "trajectoire initiale"})
                  </span>
                </div>
              </div>
              <div><div className="k">Jours consommés {year}</div><div className="v">{fr(Math.round(consoAn))}</div><div className="s">prévu à date {fr(Math.round(prevuADate))} · RAF {fr(Math.round(reste))} j</div></div>
              <div><div className="k">TJM cumulé</div><div className="v">{eur(Math.round(k.tjm?.cumul || 0))}</div><div className="s">PRJ moyen {eur(Math.round(k.prj?.cumul || 0))}</div></div>
            </div>

            <div className="g12">
              <Block className="c5" title="Compte d'exploitation" note={`${PERIODS.find((x) => x.id === period)?.label || ""} ${year}`}>
                <div className="card flush tw">
                  <table>
                    <tbody>
                      {pl.map(([l, v, cls]) => (
                        <tr key={l} className={cls}>
                          <td>{l}</td>
                          <td className="n">{keur(v)}</td>
                          <td className="n mono">{f.ca ? pct(v / f.ca) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Block>
              <Block
                className="c7"
                title={`Taux de marge mensuel ${year} : réel et budgété`}
                note={
                  <div className="legend">
                    <span><i className="sq" style={{ background: "var(--s1)" }} />Réelle{refIndex < 11 ? " (claire : prévisionnel)" : ""}</span>
                    {bf.hasBudget && <span><i className="sq" style={{ background: "var(--s3)" }} />Budgétée</span>}
                  </div>
                }
              >
                <div className="card">
                  {bf.hasBudget ? (
                    <div className="bud">
                      <div><span>Taux de marge à date</span><b>{pct(rate(bf.marge, bf.ca))}</b><small>budget {pct(rate(bf.budMarge, bf.budCa))} · <EcartPt real={rate(bf.marge, bf.ca)} bud={rate(bf.budMarge, bf.budCa)} /></small></div>
                      <div><span>Taux de marge {year}</span><b>{pct(rate(bf.margeAn, bf.caAn))}</b><small>budget {pct(rate(bf.budMargeAn, bf.budCaAn))} · <EcartPt real={rate(bf.margeAn, bf.caAn)} bud={rate(bf.budMargeAn, bf.budCaAn)} /></small></div>
                      <div><span>CA net à date</span><b>{keur(bf.ca)}</b><small>budget {keur(bf.budCa)} · <Ecart real={bf.ca} bud={bf.budCa} /></small></div>
                    </div>
                  ) : (
                    <p className="banner">{bud.source === "reference" ? `Pas encore de chiffres ${year} dans l'onglet CEP : pas de budget de référence.` : "Trajectoire initiale non enregistrée dans l'onglet Projection de ce CEP : pas de marge budgétée."}</p>
                  )}
                  <MonthBars
                    year={year}
                    refIndex={refIndex}
                    label={`Taux de marge mensuel réel et budgété ${p.key}`}
                    fmt={(v) => pct(v, 0)}
                    tipFmt={(v) => pct(v)}
                    series={[
                      { name: "Taux réel", data: track.marge.map((m, i) => rate(m, track.ca[i]) ?? 0), color: "var(--s1)" },
                      ...(bf.hasBudget ? [{ name: "Taux budgété", data: track.budMarge.map((m, i) => rate(m, track.budCa[i]) ?? 0), color: "var(--s3)", solid: true }] : []),
                    ]}
                    extraRows={(i) => [
                      ["Marge réelle", keur(track.marge[i])],
                      ...(bf.hasBudget ? [["Marge budgétée", keur(track.budMarge[i])]] : []),
                      ["CA net réel", keur(track.ca[i])],
                      ...(bf.hasBudget ? [["CA net budgété", keur(track.budCa[i])]] : []),
                    ]}
                  />
                  <p className="hint" style={{ margin: "6px 0 0" }}>
                    Marge = CA net − coûts. Budget {year} :{" "}
                    {bud.source === "reference"
                      ? `budget de référence figé le ${dateFr(bud.frozenAt)} (photo de l'onglet CEP).`
                      : `trajectoire initiale de l'onglet Projection${bud.dateEnreg ? ` (enregistrée le ${dateFr(bud.dateEnreg)})` : ""}.`}
                  </p>
                </div>
              </Block>
            </div>

            <div className="card flush">
              <div className="subtabs" role="tablist">
                {[
                  ["bons", `Bons de commande (${p.bons?.length || 0})`],
                  ["fact", "Facturation"],
                  ["pam", `PAM (${p.pam?.length || 0})`],
                  ["equipe", `Équipe (${p.activite?.equipe?.length || 0})`],
                ].map(([id, label]) => (
                  <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
                ))}
              </div>
              <div className="tw">
                {tab === "bons" && <Bons p={p} />}
                {tab === "fact" && <Facturation p={p} year={year} months={months} />}
                {tab === "pam" && <Pam p={p} />}
                {tab === "equipe" && <Equipe p={p} year={year} months={months} />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

const rate = (m, c) => (c ? m / c : null);

function EcartPt({ real, bud }) {
  if (real == null || bud == null) return "—";
  const d = (real - bud) * 100;
  return <span className={d >= 0 ? "delta-up" : "delta-down"}>{signed(d, (v) => fr(v, 1))} pt</span>;
}

function Ecart({ real, bud }) {
  if (!bud) return "—";
  const d = real - bud;
  return <span className={d >= 0 ? "delta-up" : "delta-down"}>{signed(d, keur)}</span>;
}

function Bons({ p }) {
  if (!p.bons?.length) return <p className="muted" style={{ padding: 12 }}>Aucun bon de commande de prestation saisi.</p>;
  const t = p.bons.reduce((a, b) => ({ j: a.j + b.joursVendus, ca: a.ca + b.caVendu, o: a.o + b.joursObjectif }), { j: 0, ca: 0, o: 0 });
  return (
    <table>
      <thead>
        <tr><th>Id</th><th>N° de BC</th><th>Intitulé</th><th className="n">Jours vendus</th><th className="n">CA vendu brut</th><th className="n">TJM vendu</th><th className="n">Jours objectif</th><th>Facturé client</th></tr>
      </thead>
      <tbody>
        {p.bons.map((b, i) => (
          <tr key={i}>
            <td className="mono">{b.id}</td>
            <td className="mono">{b.numero || "—"}</td>
            <td>{b.intitule || "—"}</td>
            <td className="n">{fr(b.joursVendus)}</td>
            <td className="n">{keur(b.caVendu)}</td>
            <td className="n">{eur(Math.round(b.tjmVendu))}</td>
            <td className="n">{fr(b.joursObjectif)}</td>
            <td>{b.factureClient || "—"}</td>
          </tr>
        ))}
        <tr className="hl"><td>Total</td><td /><td /><td className="n">{fr(t.j)}</td><td className="n">{keur(t.ca)}</td><td className="n">{t.j ? eur(Math.round(t.ca / t.j)) : "—"}</td><td className="n">{fr(t.o)}</td><td /></tr>
      </tbody>
    </table>
  );
}

function Facturation({ p, year, months }) {
  const th = p.facturation?.theorique || {};
  const re = p.facturation?.reel || {};
  if (!sumObj(th) && !sumObj(re)) return <p className="muted" style={{ padding: 12 }}>Aucun échéancier de facturation saisi.</p>;
  const sumY = (o) => months.reduce((a, m) => a + (o[m] || 0), 0);
  return (
    <table>
      <thead>
        <tr><th>{year}</th>{MONTHS.map((m) => <th key={m} className="n">{m}</th>)}<th className="n">Total</th></tr>
      </thead>
      <tbody>
        {[["Théorique", th], ["Réel", re]].map(([l, o]) => (
          <tr key={l}><td>{l}</td>{months.map((m) => <td key={m} className="n">{o[m] ? fr(Math.round(o[m] / 1000)) : "—"}</td>)}<td className="n"><b>{keur(sumY(o))}</b></td></tr>
        ))}
        <tr className="hl"><td>Écart</td>{months.map((m) => <td key={m} className="n">{(re[m] || th[m]) ? fr(Math.round(((re[m] || 0) - (th[m] || 0)) / 1000)) : "—"}</td>)}<td className="n">{keur(sumY(re) - sumY(th))}</td></tr>
      </tbody>
    </table>
  );
}

function Pam({ p }) {
  if (!p.pam?.length) return <p className="muted" style={{ padding: 12 }}>Aucune action du plan d'amélioration de la marge.</p>;
  return (
    <table>
      <thead>
        <tr><th>Levier</th><th>Action</th><th>Resp.</th><th>Confiance</th><th className="n">CA prévu</th><th className="n">Marge prévue</th><th className="n">Marge obtenue</th><th>Statut</th><th>Intégré au CEP</th></tr>
      </thead>
      <tbody>
        {p.pam.map((a, i) => (
          <tr key={i}>
            <td className="mono" title={a.levier}>{(/\[([^\]]+)\]/.exec(a.levier) || [])[1] || a.type}</td>
            <td style={{ whiteSpace: "normal", minWidth: 220 }}>{a.description || a.levier}</td>
            <td>{a.responsable || "—"}</td>
            <td>{a.confiance || "—"}</td>
            <td className="n">{fr(a.caPrevu)} k€</td>
            <td className="n">{fr(a.margePrevue)} k€</td>
            <td className="n">{fr(a.margeGain)} k€</td>
            <td>{a.statut || "—"}</td>
            <td>{a.integre || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Equipe({ p, year, months }) {
  const eq = p.activite?.equipe || [];
  if (!eq.length) return <p className="muted" style={{ padding: 12 }}>Aucune consommation Pilot par collaborateur.</p>;
  return (
    <table>
      <thead>
        <tr><th>Collaborateur</th><th>Rôle</th><th>Site</th>{MONTHS.map((m) => <th key={m} className="n">{m}</th>)}<th className="n">{year}</th><th className="n">Total</th></tr>
      </thead>
      <tbody>
        {eq.map((e) => (
          <tr key={e.trigramme + e.nom}>
            <td><span className="mono">{e.trigramme}</span> {e.nom}</td>
            <td>{e.role || "—"}</td>
            <td>{e.site || "—"}</td>
            {months.map((m) => <td key={m} className="n">{e.jours[m] ? fr(e.jours[m], 1) : "—"}</td>)}
            <td className="n"><b>{fr(months.reduce((a, m) => a + (e.jours[m] || 0), 0), 1)}</b></td>
            <td className="n">{jours(e.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
