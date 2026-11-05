/**
 * Classification des journaux FEC pour la détection LCB-FT / COH / STAT.
 * Heuristique issue du volume réel (journal.txt) : code prioritaire, libellé pour ambiguïtés (CA).
 */

/** @typedef {'ACH'|'VEN'|'BQ'|'CAI'|'OD'|'AN'|'OTHER'} JournalFamille */

const ACH_CODES = new Set(['AC', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'HA', '40', '60']);
const VEN_CODES = new Set(['VE', 'VT', 'V1', 'V2', 'V3', 'V4', 'VA', 'VM', '70', '41', '00']);
/** Codes banque fréquents (+ variantes B6–B9, CM, CB…). */
const BQ_CODES = new Set([
  'B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9',
  'BQ', 'BP', 'BN', 'BB', 'BE', 'BA',
  'CM', 'BC', 'BF', 'CB', 'CC', 'BH',
]);
/** OD + imports / immobilisations / OD numérotés O3–O9. */
const OD_CODES = new Set([
  'OD', 'O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8', 'O9',
  'OC', 'TV', 'PA', '49', 'EX', 'RE', 'IM',
]);
const AN_CODES = new Set(['AN', '20', '10']);
/** Caisse explicite hors code ambigu CA. */
const CAI_CODES = new Set(['C0', 'C1', 'C2', 'C3', 'C4', 'C5']);

/**
 * @param {unknown} value
 * @returns {string}
 */
function normCode(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normLib(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/**
 * @param {string} lib
 * @returns {boolean}
 */
function libIsCaisse(lib) {
  return /\bCAISSE\b/.test(lib) || lib.includes('CAISSE');
}

/**
 * @param {string} lib
 * @returns {boolean}
 */
function libIsCreditAgricole(lib) {
  if (!lib) return false;
  if (lib.includes('CREDIT AGRICOLE') || lib.includes('CRCA')) return true;
  if (/\bAGRICOLE\b/.test(lib)) return true;
  // « CA » seul dans le libellé n'est pas discriminant
  return false;
}

/**
 * @param {string} lib
 * @returns {boolean}
 */
function libIsBanque(lib) {
  if (!lib) return false;
  if (libIsCreditAgricole(lib)) return true;
  return (
    lib.includes('BANQUE')
    || lib.includes('CREDIT MUTUEL')
    || lib.includes('CAISSE EPARGNE')
    || lib.includes('SOCIETE GENERALE')
    || lib.includes('STE GENERALE')
    || lib.includes('BNP')
    || lib.includes('BPFC')
    || lib.includes('LCL')
    || /\bBQ\b/.test(lib)
  );
}

/**
 * @param {string} lib
 * @returns {boolean}
 */
function libIsAchats(lib) {
  return lib.includes('ACHAT');
}

/**
 * @param {string} lib
 * @returns {boolean}
 */
function libIsVentes(lib) {
  return lib.includes('VENTE');
}

/**
 * @param {string} lib
 * @returns {boolean}
 */
function libIsOd(lib) {
  return (
    lib.includes('OPERATIONS DIVERSES')
    || lib.includes('OPERATION DIVERSE')
    || /\bOD\b/.test(lib)
    || lib.includes('EXTOURNE')
    || lib.includes('INVENTAIRE')
  );
}

/**
 * @param {string} lib
 * @returns {boolean}
 */
function libIsAn(lib) {
  return (
    lib.includes('A NOUVEAU')
    || lib.includes('A-NOUVEAU')
    || lib.includes('ANOUVEAU')
    || lib.includes('REPORT A NOUVEAU')
    || lib.includes('OUVERTURE DE BILAN')
  );
}

/**
 * Classe un journal FEC.
 * @param {unknown} code JournalCode
 * @param {unknown} [lib] JournalLib
 * @returns {JournalFamille}
 */
export function classifyJournal(code, lib) {
  const c = normCode(code);
  const l = normLib(lib);

  // Ambiguïté CA : caisse vs Crédit Agricole — décision sur le libellé
  if (c === 'CA') {
    if (libIsCaisse(l)) return 'CAI';
    if (libIsCreditAgricole(l) || libIsBanque(l)) return 'BQ';
    // Lib vide / « CA » seul : non classé (évite faux positifs caisse↔banque)
    return 'OTHER';
  }

  if (ACH_CODES.has(c)) return 'ACH';
  if (VEN_CODES.has(c)) return 'VEN';
  if (BQ_CODES.has(c)) return 'BQ';
  if (CAI_CODES.has(c)) {
    // C1/C3 : caisse sauf libellé clairement banque
    if (libIsBanque(l) && !libIsCaisse(l)) return 'BQ';
    return 'CAI';
  }
  if (OD_CODES.has(c)) return 'OD';
  if (AN_CODES.has(c)) return 'AN';

  // Fallback libellé pour codes hors table
  if (libIsCaisse(l)) return 'CAI';
  if (libIsBanque(l)) return 'BQ';
  if (libIsAchats(l)) return 'ACH';
  if (libIsVentes(l)) return 'VEN';
  if (libIsAn(l)) return 'AN';
  if (libIsOd(l)) return 'OD';

  return 'OTHER';
}

/** @param {unknown} code @param {unknown} [lib] */
export function isAch(code, lib) {
  return classifyJournal(code, lib) === 'ACH';
}

/** @param {unknown} code @param {unknown} [lib] */
export function isVen(code, lib) {
  return classifyJournal(code, lib) === 'VEN';
}

/** @param {unknown} code @param {unknown} [lib] */
export function isBq(code, lib) {
  return classifyJournal(code, lib) === 'BQ';
}

/** @param {unknown} code @param {unknown} [lib] */
export function isCai(code, lib) {
  return classifyJournal(code, lib) === 'CAI';
}

/** @param {unknown} code @param {unknown} [lib] */
export function isOd(code, lib) {
  return classifyJournal(code, lib) === 'OD';
}

/** @param {unknown} code @param {unknown} [lib] */
export function isAn(code, lib) {
  return classifyJournal(code, lib) === 'AN';
}

export const JOURNAL_FAMILLES = Object.freeze(['ACH', 'VEN', 'BQ', 'CAI', 'OD', 'AN', 'OTHER']);
