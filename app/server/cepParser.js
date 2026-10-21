import fs from "node:fs/promises";
import * as XLSX from "xlsx";

// Incrémenter quand l'extraction change : tous les fichiers sont alors relus au scan suivant.
export const PARSER_VERSION = 6;

// ---------------------------------------------------------------------------
// Lecture bas niveau
// ---------------------------------------------------------------------------

function colToNum(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

// "'Bons de commande'!$N$38", "CEP!$A$82:$BW$144", "Projection!$195:$202"
function parseRef(ref) {
  const m = /^'?(.+?)'?!(.+)$/.exec(ref || "");
  if (!m || m[1].startsWith("[")) return null;
  const [a, b = a] = m[2].replace(/\$/g, "").split(":");
  const cell = (s) => {
    const x = /^([A-Z]*)(\d*)$/i.exec(s);
    if (!x) return null;
    return { c: x[1] ? colToNum(x[1]) : null, r: x[2] ? Number(x[2]) : null };
  };
  const p1 = cell(a);
  const p2 = cell(b);
  if (!p1 || !p2) return null;
  return { sheet: m[1], r1: p1.r ?? 1, c1: p1.c ?? 1, r2: p2.r ?? 1048576, c2: p2.c ?? 16384 };
}

// Valeur affichée d'une cellule : résultat des formules, texte riche aplati, erreurs (#N/A…) → null.
function norm(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return norm(v.result);
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.error) return null;
    if ("text" in v) return v.text;
    return null;
  }
  return v;
}

function num(v) {
  const x = norm(v);
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "" && !Number.isNaN(Number(x.replace(",", ".")))) return Number(x.replace(",", "."));
  return 0;
}

function str(v) {
  const x = norm(v);
  if (x == null) return "";
  if (x instanceof Date) return Number.isNaN(x.getTime()) ? "" : x.toISOString().slice(0, 10);
  const s = String(x).trim();
  // Les champs non renseignés du modèle ressemblent à « <Client> » : on les considère vides.
  return /^<.*>$/.test(s) ? "" : s;
}

function excelSerialToDate(n) {
  return new Date(Math.round((n - 25569) * 86400000));
}

function toDate(v) {
  const x = norm(v);
  if (x instanceof Date) return Number.isNaN(x.getTime()) ? null : x;
  if (typeof x === "number" && x > 20000 && x < 80000) return excelSerialToDate(x);
  return null;
}

function monthKey(v) {
  const d = toDate(v);
  if (!d || d.getUTCFullYear() < 2000) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dateIso(v) {
  const d = toDate(v);
  return d && d.getUTCFullYear() > 1950 ? d.toISOString().slice(0, 10) : null;
}

const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// Accès par noms définis du modèle CEP
// ---------------------------------------------------------------------------

// Adaptateur minimal au-dessus d'une feuille SheetJS : sheet.getRow(r).getCell(c).value (indices 1-based).
class Sheet {
  constructor(ws) {
    this.ws = ws;
  }

  value(r, c) {
    const cell = this.ws[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })];
    if (!cell || cell.t === "e" || cell.t === "z") return null;
    return cell.v ?? null;
  }

  getRow(r) {
    return { getCell: (c) => ({ value: this.value(r, c) }) };
  }
}

class Book {
  constructor(wb) {
    this.wb = wb;
    this.sheets = new Map();
    this.names = new Map();
    // Noms globaux d'abord ; un nom local à une feuille ne remplace pas un nom global.
    for (const dn of wb.Workbook?.Names || []) {
      if (dn.Sheet != null && this.names.has(dn.Name)) continue;
      const ref = parseRef(dn.Ref);
      if (ref && (dn.Sheet == null || !this.names.has(dn.Name))) this.names.set(dn.Name, ref);
    }
  }

  sheet(name) {
    const key = fold(name);
    if (!this.sheets.has(key)) {
      const real = this.wb.SheetNames.find((n) => n === name) || this.wb.SheetNames.find((n) => fold(n) === key);
      this.sheets.set(key, real ? new Sheet(this.wb.Sheets[real]) : null);
    }
    return this.sheets.get(key);
  }

  cell(sheetName, r, c) {
    const ws = this.sheet(sheetName);
    return ws ? ws.value(r, c) : null;
  }

  ref(name) {
    return this.names.get(name) || null;
  }

  // Valeur d'un nom défini sur une seule cellule ; `fallback` = [feuille, ligne, colonne] du modèle V11-20.
  named(name, fallback) {
    const r = this.ref(name);
    if (r) return this.cell(r.sheet, r.r1, r.c1);
    return fallback ? this.cell(...fallback) : null;
  }

  // Colonnes mensuelles d'une ligne d'en-tête : { "2026-01": col, ... } et la colonne « Report avant ».
  months(sheetName, headerRow, fromCol = 1, toCol = 120) {
    const ws = this.sheet(sheetName);
    const cols = {};
    let report = null;
    if (!ws) return { cols, report };
    const row = ws.getRow(headerRow);
    for (let c = fromCol; c <= toCol; c++) {
      const v = norm(row.getCell(c).value);
      const k = monthKey(v);
      if (k) cols[k] = c;
      else if (typeof v === "string" && /^report/i.test(v.trim())) report = c;
    }
    return { cols, report };
  }

  series(sheetName, r, monthCols) {
    const ws = this.sheet(sheetName);
    const out = {};
    if (!ws) return out;
    const row = ws.getRow(r);
    for (const [k, c] of Object.entries(monthCols)) out[k] = num(row.getCell(c).value);
    return out;
  }
}

// ---------------------------------------------------------------------------
// Extraction métier
// ---------------------------------------------------------------------------

// Lignes du bloc « COMPTE D'EXPLOITATION PROJET » (onglet CEP), repérées par section + libellé
// pour résister à l'insertion de lignes dans le modèle.
const CEP_ROWS = {
  couts: {
    "salaires charges": "salaires",
    "achat, frais de deplacement,…": "achats",
    "achat, frais de deplacement,...": "achats",
    "couts de locaux (instantanes)": "locaux",
    "couts de plateformes iaas caas (instantanes)": "plateformes",
    "sous-traitance externe": "sttExtCout",
    "sous-traitance interne": "sttIntCout",
    "total charges": "totalCharges",
  },
  brut: {
    prestation: "caPresta",
    "revente, frais refactures,…": "caRevente",
    "revente, frais refactures,...": "caRevente",
    "sous-traitance externe": "caSttExt",
    "sous-traitance interne": "caSttInt",
    "total produits": "caBrut",
  },
  net: {
    "remise contrat cadre, pqf": "rfa",
    "total produits": "caNet",
  },
  rbrut: { marge: "margeBrute" },
  rnet: { marge: "margeNette" },
};

function sectionOf(label) {
  const f = fold(label);
  if (f === "couts") return "couts";
  if (f.startsWith("produit (ca brut")) return "brut";
  if (f.startsWith("produit (ca net")) return "net";
  if (f === "prix") return "prix";
  if (f.startsWith("rentabilite (brut")) return "rbrut";
  if (f.startsWith("rentabilite (net")) return "rnet";
  return null;
}

function extractCep(book) {
  const zone = book.ref("CEP_Zone_CEP") || { sheet: "CEP", r1: 82, r2: 144, c1: 1, c2: 75 };
  const hdr = book.ref("CEP_Zone_Recherche_Date") || { sheet: "CEP", r1: 1 };
  let { cols, report } = book.months(zone.sheet, zone.r1, 1, zone.c2);
  if (!Object.keys(cols).length) ({ cols, report } = book.months(zone.sheet, hdr.r1, 1, zone.c2));

  const ws = book.sheet(zone.sheet);
  const rows = {};
  const reportVals = {};
  let section = null;
  for (let r = zone.r1; r <= zone.r2 && ws; r++) {
    const label = norm(ws.getRow(r).getCell(3).value) ?? norm(ws.getRow(r).getCell(2).value);
    if (typeof label !== "string") continue;
    const s = sectionOf(label);
    if (s) {
      section = s;
      continue;
    }
    const key = CEP_ROWS[section]?.[fold(label)];
    if (key && !rows[key]) {
      rows[key] = book.series(zone.sheet, r, cols);
      reportVals[key] = report ? num(ws.getRow(r).getCell(report).value) : 0;
    }
  }
  return { months: Object.keys(cols).sort(), rows, report: reportVals };
}

function extractActivite(book, months) {
  const hdr = book.ref("ACT_Zone_Recherche_Date") || { sheet: "Activité", r1: 1 };
  const { cols, report } = book.months(hdr.sheet, hdr.r1, 1, hdr.c2 || 80);
  const ws = book.sheet(hdr.sheet);

  const team = (zoneName, fallback) => {
    const z = book.ref(zoneName) || fallback;
    const list = [];
    for (let r = z.r1; r <= z.r2 && ws; r++) {
      const row = ws.getRow(r);
      const trig = str(row.getCell(5).value);
      const nom = str(row.getCell(6).value).replace(/,\s*$/, "");
      if (!trig && !nom) continue;
      const jours = {};
      let total = 0;
      for (const [k, c] of Object.entries(cols)) {
        jours[k] = num(row.getCell(c).value);
        total += jours[k];
      }
      const rep = report ? num(row.getCell(report).value) : 0;
      list.push({
        site: str(row.getCell(2).value),
        trigramme: trig,
        nom,
        role: str(row.getCell(8).value),
        ajustement: /^ZZZ_/i.test(trig), // lignes ZZZ_GAIN / ZZZ_PERTE du modèle
        report: rep,
        jours,
        total: total + rep,
      });
    }
    return list;
  };

  const pilot = team("ACT_Zone_Equipe_Conso_Pilot", { r1: 4, r2: 33 });
  const prev = team("ACT_Zone_Equipe_Conso_Prev", { r1: 41, r2: 70 });
  const sumBy = (list) => {
    const out = {};
    for (const k of Object.keys(cols)) out[k] = list.reduce((a, p) => a + (p.jours[k] || 0), 0);
    return out;
  };
  // Profil ZZZ_GAIN_IA (onglet Équipe, repris dans l'onglet Activité) : jours gagnés grâce à l'IA,
  // saisis dans le réalisé et/ou le prévisionnel. Le signe dépend des saisies : on garde la valeur absolue.
  const gainRow = (list) => list.find((p) => /^ZZZ_GAIN_IA$/i.test(p.trigramme) || /^ZZZ_GAIN_IA$/i.test(p.nom));
  const gp = gainRow(pilot), gf = gainRow(prev);
  const gainIaPilot = {}, gainIaPrev = {};
  for (const k of Object.keys(cols)) {
    gainIaPilot[k] = Math.abs(gp?.jours[k] || 0);
    gainIaPrev[k] = Math.abs(gf?.jours[k] || 0);
  }
  const instant = book.ref("ACT_Zone_Jours_Instant");
  return {
    gainIaPilot,
    gainIaPrev,
    months: Object.keys(cols).sort(),
    joursPilot: sumBy(pilot),
    joursPrev: sumBy(prev),
    joursTotal: instant ? book.series(instant.sheet, instant.r1, cols) : {},
    equipe: pilot.filter((p) => !p.ajustement && p.total > 0),
    equipePrev: prev.filter((p) => !p.ajustement && p.total > 0),
  };
}

function extractBons(book) {
  const z = book.ref("BON_Zone_BC_Presta") || { sheet: "Bons de commande", r1: 3, r2: 17 };
  const ws = book.sheet(z.sheet);
  const list = [];
  for (let r = z.r1; r <= z.r2 && ws; r++) {
    const row = ws.getRow(r);
    const bc = {
      id: str(row.getCell(5).value),
      numero: str(row.getCell(6).value),
      regroupement: str(row.getCell(7).value),
      intitule: str(row.getCell(8).value),
      joursVendus: num(row.getCell(9).value),
      caVendu: num(row.getCell(10).value),
      achatsFrais: num(row.getCell(11).value),
      factureClient: str(row.getCell(12).value),
      tjmVendu: num(row.getCell(13).value),
      tjmObjectif: num(row.getCell(19).value),
      joursObjectif: num(row.getCell(20).value),
      mois: monthKey(row.getCell(4).value),
    };
    if (bc.numero || bc.intitule || bc.joursVendus || bc.caVendu) list.push(bc);
  }
  return list;
}

function extractFacturation(book) {
  const hdr = book.ref("FAC_Zone_Recherche_Date") || { sheet: "Facturation", r1: 1 };
  const { cols } = book.months(hdr.sheet, hdr.r1, 1, hdr.c2 || 80);
  const row = (name, fallback) => {
    const z = book.ref(name);
    return book.series(z?.sheet || hdr.sheet, z?.r1 || fallback, cols);
  };
  return {
    theorique: row("FAC_Zone_Theorique_Instant", 72),
    reel: row("FAC_Zone_Reel_Instant", 73),
  };
}

function extractBudget(book) {
  const z = book.ref("BUD_Zone_Trajectoire_Initiale") || { sheet: "Projection", r1: 10, r2: 20 };
  const hdr = book.ref("BUD_Zone_Recherche_Date") || { sheet: "Projection", r1: 7 };
  const { cols } = book.months(hdr.sheet, hdr.r1, 1, hdr.c2 || 70);
  const ws = book.sheet(z.sheet);
  const out = {};
  const wanted = { "conso mois": "conso", "ca net mois": "caNet", "couts mois": "couts" };
  for (let r = z.r1; r <= z.r2 && ws; r++) {
    const key = wanted[fold(norm(ws.getRow(r).getCell(2).value))];
    if (key) out[key] = book.series(z.sheet, r, cols);
  }
  // Date d'enregistrement de la trajectoire initiale (vide tant que le DP ne l'a pas figée).
  out.dateEnreg = dateIso(book.named("BUD_Date_Enreg_Trajectoire_Initiale", ["Projection", 3, 3]));
  return out;
}

function extractPam(book) {
  const ws = book.sheet("PAM");
  if (!ws) return [];
  // En-tête repéré par « TYPE DE LEVIER » dans les 12 premières lignes.
  let head = 6;
  for (let r = 1; r <= 12; r++) if (fold(norm(ws.getRow(r).getCell(3).value)) === "type de levier") head = r;
  const list = [];
  for (let r = head + 1; r <= head + 60; r++) {
    const row = ws.getRow(r);
    const first = fold(norm(row.getCell(1).value));
    if (first.startsWith("pour ajouter")) break;
    const a = {
      type: str(row.getCell(3).value),
      levier: str(row.getCell(4).value),
      description: str(row.getCell(5).value),
      responsable: str(row.getCell(6).value),
      confiance: str(row.getCell(7).value),
      caPrevu: num(row.getCell(8).value),
      margePrevue: num(row.getCell(9).value),
      statut: str(row.getCell(10).value),
      debut: dateIso(row.getCell(11).value),
      fin: dateIso(row.getCell(12).value),
      caGain: num(row.getCell(13).value),
      margeGain: num(row.getCell(14).value),
      integre: str(row.getCell(15).value),
    };
    // Les leviers du catalogue sont pré-remplis : on ne garde que les actions réellement saisies.
    if (a.description || a.statut || a.caPrevu || a.margePrevue || a.caGain || a.margeGain) list.push(a);
  }
  return list;
}

function extractSommaire(book) {
  const N = (name, fb) => book.named(name, fb);
  const S = "Sommaire";
  return {
    versionModele: str(N("SOM_Version_Modele", [S, 1, 1])),
    codeProjet: str(N("VAL_CODE_PROJET", [S, 6, 3])),
    client: str(N("SOM_Client", [S, 7, 3])),
    projet: str(N("SOM_Projet", [S, 8, 3])),
    entite: str(N("SOM_CentreDeProduction", [S, 9, 3])),
    numAffaire: str(N("SOM_Num_Affaire", [S, 10, 3])),
    rc: str(N("SOM_RC", [S, 11, 3])),
    dp: str(N("SOM_DP", [S, 12, 3])),
    cp: str(N("SOM_CP", [S, 13, 3])),
    typologie: str(N("SOM_Typologie_Projet", [S, 14, 3])),
    secteur: str(N("SOM_Secteur", [S, 7, 8])),
    modeFacturation: str(N("SOM_Mode_Facturation", [S, 8, 8])),
    emplacement: str(N("SOM_Emplacement", [S, 9, 8])),
    description: str(N("SOM_Description", [S, 23, 3])).replace(/^a completer$/i, ""),
    dateDebut: dateIso(N("SOM_Date_Debut_Projet", [S, 19, 3])),
    dateFin: dateIso(N("SOM_Date_Fin_Projet", [S, 19, 8])),
    dateMaj: dateIso(N("SOM_Date_MAJ", [S, 20, 3])),
    moisRef: monthKey(N("SOM_Date_Ref", [S, 21, 3])),
    kpi: {
      tjm: { mois: num(N("SOM_TJM_Mois_Courant")), cumul: num(N("SOM_TJM_Cumul")), fin: num(N("SOM_TJM_Fin_Affaire")) },
      prj: { mois: num(N("SOM_PRJ_Mois_Courant")), cumul: num(N("SOM_PRJ_Cumul")), fin: num(N("SOM_PRJ_Fin_Affaire")) },
      rentaBrut: { mois: num(N("SOM_Renta_Mois_Courant_Brut")), cumul: num(N("SOM_Renta_Cumul_Brut")), fin: num(N("SOM_Renta_Fin_Affaire_Brut")) },
      rentaNet: { mois: num(N("SOM_Renta_Mois_Courant_Net")), cumul: num(N("SOM_Renta_Cumul_Net")), fin: num(N("SOM_Renta_Fin_Affaire_Net")) },
      rentaPrestaBrut: { mois: num(N("SOM_Renta_Presta_Mois_Courant_Brut")), cumul: num(N("SOM_Renta_Presta_Cumul_Brut")), fin: num(N("SOM_Renta_Presta_Fin_Affaire_Brut")) },
      conso: { mois: num(N("SOM_Conso_Mois_Courant")), cumul: num(N("SOM_Conso_Cumul")), fin: num(N("SOM_Conso_Fin_Affaire")) },
      joursVendus: num(N("SOM_Total_Jours_Vendus")),
      joursObjectif: num(N("SOM_Total_Jours_Objectifs")),
      deriveVente: num(N("SOM_Derive_Vente")),
      pctDeriveVente: num(N("SOM_Pourcentage_Derive_Vente")),
      deriveObjectif: num(N("SOM_Derive_Objectif")),
      pctDeriveObjectif: num(N("SOM_Pourcentage_Derive_Objectif")),
      raf: num(N("SOM_RAF")),
      caBrutFin: num(N("SOM_CA_Brut_Fin_Affaire")),
      caNetFin: num(N("SOM_CA_Net_Fin_Affaire")),
      coutFin: num(N("SOM_Cout_Fin_Affaire")),
      pctFacturation: num(N("SOM_Total_Facturation_Cumul")),
      caBrutTotal: num(N("CEP_CA_Total_Brut")),
      caNetTotal: num(N("CEP_CA_Total_Net")),
      coutTotal: num(N("CEP_Cout_Total")),
    },
    parametres: {
      margeMinimum: num(N("PAR_Marge", ["Paramètres", 5, 2])),
      rfa: num(N("PAR_RFA", ["Paramètres", 8, 2])),
      version: str(N("RMP_Version_Modele", ["Paramètres", 3, 2])),
    },
  };
}

// Code projet : CODE PROJET du Sommaire s'il est renseigné, sinon le début du nom de fichier avant « _CEP ».
export function projectKey(fileName, codeProjet) {
  if (codeProjet) return codeProjet;
  const base = fileName.replace(/\.[^.]+$/, "");
  const m = /^(.+?)_CEP(_|$)/i.exec(base);
  return m ? m[1] : base;
}

/** Lit un fichier CEP et renvoie un objet projet normalisé. */
export async function parseCepFile(filePath, fileName) {
  const wb = XLSX.read(await fs.readFile(filePath), {
    type: "buffer",
    cellFormula: false,
    cellHTML: false,
    cellText: false,
    cellStyles: false,
    bookVBA: false,
  });
  const book = new Book(wb);
  if (!book.sheet("CEP") || !book.sheet("Sommaire")) {
    throw new Error("Ce fichier n'a pas la structure d'un CEP (onglets Sommaire et CEP introuvables).");
  }
  const som = extractSommaire(book);
  const cep = extractCep(book);
  const activite = extractActivite(book, cep.months);
  return {
    key: projectKey(fileName, som.codeProjet),
    ...som,
    cep,
    activite,
    bons: extractBons(book),
    facturation: extractFacturation(book),
    budget: extractBudget(book),
    pam: extractPam(book),
  };
}
