import React from "react";
import { MONTHS } from "../format.js";

/**
 * Frise des 12 mois de l'exercice sous les filtres : barre de CA brut par mois, pleine jusqu'au mois de
 * référence (réalisé), hachurée ensuite (prévisionnel du CEP). Un clic choisit le mois, un second revient à l'année.
 */
export default function MonthStrip({ year, values, refIndex, selected, onSelect, fmt }) {
  const max = Math.max(1, ...values.map((v) => Math.max(0, v || 0)));
  return (
    <div className="mstrip" role="group" aria-label={`Mois de l'exercice ${year}`}>
      {values.map((v, i) => {
        const on = selected === i;
        return (
          <button
            key={i}
            type="button"
            aria-pressed={on}
            title={`${MONTHS[i]} ${year} : ${fmt(v || 0)}${i > refIndex ? " · prévisionnel" : ""}${on ? " · cliquer pour revenir à l'année" : ""}`}
            onClick={() => onSelect(on ? null : i)}
          >
            <span className="mb"><i className={i > refIndex ? "f" : ""} style={{ height: `${(Math.max(0, v || 0) / max) * 100}%` }} /></span>
            <span className="mm">{MONTHS[i]}</span>
            <span className="mv">{fmt(v || 0)}</span>
          </button>
        );
      })}
    </div>
  );
}
