import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Block, Pill } from "../components/ui.jsx";
import { dateTimeFr, fr } from "../format.js";

const EMPTY_SOURCE = { name: "", path: "", auth: "session", domain: "", username: "", password: "", recursive: true, enabled: true };
const SCHEDULES = [
  { id: "daily", label: "Tous les jours" },
  { id: "workdays", label: "Jours ouvrés (lun. → ven.)" },
  { id: "hourly", label: "Toutes les heures" },
  { id: "manual", label: "Manuel uniquement" },
];
const ITEM_STATUS = {
  retained: ["ok", "Retenu"],
  ignored: ["none", "Ignoré"],
  error: ["crit", "Erreur"],
  warning: ["warn", "Attention"],
};

// Session Windows : le compte et le mot de passe éventuellement enregistrés sont effacés.
function withAuth({ auth, ...form }) {
  return auth === "session" ? { ...form, domain: "", username: "", password: "", clearPassword: true } : form;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default function Parametres({ scan, startScan, reload, setToast, projects }) {
  const [cfg, setCfg] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      const [c, h] = await Promise.all([api.config(), api.scans()]);
      setCfg(c);
      setHistory(h);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    refresh();
  }, [scan.running]);

  if (!cfg) return <main><div className="wrap">{error ? <div className="banner crit">{error}</div> : <p className="muted">Chargement…</p>}</div></main>;

  const lastSources = new Map((history[0]?.sources || []).map((s) => [s.id, s]));

  return (
    <main>
      <div className="wrap">
        <div className="ph">
          <div>
            <div className="mono">Configuration du scan automatique</div>
            <h1>Paramètres</h1>
          </div>
          <button className="btn pri" onClick={startScan} disabled={scan.running}>
            {scan.running ? scan.progress || "Scan en cours…" : "Scanner maintenant"}
          </button>
        </div>
        {error && <div className="banner crit">{error}</div>}

        <div className="steps">
          <Sources cfg={cfg} lastSources={lastSources} refresh={refresh} setToast={setToast} setError={setError} />
          <Codes cfg={cfg} setCfg={setCfg} projects={projects} setToast={setToast} setError={setError} />
          <Schedule cfg={cfg} setCfg={setCfg} setToast={setToast} setError={setError} />
          <Objective cfg={cfg} setCfg={setCfg} reload={reload} setToast={setToast} setError={setError} />
        </div>

        <History history={history} />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// 1. Où chercher : sources SMB
// ---------------------------------------------------------------------------

function Sources({ cfg, lastSources, refresh, setToast, setError }) {
  const [editing, setEditing] = useState(null); // null | "new" | id
  const [form, setForm] = useState(EMPTY_SOURCE);
  const [test, setTest] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const open = (src) => {
    setEditing(src ? src.id : "new");
    setForm(src ? { ...EMPTY_SOURCE, ...src, auth: src.username ? "account" : "session", password: "" } : EMPTY_SOURCE);
    setTest(null);
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const runTest = async (body) => {
    setTest({ pending: true });
    try {
      setTest(await api.testSource(body));
    } catch (err) {
      setTest({ ok: false, message: err.message });
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = withAuth(form);
      if (!body.password) delete body.password;
      if (editing === "new") await api.addSource(body);
      else await api.updateSource(editing, body);
      setEditing(null);
      setToast("Source enregistrée");
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (src) => {
    await api.updateSource(src.id, { enabled: !src.enabled });
    setToast(src.enabled ? "Source désactivée" : "Source activée");
    refresh();
  };

  const remove = async (id) => {
    await api.deleteSource(id);
    setConfirmDelete(null);
    setToast("Source supprimée");
    refresh();
  };

  return (
    <div className="step">
      <div className="step-h"><b>1</b><h3>Où chercher</h3></div>
      <div className="hint">
        Chemin UNC d'un partage (<span className="mono">\\serveur\partage\dossier</span>), lecteur réseau ou dossier local. Par défaut, les CEP sont lus avec votre session Windows : aucun domaine ni mot de passe à saisir.
      </div>

      {cfg.sources.length === 0 && <p className="muted">Aucune source configurée.</p>}
      {cfg.sources.map((s) =>
        editing === s.id ? null : (
          <div className="src" key={s.id}>
            <div className="name">
              <span>{s.name}</span>
              {!s.enabled ? (
                <Pill level="none">Désactivée</Pill>
              ) : lastSources.get(s.id)?.ok === false ? (
                <Pill level="crit">Inaccessible</Pill>
              ) : lastSources.get(s.id) ? (
                <Pill level="ok">{lastSources.get(s.id).files} fichier{lastSources.get(s.id).files > 1 ? "s" : ""}</Pill>
              ) : (
                <Pill level="warn">Pas encore scannée</Pill>
              )}
            </div>
            <div className="p">{s.path}</div>
            <div className="hint">{s.username ? `Compte de service ${s.domain ? `${s.domain}\\` : ""}${s.username}${s.hasPassword ? " · mot de passe enregistré" : ""}` : "Session Windows"}</div>
            {lastSources.get(s.id)?.ok === false && <div className="hint" style={{ color: "var(--crit)" }}>{lastSources.get(s.id).message}</div>}
            <div className="row">
              <button className="btn small" onClick={() => open(s)}>Modifier</button>
              <button className="btn small" onClick={() => toggle(s)}>{s.enabled ? "Désactiver" : "Activer"}</button>
              {confirmDelete === s.id ? (
                <>
                  <button className="btn small danger" onClick={() => remove(s.id)}>Confirmer la suppression</button>
                  <button className="btn small" onClick={() => setConfirmDelete(null)}>Annuler</button>
                </>
              ) : (
                <button className="btn small danger" onClick={() => setConfirmDelete(s.id)}>Supprimer</button>
              )}
            </div>
          </div>
        ),
      )}

      {editing ? (
        <form className="srcform" onSubmit={save}>
          <div className="lbl">{editing === "new" ? "Nouvelle source" : "Modifier la source"}</div>
          <div className="f"><label htmlFor="s-name">Nom</label><input className="i" id="s-name" value={form.name} onChange={set("name")} placeholder="Delivery Lyon" /></div>
          <div className="f"><label htmlFor="s-path">Chemin</label><input className="i" id="s-path" value={form.path} onChange={set("path")} placeholder="\\fs-lyon01\PROJETS\Pilotage\CEP" required /></div>
          <fieldset className="auth">
            <legend>Connexion au partage</legend>
            <label className="check">
              <input type="radio" name="s-auth" checked={form.auth === "session"} onChange={() => setForm({ ...form, auth: "session" })} />
              <span><b>Session Windows</b> (recommandé) · vos droits d'accès actuels, rien n'est enregistré</span>
            </label>
            <label className="check">
              <input type="radio" name="s-auth" checked={form.auth === "account"} onChange={() => setForm({ ...form, auth: "account" })} />
              <span><b>Compte de service</b> · seulement si votre session n'a pas accès au partage</span>
            </label>
          </fieldset>
          {form.auth === "account" && (
            <>
              <div className="f2">
                <div className="f"><label htmlFor="s-dom">Domaine</label><input className="i" id="s-dom" value={form.domain} onChange={set("domain")} placeholder="facultatif" /></div>
                <div className="f"><label htmlFor="s-user">Compte</label><input className="i" id="s-user" value={form.username} onChange={set("username")} autoComplete="off" required /></div>
              </div>
              <div className="f">
                <label htmlFor="s-pw">Mot de passe</label>
                <input className="i" id="s-pw" type="password" value={form.password} onChange={set("password")} autoComplete="new-password" placeholder={form.hasPassword ? "Inchangé" : ""} />
                <span className="hint">Chiffré sur ce PC, jamais renvoyé au navigateur.</span>
              </div>
            </>
          )}
          <label className="check"><input type="checkbox" checked={form.recursive} onChange={set("recursive")} /> Inclure les sous-dossiers</label>
          <div className="row">
            <button type="button" className="btn" onClick={() => runTest({ ...withAuth(form), id: editing !== "new" ? editing : undefined })} disabled={!form.path || test?.pending}>
              {test?.pending ? "Test…" : "Tester"}
            </button>
            <button type="submit" className="btn pri" disabled={busy}>Enregistrer</button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>Annuler</button>
          </div>
          {test && !test.pending && (
            <div className="res">
              {test.ok ? (
                <>
                  <Pill level={test.matching ? "ok" : "warn"}>{fr(test.visible)} fichiers Excel, {fr(test.matching)} avec un code</Pill>
                  {test.identity && <div className="hint" style={{ marginTop: 6 }}>Lu avec le compte {test.identity}</div>}
                  {test.sample?.length > 0 && <div className="hint" style={{ marginTop: 6 }}>{test.sample.join(" · ")}</div>}
                </>
              ) : (
                <Pill level="crit">{test.message}</Pill>
              )}
            </div>
          )}
        </form>
      ) : (
        <div><button className="btn" onClick={() => open(null)}>Ajouter une source</button></div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Quels fichiers : codes d'identification (dans le nom du fichier)
// ---------------------------------------------------------------------------

function Codes({ cfg, setCfg, projects, setToast, setError }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const counts = new Map();
  for (const p of projects) counts.set(p.matchedCode, (counts.get(p.matchedCode) || 0) + 1);

  const saveCodes = async (codes, msg) => {
    try {
      setCfg({ ...cfg, ...(await api.saveSettings({ codes })) });
      setToast(msg);
    } catch (err) {
      setError(err.message);
    }
  };
  const add = (e) => {
    e.preventDefault();
    const v = code.trim();
    if (!v) return;
    if (cfg.codes.some((c) => c.toLowerCase() === v.toLowerCase())) return setToast("Ce code existe déjà");
    setCode("");
    saveCodes([...cfg.codes, v], `Code ${v} ajouté`);
  };

  const testResult = (() => {
    if (!name.trim()) return null;
    if (name.startsWith("~$")) return { level: "warn", text: "Ignoré : fichier temporaire Excel" };
    if (!/\.xls[xm]$/i.test(name)) return { level: "warn", text: "Ignoré : seuls les fichiers .xlsm et .xlsx sont lus" };
    const hit = cfg.codes.find((c) => name.toLowerCase().includes(c.toLowerCase()));
    if (!hit) return { level: "warn", text: "Ignoré : aucun code reconnu dans le nom" };
    const parts = name.split(new RegExp(`(${escapeRe(hit)})`, "i"));
    return { level: "ok", text: `Scanné avec le code ${hit}`, parts, hit };
  })();

  return (
    <div className="step">
      <div className="step-h"><b>2</b><h3>Quels fichiers</h3></div>
      <div className="hint">Un fichier est scanné seulement si son nom contient l'un de ces codes (majuscules et minuscules confondues). Fichiers .xlsm et .xlsx, fichiers temporaires « ~$ » exclus.</div>
      <div className="codes">
        {cfg.codes.length === 0 && <p className="banner">Aucun code : aucun fichier ne sera retenu.</p>}
        {cfg.codes.map((c) => (
          <div className="code" key={c}>
            <span>{c}</span>
            <span className="row">
              <span className="c">{counts.get(c) || 0} projet{(counts.get(c) || 0) > 1 ? "s" : ""}</span>
              <button aria-label={`Retirer le code ${c}`} onClick={() => saveCodes(cfg.codes.filter((x) => x !== c), `Code ${c} retiré`)}>×</button>
            </span>
          </div>
        ))}
      </div>
      <form className="row" onSubmit={add}>
        <input className="i" style={{ flex: 1, minWidth: 0 }} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Nouveau code, ex. ACME-ERP" aria-label="Nouveau code d'identification" />
        <button className="btn" type="submit">Ajouter</button>
      </form>
      <div className="tester">
        <label className="lbl" htmlFor="t-name">Tester un nom de fichier</label>
        <input className="i" id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ACME-ERP_CEP_000_CompteExploitationProjet_FR_V11-20.xlsm" />
        {testResult && (
          <div className="res">
            <Pill level={testResult.level}>{testResult.text}</Pill>
            {testResult.parts && (
              <div className="mono" style={{ marginTop: 6, overflowWrap: "anywhere" }}>
                {testResult.parts.map((s, i) => (s.toLowerCase() === testResult.hit.toLowerCase() ? <mark key={i}>{s}</mark> : <span key={i}>{s}</span>))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Quand : planification
// ---------------------------------------------------------------------------

function Schedule({ cfg, setCfg, setToast, setError }) {
  const [form, setForm] = useState({ mode: cfg.schedule.mode, time: cfg.schedule.time, onlyModified: cfg.onlyModified, staleDays: cfg.staleDays });
  const dirty = form.mode !== cfg.schedule.mode || form.time !== cfg.schedule.time || form.onlyModified !== cfg.onlyModified || Number(form.staleDays) !== cfg.staleDays;

  const save = async (e) => {
    e.preventDefault();
    try {
      setCfg({ ...cfg, ...(await api.saveSettings({ schedule: { mode: form.mode, time: form.time }, onlyModified: form.onlyModified, staleDays: Number(form.staleDays) })) });
      setToast("Planification enregistrée");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="step" onSubmit={save}>
      <div className="step-h"><b>3</b><h3>Quand</h3></div>
      <div className="f2">
        <div className="f">
          <label htmlFor="p-mode">Fréquence</label>
          <select className="i" id="p-mode" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
            {SCHEDULES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="f">
          <label htmlFor="p-time">{form.mode === "hourly" ? "À la minute" : "Heure"}</label>
          <input className="i" id="p-time" type="time" value={form.time} disabled={form.mode === "manual"} onChange={(e) => setForm({ ...form, time: e.target.value })} />
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={form.onlyModified} onChange={(e) => setForm({ ...form, onlyModified: e.target.checked })} />
        Relire uniquement les fichiers modifiés depuis le dernier scan
      </label>
      <div className="f" style={{ maxWidth: 220 }}>
        <label htmlFor="p-stale">Signaler un CEP non modifié depuis (jours)</label>
        <input className="i" id="p-stale" type="number" min="1" value={form.staleDays} onChange={(e) => setForm({ ...form, staleDays: e.target.value })} />
      </div>
      <div className="hint">
        {cfg.nextRun ? `Prochain scan : ${new Date(cfg.nextRun).toLocaleString("fr-FR", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "Scan automatique désactivé."}
        {" "}L'application doit rester ouverte pour que les scans planifiés s'exécutent.
      </div>
      <div><button className="btn pri" type="submit" disabled={!dirty}>Enregistrer la planification</button></div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// 4. Objectifs de taux de marge : par projet (trajectoire initiale, sinon défaut) et global
// ---------------------------------------------------------------------------

const toInput = (v) => String(Math.round(v * 1000) / 10).replace(".", ",");
const fromInput = (s) => Number(String(s).replace(",", ".")) / 100;

function Objective({ cfg, setCfg, reload, setToast, setError }) {
  const o = cfg.objective;
  const [form, setForm] = useState({ defaut: toInput(o.defaut), mode: o.mode, global: toInput(o.global) });
  const d = fromInput(form.defaut), g = fromInput(form.global);
  const validD = d > 0 && d < 1, validG = form.mode === "auto" || (g > 0 && g < 1);
  const valid = validD && validG;
  const dirty = valid && (Math.abs(d - o.defaut) > 1e-9 || form.mode !== o.mode || (form.mode === "fixe" && Math.abs(g - o.global) > 1e-9));

  const save = async (e) => {
    e.preventDefault();
    try {
      setCfg({ ...cfg, ...(await api.saveSettings({ objective: { defaut: d, mode: form.mode, global: form.mode === "fixe" ? g : o.global } })) });
      await reload();
      setToast("Objectifs de marge enregistrés");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="step" onSubmit={save}>
      <div className="step-h"><b>4</b><h3>Objectifs de marge</h3></div>
      <div className="hint">Taux de marge sur CA net (CA net − coûts). Utilisés pour l'état des projets (critique sous la moitié de l'objectif), les courbes de taux de marge et les points d'attention.</div>
      <fieldset className="auth">
        <legend>Objectif par projet</legend>
        <div className="hint" style={{ margin: 0 }}>Taux de la trajectoire initiale de l'onglet Projection de chaque CEP. Pour un CEP sans trajectoire enregistrée :</div>
        <div className="f" style={{ maxWidth: 220 }}>
          <label htmlFor="o-def">Objectif par défaut (%)</label>
          <input className="i" id="o-def" inputMode="decimal" value={form.defaut} onChange={(e) => setForm({ ...form, defaut: e.target.value })} aria-invalid={!validD} />
          {!validD && <span className="hint" style={{ color: "var(--crit)" }}>Indiquez un pourcentage entre 0 et 100.</span>}
        </div>
      </fieldset>
      <fieldset className="auth">
        <legend>Objectif global (Synthèse, portefeuilles)</legend>
        <label className="check">
          <input type="radio" name="o-mode" checked={form.mode === "auto"} onChange={() => setForm({ ...form, mode: "auto" })} />
          Automatique : moyenne des objectifs des projets pondérée par leur CA net de l'année
        </label>
        <label className="check">
          <input type="radio" name="o-mode" checked={form.mode === "fixe"} onChange={() => setForm({ ...form, mode: "fixe" })} />
          Fixé
        </label>
        {form.mode === "fixe" && (
          <div className="f" style={{ maxWidth: 220 }}>
            <label htmlFor="o-glob">Objectif global (%)</label>
            <input className="i" id="o-glob" inputMode="decimal" value={form.global} onChange={(e) => setForm({ ...form, global: e.target.value })} aria-invalid={!validG} />
            {!validG && <span className="hint" style={{ color: "var(--crit)" }}>Indiquez un pourcentage entre 0 et 100.</span>}
          </div>
        )}
      </fieldset>
      <div><button className="btn pri" type="submit" disabled={!dirty}>Enregistrer les objectifs</button></div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Historique des scans
// ---------------------------------------------------------------------------

function History({ history }) {
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("problems");
  const run = history.find((h) => h.id === open);
  const items = run ? run.items.filter((i) => (filter === "all" ? true : filter === "problems" ? i.status === "error" || i.status === "warning" : i.status === filter)) : [];

  return (
    <Block title="Historique des scans" note={`${history.length} scan${history.length > 1 ? "s" : ""} conservé${history.length > 1 ? "s" : ""} · cliquer pour le détail`}>
      <div className="card flush tw">
        {history.length === 0 ? (
          <p className="muted" style={{ padding: 12 }}>Aucun scan pour le moment.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Date</th><th>Déclenchement</th><th className="n">Retenus</th><th className="n">dont inchangés</th><th className="n">Ignorés</th><th className="n">Erreurs</th><th className="n">Durée</th></tr>
            </thead>
            <tbody>
              {history.slice(0, 15).map((h) => (
                <tr key={h.id} className="click" tabIndex={0} aria-expanded={open === h.id} onClick={() => setOpen(open === h.id ? null : h.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(open === h.id ? null : h.id)}>
                  <td className="mono">{dateTimeFr(h.startedAt)}</td>
                  <td>{h.trigger}</td>
                  <td className="n">{h.retained}</td>
                  <td className="n">{h.unchanged}</td>
                  <td className="n">{h.ignored}</td>
                  <td className="n">{h.errors ? <Pill level="crit">{h.errors}</Pill> : 0}</td>
                  <td className="n">{fr((h.durationMs || 0) / 1000, 1)} s</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {run && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <b>Détail du scan du {dateTimeFr(run.startedAt)}</b>
            <select className="i" style={{ width: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrer le détail">
              <option value="problems">Erreurs et alertes</option>
              <option value="retained">Fichiers relus</option>
              <option value="ignored">Fichiers ignorés</option>
              <option value="all">Tout</option>
            </select>
          </div>
          {items.length ? (
            <div className="tw">
              <table className="log">
                <tbody>
                  {items.map((i, n) => (
                    <tr key={n}>
                      <td><Pill level={ITEM_STATUS[i.status][0]}>{ITEM_STATUS[i.status][1]}</Pill></td>
                      <td className="path">{i.file || "—"}</td>
                      <td style={{ whiteSpace: "normal" }}>{i.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">Rien à afficher pour ce filtre. Les fichiers inchangés depuis le scan précédent ne sont pas relus et n'apparaissent pas ici.</p>
          )}
        </div>
      )}
    </Block>
  );
}
