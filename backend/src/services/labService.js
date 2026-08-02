import fs from 'fs/promises';
import path from 'path';
import { poolPromise, sql } from '../config/db.js';
import { PATHS } from '../config/paths.js';

/**
 * Agrégats risque / KYC / événements pour une liste de codes clients (accès par code).
 * @param {string[]} codesClients
 * @returns {Promise<Map<string, object>>}
 */
export async function getDossiersRisque(codesClients, scope = { isFull: true, idSellsy: null }) {
  try {
    if (!Array.isArray(codesClients) || codesClients.length === 0) {
      return new Map();
    }

    const codesCsv = codesClients.map((c) => String(c).trim()).filter(Boolean).join(',');
    if (!codesCsv) {
      return new Map();
    }

    const pool = await poolPromise;
    const scopeClause = buildScopeClause(scope, 'd.code_client');
    const query = `
      SELECT
        d.code_client,
        d.niveau_risque,
        d.statut_kyc,
        d.date_derniere_revue,
        d.date_prochaine_revue,
        d.statut_dossier,
        (SELECT COUNT(*) FROM lab_evenements e
         WHERE e.code_client = d.code_client
         AND e.statut != 'Cloture') AS nb_evenements_ouverts,
        (SELECT COUNT(*) FROM lab_diligences di
         WHERE di.code_client = d.code_client
         AND di.statut = 'A_faire'
         AND di.date_echeance < GETDATE()) AS nb_diligences_retard
      FROM lab_dossier d
      WHERE d.code_client IN (SELECT value FROM STRING_SPLIT(@codesClients, ','))
      ${scopeClause ? `AND ${scopeClause.clause}` : ''}
    `;

    const request = pool
      .request()
      .input('codesClients', sql.NVarChar(sql.MAX), codesCsv);
    if (scopeClause) {
      request.input(scopeClause.input.name, scopeClause.input.type, scopeClause.input.value);
    }
    const result = await request.query(query);

    const map = new Map();
    for (const row of result.recordset || []) {
      const key = row.code_client != null ? String(row.code_client).trim() : '';
      if (!key) continue;
      map.set(key, {
        code_client: key,
        niveau_risque: row.niveau_risque != null ? String(row.niveau_risque).trim() : null,
        statut_kyc: row.statut_kyc != null ? String(row.statut_kyc).trim() : null,
        date_derniere_revue: row.date_derniere_revue ?? null,
        date_prochaine_revue: row.date_prochaine_revue ?? null,
        statut_dossier: row.statut_dossier != null ? String(row.statut_dossier).trim() : null,
        nb_evenements_ouverts: row.nb_evenements_ouverts ?? 0,
        nb_diligences_retard: row.nb_diligences_retard ?? 0,
      });
    }

    return map;
  } catch (err) {
    console.error('Erreur getDossiersRisque:', err);
    throw err;
  }
}

/**
 * Résumé LAB pour un client (une ligne lab_dossier + agrégats événements / diligences).
 * @param {string} codeClient
 * @returns {Promise<object|null>}
 */
export async function getResumeLab(codeClient) {
  try {
    const code = codeClient != null ? String(codeClient).trim() : '';
    if (!code) {
      return null;
    }

    const pool = await poolPromise;
    const query = `
      SELECT
        d.code_client,
        d.niveau_risque,
        d.statut_dossier,
        d.statut_kyc,
        d.date_prochaine_revue,
        (SELECT COUNT(*)
         FROM lab_evenements e
         WHERE e.code_client = d.code_client
           AND e.statut != 'Cloture') AS nb_evenements_ouverts,
        (SELECT COUNT(*)
         FROM lab_diligences di
         WHERE di.code_client = d.code_client
           AND di.date_echeance IS NOT NULL
           AND di.date_echeance < CAST(GETDATE() AS DATE)
           AND di.statut NOT IN ('Realisee', 'Abandonnee')) AS nb_diligences_retard
      FROM lab_dossier d
      WHERE RTRIM(LTRIM(d.code_client)) = RTRIM(LTRIM(@code_client))
    `;

    const result = await pool
      .request()
      .input('code_client', sql.NVarChar(10), code.length > 10 ? code.slice(0, 10) : code)
      .query(query);

    const row = result.recordset?.[0];
    if (!row) {
      return null;
    }

    const key = row.code_client != null ? String(row.code_client).trim() : code;

    return {
      code_client: key,
      niveau_risque: row.niveau_risque != null ? String(row.niveau_risque).trim() : null,
      statut_dossier: row.statut_dossier != null ? String(row.statut_dossier).trim() : null,
      statut_kyc: row.statut_kyc != null ? String(row.statut_kyc).trim() : null,
      date_prochaine_revue: row.date_prochaine_revue ?? null,
      nb_evenements_ouverts: row.nb_evenements_ouverts ?? 0,
      nb_diligences_retard: row.nb_diligences_retard ?? 0,
    };
  } catch (err) {
    console.error('Erreur getResumeLab:', err);
    throw err;
  }
}

/**
 * Nettoie une valeur texte retournée par SQL Server (NCHAR → trim, vide → null).
 */
function cleanText(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function formatCollaborateur(prenom, nom, fallbackId) {
  const fullName = [cleanText(prenom), cleanText(nom)].filter(Boolean).join(' ');
  return fullName || cleanText(fallbackId) || 'Non attribué';
}

function normalizeCriticite(value) {
  const clean = cleanText(value);
  if (!clean) return 'Faible';
  if (clean === 'Élevée' || clean === 'Elevée' || clean === 'Elevee') return 'Elevee';
  if (clean === 'Moyenne') return 'Moyenne';
  return 'Faible';
}

function yesNoUnknown(value) {
  const clean = cleanText(value);
  if (!clean) return 'Inconnu';
  const upper = clean.toUpperCase();
  if (upper === 'O' || upper === 'OUI' || upper === 'Y' || upper === 'YES' || upper === '1') {
    return 'Oui';
  }
  if (upper === 'N' || upper === 'NON' || upper === 'NO' || upper === '0') {
    return 'Non';
  }
  return 'Inconnu';
}

function normalizeModeControle(value) {
  const clean = cleanText(value);
  if (!clean) return 'Autre';
  const normalized = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized.includes('vote')) return 'Droits_vote';
  if (normalized.includes('fait')) return 'Controle_de_fait';
  if (normalized.includes('capital') || normalized.includes('detention')) return 'Detention_capital';
  return 'Autre';
}

function normalizeStatutPiece(value) {
  const clean = cleanText(value);
  if (!clean) return 'Manquante';
  const normalized = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized.includes('recu') || normalized.includes('recue')) return 'Recue';
  if (normalized.includes('perime')) return 'Perimee';
  if (normalized.includes('non') && normalized.includes('requ')) return 'Non_requise';
  return 'Manquante';
}

function normalizeStatutRevue(value) {
  const clean = cleanText(value);
  if (!clean) return 'En_cours';
  const normalized = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized.includes('annul')) return 'Annulee';
  if (normalized.includes('clotur') || normalized.includes('cloture')) return 'Cloturee';
  return 'En_cours';
}

function normalizeNiveauRisque(value) {
  const clean = cleanText(value);
  if (!clean) return 'Faible';
  const normalized = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized.includes('eleve')) return 'Eleve';
  if (normalized.includes('moy')) return 'Moyen';
  return 'Faible';
}

function normalizeComplexite(value) {
  const clean = cleanText(value);
  if (!clean) return 'Inconnue';
  const normalized = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized.includes('simple')) return 'Simple';
  if (normalized.includes('complex')) return 'Complexe';
  if (normalized.includes('moy')) return 'Moyenne';
  return 'Inconnue';
}

function splitTextList(value) {
  const clean = cleanText(value);
  if (!clean) return [];
  return clean
    .split(/[;,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumberOrNull(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeNiveauRisqueForStorage(value) {
  const clean = cleanText(value);
  if (!clean) return 'Faible';
  const normalized = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized.includes('eleve')) return 'Eleve';
  if (normalized.includes('moy')) return 'Moyen';
  return 'Faible';
}

function parseIsoDate(value) {
  if (value == null || String(value).trim() === '') return null;
  const raw = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return undefined;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function todayUtcDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addMonthsUtc(date, months) {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function addDaysUtc(date, days) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function normalizeIntituleKey(value) {
  const clean = cleanText(value);
  return clean ? clean.toLowerCase() : '';
}

export class LabDossierError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'LabDossierError';
    this.statusCode = statusCode;
  }
}

async function assertClientExists(transaction, codeClient) {
  const result = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1 1 AS ok
      FROM clients
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);
  if (!result.recordset?.[0]) {
    throw new LabDossierError('Client introuvable', 404);
  }
}

async function assertDossierAbsent(transaction, codeClient) {
  const result = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1 id
      FROM lab_dossier
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);
  if (result.recordset?.[0]) {
    throw new LabDossierError('Dossier LAB déjà existant pour ce client', 409);
  }
}

async function assertCollaborateurExists(transaction, idSellsy, fieldLabel) {
  const result = await new sql.Request(transaction)
    .input('id_sellsy', sql.NVarChar(20), idSellsy)
    .query(`
      SELECT TOP 1 1 AS ok
      FROM collaborateurs
      WHERE RTRIM(LTRIM(id_sellsy)) = RTRIM(LTRIM(@id_sellsy))
    `);
  if (!result.recordset?.[0]) {
    throw new LabDossierError(`${fieldLabel} introuvable`, 400);
  }
}

/**
 * Crée un dossier LAB pour un client existant (transaction : dossier + audit + événement).
 * @param {{ code_client: string, lab?: object, options?: { creer_evenement_entree?: boolean } }} payload
 * @param {string|null} userId id_sellsy du collaborateur authentifié
 * @returns {Promise<object>} même shape que getDossierLab
 */
export async function createDossierLab(payload, userId = null) {
  const code = payload?.code_client != null ? String(payload.code_client).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  const codeSafe = code.length > 10 ? code.slice(0, 10) : code;

  const labInput = payload.lab && typeof payload.lab === 'object' ? payload.lab : {};
  const creerEvenementEntree = payload.options?.creer_evenement_entree !== false;

  const statutDossier = cleanText(labInput.statut_dossier) || 'Actif';
  const niveauRisque = normalizeNiveauRisqueForStorage(labInput.niveau_risque);
  const statutKyc = cleanText(labInput.statut_kyc) || 'Incomplet';
  const periodiciteRevueMois = toNumberOrNull(labInput.periodicite_revue_mois) ?? 12;
  if (!Number.isInteger(periodiciteRevueMois) || periodiciteRevueMois < 1) {
    throw new LabDossierError('periodicite_revue_mois invalide', 400);
  }

  const scoreRisqueGlobal = labInput.score_risque_global != null
    ? toNumberOrNull(labInput.score_risque_global)
    : null;
  if (labInput.score_risque_global != null && scoreRisqueGlobal == null) {
    throw new LabDossierError('score_risque_global invalide', 400);
  }

  const idResponsableLab = cleanText(labInput.id_responsable_lab);
  const creePar = cleanText(userId);

  const dateEntreeRelation = labInput.date_entree_relation != null
    ? parseIsoDate(labInput.date_entree_relation)
    : todayUtcDate();
  if (dateEntreeRelation === undefined) {
    throw new LabDossierError('date_entree_relation invalide', 400);
  }
  const dateEntree = dateEntreeRelation ?? todayUtcDate();

  let dateDerniereRevue = null;
  if (labInput.date_derniere_revue != null && String(labInput.date_derniere_revue).trim() !== '') {
    dateDerniereRevue = parseIsoDate(labInput.date_derniere_revue);
    if (dateDerniereRevue === undefined) {
      throw new LabDossierError('date_derniere_revue invalide', 400);
    }
  }

  let dateProchaineRevue = null;
  if (labInput.date_prochaine_revue != null && String(labInput.date_prochaine_revue).trim() !== '') {
    dateProchaineRevue = parseIsoDate(labInput.date_prochaine_revue);
    if (dateProchaineRevue === undefined) {
      throw new LabDossierError('date_prochaine_revue invalide', 400);
    }
  } else {
    dateProchaineRevue = addMonthsUtc(dateEntree, periodiciteRevueMois);
  }

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await assertClientExists(transaction, codeSafe);
    await assertDossierAbsent(transaction, codeSafe);
    if (idResponsableLab) {
      await assertCollaborateurExists(transaction, idResponsableLab, 'collaborateur');
    }

    const insertDossier = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('statut_dossier', sql.NChar(20), statutDossier)
      .input('niveau_risque', sql.NChar(10), niveauRisque)
      .input('score_risque_global', sql.Decimal(8, 2), scoreRisqueGlobal)
      .input('id_responsable_lab', sql.NChar(20), idResponsableLab)
      .input('date_entree_relation', sql.Date, dateEntree)
      .input('date_derniere_revue', sql.Date, dateDerniereRevue)
      .input('date_prochaine_revue', sql.Date, dateProchaineRevue)
      .input('periodicite_revue_mois', sql.Int, periodiciteRevueMois)
      .input('statut_kyc', sql.NChar(20), statutKyc)
      .input('cree_par', sql.NChar(20), creePar)
      .query(`
        INSERT INTO lab_dossier (
          code_client,
          statut_dossier,
          niveau_risque,
          score_risque_global,
          id_responsable_lab,
          date_entree_relation,
          date_derniere_revue,
          date_prochaine_revue,
          periodicite_revue_mois,
          statut_kyc,
          cree_par,
          modifie_par
        )
        OUTPUT INSERTED.id
        VALUES (
          @code_client,
          @statut_dossier,
          @niveau_risque,
          @score_risque_global,
          @id_responsable_lab,
          @date_entree_relation,
          @date_derniere_revue,
          @date_prochaine_revue,
          @periodicite_revue_mois,
          @statut_kyc,
          @cree_par,
          @cree_par
        )
      `);

    const dossierId = insertDossier.recordset?.[0]?.id;
    if (dossierId == null) {
      throw new Error('INSERT lab_dossier sans id retourné');
    }

    const auditDetail = JSON.stringify({
      niveau_risque: niveauRisque,
      id_responsable_lab: idResponsableLab,
      source: 'wizard',
    });

    await new sql.Request(transaction)
      .input('id_utilisateur', sql.NChar(20), creePar)
      .input('id_entite', sql.NVarChar(50), String(dossierId))
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('detail', sql.NVarChar(sql.MAX), auditDetail)
      .query(`
        INSERT INTO lab_audit_log (
          id_utilisateur,
          type_action,
          entite,
          id_entite,
          code_client,
          detail
        )
        VALUES (
          @id_utilisateur,
          N'CREATION_DOSSIER',
          N'lab_dossier',
          @id_entite,
          @code_client,
          @detail
        )
      `);

    if (creerEvenementEntree) {
      const eventResponsable = idResponsableLab || creePar;
      await new sql.Request(transaction)
        .input('code_client', sql.NVarChar(10), codeSafe)
        .input('type_evenement', sql.NChar(50), 'ENTREE_RELATION')
        .input('libelle', sql.NChar(200), 'Entrée en relation')
        .input('criticite', sql.NChar(10), 'Moyenne')
        .input('statut', sql.NChar(20), 'Ouvert')
        .input('date_evenement', sql.Date, dateEntree)
        .input('id_responsable', sql.NChar(20), eventResponsable)
        .input('cree_par', sql.NChar(20), creePar)
        .query(`
          INSERT INTO lab_evenements (
            code_client,
            type_evenement,
            libelle,
            criticite,
            statut,
            date_evenement,
            id_responsable,
            cree_par,
            modifie_par
          )
          VALUES (
            @code_client,
            @type_evenement,
            @libelle,
            @criticite,
            @statut,
            @date_evenement,
            @id_responsable,
            @cree_par,
            @cree_par
          )
        `);
    }

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  const data = await getDossierLab(codeSafe);
  if (!data?.lab) {
    throw new Error('Dossier créé mais lecture impossible');
  }
  return data;
}

async function assertDossierExists(transaction, codeClient) {
  const result = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1 id
      FROM lab_dossier
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);
  const dossierId = result.recordset?.[0]?.id;
  if (dossierId == null) {
    throw new LabDossierError('Dossier LAB introuvable', 404);
  }
  return dossierId;
}

async function writeLabAuditLog(transaction, {
  userId,
  typeAction,
  entite,
  idEntite,
  codeClient,
  detail,
}) {
  await new sql.Request(transaction)
    .input('id_utilisateur', sql.NChar(20), cleanText(userId))
    .input('type_action', sql.NChar(50), typeAction)
    .input('entite', sql.NChar(50), entite)
    .input('id_entite', sql.NVarChar(50), idEntite != null ? String(idEntite) : null)
    .input('code_client', sql.NVarChar(10), codeClient)
    .input('detail', sql.NVarChar(sql.MAX), detail)
    .query(`
      INSERT INTO lab_audit_log (
        id_utilisateur,
        type_action,
        entite,
        id_entite,
        code_client,
        detail
      )
      VALUES (
        @id_utilisateur,
        @type_action,
        @entite,
        @id_entite,
        @code_client,
        @detail
      )
    `);
}

function yesNoToDb(value) {
  return yesNoUnknown(value) === 'Oui' ? 'O' : 'N';
}

function normalizeComplexiteForStorage(value) {
  const normalized = normalizeComplexite(value);
  if (normalized === 'Simple') return 'Simple';
  if (normalized === 'Moyenne') return 'Moyenne';
  if (normalized === 'Complexe') return 'Complexe';
  return 'Inconnue';
}

function statutPieceForStorage(statut) {
  const clean = cleanText(statut);
  if (!clean) return 'Attendue';
  const normalized = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized.includes('recu') || normalized.includes('recue')) return 'Recue';
  if (normalized.includes('perime')) return 'Perimee';
  if (normalized.includes('non') && normalized.includes('requ')) return 'Non_requise';
  return 'Attendue';
}

function buildPieceLibelle(titulaire, commentaire) {
  const holder = cleanText(titulaire) || 'Client';
  const comment = cleanText(commentaire);
  return comment ? `[Titulaire: ${holder}] ${comment}` : `[Titulaire: ${holder}]`;
}

const PIECE_TITULAIRES = new Set(['Client', 'BE', 'Dirigeant']);

function normalizePieceTitulaire(value) {
  const t = cleanText(value);
  if (PIECE_TITULAIRES.has(t)) return t;
  const normalized = t
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized === 'be') return 'BE';
  if (normalized === 'dirigeant') return 'Dirigeant';
  return 'Client';
}

/** Inverse `buildPieceLibelle` pour le préremplissage wizard / GET dossier. */
function parsePieceLibelle(libelle) {
  const raw = cleanText(libelle);
  if (!raw) {
    return { titulaire: 'Client', commentaire: null };
  }
  const match = /^\[Titulaire:\s*(.+?)\](?:\s+([\s\S]*))?$/.exec(raw);
  if (match) {
    return {
      titulaire: normalizePieceTitulaire(match[1]),
      commentaire: cleanText(match[2]) || null,
    };
  }
  return { titulaire: 'Client', commentaire: raw };
}

const WIZARD_SUPPLEMENT_MARKER = '__WIZARD_JSON__';

function buildOriginePatrimoineForStorage(notesParts, wizardSupplement) {
  const supplement = wizardSupplement && typeof wizardSupplement === 'object'
    ? wizardSupplement
    : null;
  if (!supplement) {
    return notesParts.length ? notesParts.join(' | ') : null;
  }
  const payload = {
    wizard_supplement: supplement,
    legacy_text: notesParts.length ? notesParts.join(' | ') : null,
  };
  return `${WIZARD_SUPPLEMENT_MARKER}${JSON.stringify(payload)}`;
}

function parseOriginePatrimoine(raw) {
  const clean = cleanText(raw);
  if (!clean) {
    return { wizard_supplement: null, legacy_text: null };
  }
  if (clean.startsWith(WIZARD_SUPPLEMENT_MARKER)) {
    try {
      const parsed = JSON.parse(clean.slice(WIZARD_SUPPLEMENT_MARKER.length));
      return {
        wizard_supplement: parsed?.wizard_supplement ?? null,
        legacy_text: parsed?.legacy_text ?? null,
      };
    } catch {
      return { wizard_supplement: null, legacy_text: clean };
    }
  }
  return { wizard_supplement: null, legacy_text: clean };
}

function buildKycAuditDetail(kycInput = {}, options = {}) {
  const detail = { source: 'wizard' };
  const kycKeys = Object.keys(kycInput).filter((key) => {
    const value = kycInput[key];
    return value != null && value !== '';
  });
  if (kycKeys.length) {
    detail.kyc_champs = kycKeys;
  }

  const supplement = options.wizard_supplement && typeof options.wizard_supplement === 'object'
    ? options.wizard_supplement
    : null;
  if (!supplement) {
    return JSON.stringify(detail);
  }

  const supplementKeys = Object.keys(supplement).filter((key) => {
    const value = supplement[key];
    return value != null && value !== '';
  });
  if (supplementKeys.length) {
    detail.wizard_supplement_champs = supplementKeys;
  }

  const commentaireRevision = cleanText(supplement.commentaire_revision);
  if (commentaireRevision) {
    detail.commentaire_revision = commentaireRevision;
  }

  return JSON.stringify(detail);
}

function normalizeSoumisIs(value) {
  const clean = cleanText(value);
  if (!clean) return null;
  const upper = clean.toUpperCase();
  if (upper === 'O' || upper === 'OUI' || upper === 'Y' || upper === 'YES') return 'O';
  if (upper === 'N' || upper === 'NON' || upper === 'NO') return 'N';
  return clean.length === 1 ? clean : null;
}

function mapKycInputToDb(kycInput = {}, options = {}) {
  const kyc = kycInput && typeof kycInput === 'object' ? kycInput : {};
  const secteurs = Array.isArray(kyc.secteurs)
    ? kyc.secteurs
    : splitTextList(kyc.secteurs_text);
  const paysRisque = Array.isArray(kyc.pays_a_risque)
    ? kyc.pays_a_risque
    : splitTextList(kyc.pays_a_risque_text);

  const notesParts = [
    cleanText(kyc.notes),
    cleanText(kyc.justification_complexite)
      ? `Complexite: ${cleanText(kyc.justification_complexite)}`
      : null,
  ].filter(Boolean);

  let origineFonds = null;
  if (kyc.origine_fonds_statut === 'Renseignee') {
    origineFonds = notesParts[0] || 'Renseignee';
  }

  const opsIntl = options.operations_internationales === true
    || kyc.operations_internationales === true;

  return {
    secteur_activite: secteurs[0] || cleanText(options.secteur_activite) || null,
    zone_geographique_principale: cleanText(kyc.pays_implantation)
      || cleanText(options.zone_geographique_activite)
      || null,
    volume_affaires_estime: cleanText(kyc.volume_affaires_estime)
      || cleanText(options.volume_affaires_fourchette)
      || null,
    complexite_structure: normalizeComplexiteForStorage(kyc.complexite_structure),
    pays_risque: paysRisque.length ? paysRisque.join('; ') : null,
    operations_internationales: opsIntl ? 'O' : 'N',
    origine_fonds: origineFonds,
    origine_patrimoine: buildOriginePatrimoineForStorage(notesParts, options.wizard_supplement),
    est_pep: yesNoToDb(kyc.pep_statut),
    detail_pep: cleanText(kyc.pep_details),
    lien_pep: yesNoToDb(kyc.lien_pep) === 'O' ? 'O' : 'N',
    detail_lien_pep: cleanText(kyc.detail_lien_pep),
  };
}

function normalizeModulation(value) {
  const clean = cleanText(value);
  if (!clean) return 'Conforme';
  const normalized = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized.includes('hausse') || normalized === '1') return 'Hausse';
  if (normalized.includes('baisse') || normalized === '-1') return 'Baisse';
  return 'Conforme';
}

function niveauRankForArpec(value) {
  const normalized = cleanText(value)
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized?.includes('eleve')) return 2;
  if (normalized?.includes('moy')) return 1;
  return 0;
}

function niveauArpecFromRank(rank) {
  if (rank >= 2) return 'Élevé';
  if (rank === 1) return 'Moyen';
  return 'Faible';
}

function periodiciteFromNiveau(niveau) {
  const rank = niveauRankForArpec(niveau);
  if (rank >= 2) return 3;
  if (rank === 1) return 6;
  return 12;
}

/**
 * Met à jour un dossier LAB existant (champs administratifs du wizard, étape 1).
 */
export async function updateDossierLab(codeClient, payload, userId = null) {
  const code = codeClient != null ? String(codeClient).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }
  const codeSafe = code;

  const labInput = payload?.lab && typeof payload.lab === 'object' ? payload.lab : {};
  const modifiePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await assertClientExists(transaction, codeSafe);
    const dossierId = await assertDossierExists(transaction, codeSafe);
    const revueEnCours = await getRevueEnCours(transaction, codeSafe);

    const idResponsableLab = labInput.id_responsable_lab != null
      ? cleanText(labInput.id_responsable_lab)
      : undefined;
    if (idResponsableLab) {
      await assertCollaborateurExists(transaction, idResponsableLab, 'collaborateur');
    }

    const sets = ['date_modification = SYSUTCDATETIME()', 'modifie_par = @modifie_par'];
    const request = new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('modifie_par', sql.NChar(20), modifiePar);

    if (labInput.statut_dossier != null) {
      request.input('statut_dossier', sql.NChar(20), cleanText(labInput.statut_dossier) || 'Actif');
      sets.push('statut_dossier = @statut_dossier');
    }
    if (labInput.statut_kyc != null) {
      request.input('statut_kyc', sql.NChar(20), cleanText(labInput.statut_kyc) || 'Incomplet');
      sets.push('statut_kyc = @statut_kyc');
    }
    if (idResponsableLab !== undefined) {
      request.input('id_responsable_lab', sql.NChar(20), idResponsableLab);
      sets.push('id_responsable_lab = @id_responsable_lab');
    }
    if (labInput.date_entree_relation != null && String(labInput.date_entree_relation).trim() !== '') {
      const dateEntree = parseIsoDate(labInput.date_entree_relation);
      if (dateEntree === undefined) {
        throw new LabDossierError('date_entree_relation invalide', 400);
      }
      request.input('date_entree_relation', sql.Date, dateEntree);
      sets.push('date_entree_relation = @date_entree_relation');
    }
    if (!revueEnCours && labInput.date_derniere_revue != null && String(labInput.date_derniere_revue).trim() !== '') {
      const dateDerniere = parseIsoDate(labInput.date_derniere_revue);
      if (dateDerniere === undefined) {
        throw new LabDossierError('date_derniere_revue invalide', 400);
      }
      request.input('date_derniere_revue', sql.Date, dateDerniere);
      sets.push('date_derniere_revue = @date_derniere_revue');
    }
    if (!revueEnCours && labInput.date_prochaine_revue != null && String(labInput.date_prochaine_revue).trim() !== '') {
      const dateProchaine = parseIsoDate(labInput.date_prochaine_revue);
      if (dateProchaine === undefined) {
        throw new LabDossierError('date_prochaine_revue invalide', 400);
      }
      request.input('date_prochaine_revue', sql.Date, dateProchaine);
      sets.push('date_prochaine_revue = @date_prochaine_revue');
    }
    if (labInput.periodicite_revue_mois != null) {
      const periodicite = toNumberOrNull(labInput.periodicite_revue_mois);
      if (!Number.isInteger(periodicite) || periodicite < 1) {
        throw new LabDossierError('periodicite_revue_mois invalide', 400);
      }
      request.input('periodicite_revue_mois', sql.Int, periodicite);
      sets.push('periodicite_revue_mois = @periodicite_revue_mois');
    }

    await request.query(`
      UPDATE lab_dossier
      SET ${sets.join(', ')}
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);

    await writeLabAuditLog(transaction, {
      userId: modifiePar,
      typeAction: 'MODIF_DOSSIER',
      entite: 'lab_dossier',
      idEntite: dossierId,
      codeClient: codeSafe,
      detail: JSON.stringify({ source: 'wizard', champs: Object.keys(labInput) }),
    });

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  const data = await getDossierLab(codeSafe);
  if (!data?.lab) {
    throw new Error('Dossier mis à jour mais lecture impossible');
  }
  return data;
}

/**
 * Met à jour les champs identité / coordonnées / fiscal de la table clients (wizard étape 1, D2.2-A).
 * Le code_client est immuable (passé en query, jamais dans le body).
 */
export async function updateClientLab(codeClient, payload, userId = null) {
  const code = codeClient != null ? String(codeClient).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }
  const codeSafe = code;

  const clientInput = payload?.client && typeof payload.client === 'object' ? payload.client : {};
  const modifiePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await assertClientExists(transaction, codeSafe);

    const sets = [];
    const request = new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe);

    const assignText = (field, sqlType, value, maxLen) => {
      if (value === undefined) return;
      const param = `c_${field}`;
      const clean = value == null || String(value).trim() === ''
        ? null
        : cleanText(value);
      const truncated = clean != null && maxLen != null && clean.length > maxLen
        ? clean.slice(0, maxLen)
        : clean;
      request.input(param, sqlType, truncated);
      sets.push(`${field} = @${param}`);
    };

    assignText('siret', sql.NChar(17), clientInput.siret, 17);
    assignText('raison_sociale', sql.NChar(100), clientInput.raison_sociale, 100);
    assignText('forme_societe', sql.NChar(30), clientInput.forme_societe, 30);
    assignText('rcs', sql.NChar(50), clientInput.rcs, 50);
    assignText('ape', sql.NChar(10), clientInput.ape, 10);
    assignText('activite', sql.NChar(100), clientInput.activite, 100);
    assignText('nature', sql.NChar(50), clientInput.nature, 50);
    assignText('tvaintracom', sql.NChar(20), clientInput.tvaintracom, 20);
    assignText('adr1_siege', sql.NChar(50), clientInput.adr1_siege, 50);
    assignText('adr2_siege', sql.NChar(50), clientInput.adr2_siege, 50);
    assignText('cpos_siege', sql.NChar(10), clientInput.cpos_siege, 10);
    assignText('ville_siege', sql.NChar(50), clientInput.ville_siege, 50);
    assignText('tel_fixe', sql.NChar(20), clientInput.tel_fixe, 20);
    assignText('tel_portable', sql.NChar(20), clientInput.tel_portable, 20);
    assignText('email', sql.NChar(100), clientInput.email, 100);
    assignText('regime_fiscal', sql.NChar(30), clientInput.regime_fiscal, 30);
    assignText('logiciel_compta', sql.NChar(50), clientInput.logiciel_compta, 50);

    if (clientInput.soumis_is !== undefined) {
      const soumis = normalizeSoumisIs(clientInput.soumis_is);
      request.input('c_soumis_is', sql.NChar(1), soumis);
      sets.push('soumis_is = @c_soumis_is');
    }

    if (clientInput.montant_capital_social !== undefined) {
      const capital = clientInput.montant_capital_social == null
        || String(clientInput.montant_capital_social).trim() === ''
        ? null
        : toNumberOrNull(clientInput.montant_capital_social);
      request.input('c_montant_capital_social', sql.Decimal(18, 2), capital);
      sets.push('montant_capital_social = @c_montant_capital_social');
    }

    if (clientInput.mois_cloture !== undefined) {
      const moisRaw = clientInput.mois_cloture;
      const mois = moisRaw == null || String(moisRaw).trim() === ''
        ? null
        : toNumberOrNull(moisRaw);
      if (mois != null && (!Number.isInteger(mois) || mois < 1 || mois > 12)) {
        throw new LabDossierError('mois_cloture invalide (1-12)', 400);
      }
      request.input('c_mois_cloture', sql.Int, mois);
      sets.push('mois_cloture = @c_mois_cloture');
    }

    if (clientInput.date_entree_cabinet !== undefined) {
      if (clientInput.date_entree_cabinet == null || String(clientInput.date_entree_cabinet).trim() === '') {
        request.input('c_date_entree_cabinet', sql.Date, null);
        sets.push('date_entree_cabinet = @c_date_entree_cabinet');
      } else {
        const dateEntree = parseIsoDate(clientInput.date_entree_cabinet);
        if (dateEntree === undefined) {
          throw new LabDossierError('date_entree_cabinet invalide', 400);
        }
        request.input('c_date_entree_cabinet', sql.Date, dateEntree);
        sets.push('date_entree_cabinet = @c_date_entree_cabinet');
      }
    }

    if (clientInput.expert_comptable !== undefined) {
      const expert = cleanText(clientInput.expert_comptable);
      if (expert) {
        await assertCollaborateurExists(transaction, expert, 'expert_comptable');
      }
      request.input('c_expert_comptable', sql.NChar(20), expert);
      sets.push('expert_comptable = @c_expert_comptable');
    }

    if (clientInput.chef_de_mission !== undefined) {
      const chef = cleanText(clientInput.chef_de_mission);
      if (chef) {
        await assertCollaborateurExists(transaction, chef, 'chef_de_mission');
      }
      request.input('c_chef_de_mission', sql.NChar(20), chef);
      sets.push('chef_de_mission = @c_chef_de_mission');
    }

    if (sets.length === 0) {
      throw new LabDossierError('Aucun champ client à mettre à jour', 400);
    }

    await request.query(`
      UPDATE clients
      SET ${sets.join(', ')}
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);

    await writeLabAuditLog(transaction, {
      userId: modifiePar,
      typeAction: 'MODIF_CLIENT',
      entite: 'clients',
      idEntite: codeSafe,
      codeClient: codeSafe,
      detail: JSON.stringify({ source: 'wizard', champs: Object.keys(clientInput) }),
    });

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  const data = await getDossierLab(codeSafe);
  if (!data?.client) {
    throw new Error('Client mis à jour mais lecture impossible');
  }
  return data.client;
}

/**
 * UPSERT KYC pour un dossier LAB existant.
 */
export async function upsertKycLab(codeClient, payload, userId = null) {
  const code = codeClient != null ? String(codeClient).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }
  const codeSafe = code;

  const kycInput = payload?.kyc && typeof payload.kyc === 'object' ? payload.kyc : {};
  const labInput = payload?.lab && typeof payload.lab === 'object' ? payload.lab : {};
  const options = payload?.options && typeof payload.options === 'object' ? payload.options : {};
  const mapped = mapKycInputToDb(kycInput, options);
  const modifiePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await assertClientExists(transaction, codeSafe);
    const dossierId = await assertDossierExists(transaction, codeSafe);

    const existing = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .query(`
        SELECT TOP 1 id
        FROM lab_kyc
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
      `);

    const kycId = existing.recordset?.[0]?.id;

    if (kycId == null) {
      const insertRes = await new sql.Request(transaction)
        .input('code_client', sql.NVarChar(10), codeSafe)
        .input('secteur_activite', sql.NChar(100), mapped.secteur_activite)
        .input('zone_geographique_principale', sql.NChar(60), mapped.zone_geographique_principale)
        .input('volume_affaires_estime', sql.NChar(30), mapped.volume_affaires_estime)
        .input('complexite_structure', sql.NChar(20), mapped.complexite_structure)
        .input('pays_risque', sql.NVarChar(500), mapped.pays_risque)
        .input('operations_internationales', sql.NChar(1), mapped.operations_internationales)
        .input('origine_fonds', sql.NVarChar(sql.MAX), mapped.origine_fonds)
        .input('origine_patrimoine', sql.NVarChar(sql.MAX), mapped.origine_patrimoine)
        .input('est_pep', sql.NChar(1), mapped.est_pep)
        .input('detail_pep', sql.NVarChar(500), mapped.detail_pep)
        .input('lien_pep', sql.NChar(1), mapped.lien_pep)
        .input('detail_lien_pep', sql.NVarChar(500), mapped.detail_lien_pep)
        .input('modifie_par', sql.NChar(20), modifiePar)
        .query(`
          INSERT INTO lab_kyc (
            code_client,
            secteur_activite,
            zone_geographique_principale,
            volume_affaires_estime,
            complexite_structure,
            pays_risque,
            operations_internationales,
            origine_fonds,
            origine_patrimoine,
            est_pep,
            detail_pep,
            lien_pep,
            detail_lien_pep,
            modifie_par
          )
          OUTPUT INSERTED.id
          VALUES (
            @code_client,
            @secteur_activite,
            @zone_geographique_principale,
            @volume_affaires_estime,
            @complexite_structure,
            @pays_risque,
            @operations_internationales,
            @origine_fonds,
            @origine_patrimoine,
            @est_pep,
            @detail_pep,
            @lien_pep,
            @detail_lien_pep,
            @modifie_par
          )
        `);
      const insertedId = insertRes.recordset?.[0]?.id;
      await writeLabAuditLog(transaction, {
        userId: modifiePar,
        typeAction: 'CREATION_KYC',
        entite: 'lab_kyc',
        idEntite: insertedId,
        codeClient: codeSafe,
        detail: buildKycAuditDetail(kycInput, options),
      });
    } else {
      await new sql.Request(transaction)
        .input('id', sql.Int, kycId)
        .input('secteur_activite', sql.NChar(100), mapped.secteur_activite)
        .input('zone_geographique_principale', sql.NChar(60), mapped.zone_geographique_principale)
        .input('volume_affaires_estime', sql.NChar(30), mapped.volume_affaires_estime)
        .input('complexite_structure', sql.NChar(20), mapped.complexite_structure)
        .input('pays_risque', sql.NVarChar(500), mapped.pays_risque)
        .input('operations_internationales', sql.NChar(1), mapped.operations_internationales)
        .input('origine_fonds', sql.NVarChar(sql.MAX), mapped.origine_fonds)
        .input('origine_patrimoine', sql.NVarChar(sql.MAX), mapped.origine_patrimoine)
        .input('est_pep', sql.NChar(1), mapped.est_pep)
        .input('detail_pep', sql.NVarChar(500), mapped.detail_pep)
        .input('lien_pep', sql.NChar(1), mapped.lien_pep)
        .input('detail_lien_pep', sql.NVarChar(500), mapped.detail_lien_pep)
        .input('modifie_par', sql.NChar(20), modifiePar)
        .query(`
          UPDATE lab_kyc
          SET
            secteur_activite = @secteur_activite,
            zone_geographique_principale = @zone_geographique_principale,
            volume_affaires_estime = @volume_affaires_estime,
            complexite_structure = @complexite_structure,
            pays_risque = @pays_risque,
            operations_internationales = @operations_internationales,
            origine_fonds = @origine_fonds,
            origine_patrimoine = @origine_patrimoine,
            est_pep = @est_pep,
            detail_pep = @detail_pep,
            lien_pep = @lien_pep,
            detail_lien_pep = @detail_lien_pep,
            date_modification = SYSUTCDATETIME(),
            modifie_par = @modifie_par
          WHERE id = @id
        `);
      await writeLabAuditLog(transaction, {
        userId: modifiePar,
        typeAction: 'MODIF_KYC',
        entite: 'lab_kyc',
        idEntite: kycId,
        codeClient: codeSafe,
        detail: buildKycAuditDetail(kycInput, options),
      });
    }

    if (labInput.statut_kyc != null) {
      await new sql.Request(transaction)
        .input('code_client', sql.NVarChar(10), codeSafe)
        .input('statut_kyc', sql.NChar(20), cleanText(labInput.statut_kyc) || 'Incomplet')
        .input('modifie_par', sql.NChar(20), modifiePar)
        .query(`
          UPDATE lab_dossier
          SET
            statut_kyc = @statut_kyc,
            date_modification = SYSUTCDATETIME(),
            modifie_par = @modifie_par
          WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
        `);
    }

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  const kyc = await getKycDossierLab(pool, codeSafe);
  const dossier = await getDossierLab(codeSafe);
  return {
    kyc,
    lab: dossier?.lab ? { statut_kyc: dossier.lab.statut_kyc } : null,
  };
}

/**
 * Ajoute un bénéficiaire effectif (+ événement CHANGEMENT_BE par défaut).
 */
export async function createBeneficiaireLab(payload, userId = null) {
  const code = payload?.code_client != null ? String(payload.code_client).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }
  const codeSafe = code;

  const nom = cleanText(payload.nom);
  if (!nom) {
    throw new LabDossierError('nom requis', 400);
  }
  assertBeneficiaireFieldLengths({
    nom,
    prenom: payload.prenom,
    nationalite: payload.nationalite,
    pays_residence: payload.pays_residence,
    commentaire: payload.commentaire,
  });

  const pourcentage = toNumberOrNull(payload.pourcentage);
  const modeControle = normalizeModeControle(payload.mode_controle);
  const detention = modeControle === 'Detention_capital' ? pourcentage : null;
  const controleTotal = pourcentage;
  const estPep = yesNoToDb(payload.pep_statut);
  const sanctions = yesNoUnknown(payload.sanctions_gel) === 'Oui';
  const creerEvenement = payload.options?.creer_evenement_changement_be !== false;
  const creePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await assertClientExists(transaction, codeSafe);
    await assertDossierExists(transaction, codeSafe);

    const insertBe = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('nom', sql.NChar(50), nom)
      .input('prenom', sql.NChar(30), cleanText(payload.prenom))
      .input('nationalite', sql.NChar(40), cleanText(payload.nationalite))
      .input('pays_residence', sql.NChar(40), cleanText(payload.pays_residence))
      .input('pourcentage_detention', sql.Decimal(5, 2), detention)
      .input('pourcentage_controle_total', sql.Decimal(5, 2), controleTotal)
      .input('type_controle', sql.NChar(30), modeControle)
      .input('est_pep', sql.NChar(1), estPep)
      .input('sous_sanctions', sql.NChar(1), sanctions ? 'O' : 'N')
      .input('gel_avoirs', sql.NChar(1), sanctions ? 'O' : 'N')
      .input('detail_statut', sql.NVarChar(500), cleanText(payload.commentaire))
      .input('date_debut', sql.Date, todayUtcDate())
      .input('cree_par', sql.NChar(20), creePar)
      .input('modifie_par', sql.NChar(20), creePar)
      .query(`
        INSERT INTO lab_beneficiaires_effectifs (
          code_client,
          nom,
          prenom,
          nationalite,
          pays_residence,
          pourcentage_detention,
          pourcentage_controle_total,
          type_controle,
          est_pep,
          sous_sanctions,
          gel_avoirs,
          detail_statut,
          actif,
          date_debut,
          version,
          cree_par,
          modifie_par
        )
        OUTPUT INSERTED.id
        VALUES (
          @code_client,
          @nom,
          @prenom,
          @nationalite,
          @pays_residence,
          @pourcentage_detention,
          @pourcentage_controle_total,
          @type_controle,
          @est_pep,
          @sous_sanctions,
          @gel_avoirs,
          @detail_statut,
          N'O',
          @date_debut,
          1,
          @cree_par,
          @modifie_par
        )
      `);

    const beId = insertBe.recordset?.[0]?.id;
    if (beId == null) {
      throw new Error('INSERT lab_beneficiaires_effectifs sans id retourné');
    }

    let evenement = null;
    if (creerEvenement) {
      const eventRes = await new sql.Request(transaction)
        .input('code_client', sql.NVarChar(10), codeSafe)
        .input('type_evenement', sql.NChar(50), 'CHANGEMENT_BE')
        .input('libelle', sql.NChar(200), 'Nouveau bénéficiaire effectif')
        .input('criticite', sql.NChar(10), 'Moyenne')
        .input('statut', sql.NChar(20), 'Ouvert')
        .input('date_evenement', sql.Date, todayUtcDate())
        .input('id_responsable', sql.NChar(20), creePar)
        .input('cree_par', sql.NChar(20), creePar)
        .query(`
          INSERT INTO lab_evenements (
            code_client,
            type_evenement,
            libelle,
            criticite,
            statut,
            date_evenement,
            id_responsable,
            cree_par,
            modifie_par
          )
          OUTPUT INSERTED.id
          VALUES (
            @code_client,
            @type_evenement,
            @libelle,
            @criticite,
            @statut,
            @date_evenement,
            @id_responsable,
            @cree_par,
            @cree_par
          )
        `);
      const eventId = eventRes.recordset?.[0]?.id;
      evenement = eventId != null ? { id: eventId, type: 'CHANGEMENT_BE' } : null;
    }

    await writeLabAuditLog(transaction, {
      userId: creePar,
      typeAction: 'CREATION_BE',
      entite: 'lab_beneficiaires_effectifs',
      idEntite: beId,
      codeClient: codeSafe,
      detail: JSON.stringify({ nom, source: 'wizard' }),
    });

    await transaction.commit();

    const beneficiaires = await getBeneficiairesDossierLab(pool, codeSafe);
    const beneficiaire = beneficiaires.find((b) => b.id === String(beId)) ?? {
      id: String(beId),
      nom,
      prenom: cleanText(payload.prenom),
      type: 'Personne_physique',
      nationalite: cleanText(payload.nationalite),
      pays_residence: cleanText(payload.pays_residence),
      pourcentage: controleTotal,
      mode_controle: modeControle,
      pep_statut: yesNoUnknown(estPep === 'O' ? 'Oui' : 'Non'),
      sanctions_gel: sanctions ? 'Oui' : 'Non',
      commentaire: cleanText(payload.commentaire),
    };

    return { beneficiaire, evenement };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

function parseEntityId(value, label = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new LabDossierError(`${label} invalide`, 400);
  }
  return id;
}

async function insertChangementBeEvent(transaction, codeSafe, userId, libelle) {
  const creePar = cleanText(userId);
  const eventRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeSafe)
    .input('type_evenement', sql.NChar(50), 'CHANGEMENT_BE')
    .input('libelle', sql.NChar(200), cleanText(libelle) || 'Modification bénéficiaire effectif')
    .input('criticite', sql.NChar(10), 'Moyenne')
    .input('statut', sql.NChar(20), 'Ouvert')
    .input('date_evenement', sql.Date, todayUtcDate())
    .input('id_responsable', sql.NChar(20), creePar)
    .input('cree_par', sql.NChar(20), creePar)
    .query(`
      INSERT INTO lab_evenements (
        code_client,
        type_evenement,
        libelle,
        criticite,
        statut,
        date_evenement,
        id_responsable,
        cree_par,
        modifie_par
      )
      OUTPUT INSERTED.id
      VALUES (
        @code_client,
        @type_evenement,
        @libelle,
        @criticite,
        @statut,
        @date_evenement,
        @id_responsable,
        @cree_par,
        @cree_par
      )
    `);
  const eventId = eventRes.recordset?.[0]?.id;
  return eventId != null ? { id: eventId, type: 'CHANGEMENT_BE' } : null;
}

/**
 * Résout le code_client d'un BE (contrôle RBAC avant PUT/DELETE).
 */
export async function resolveBeneficiaireCodeClient(beId) {
  const id = parseEntityId(beId);
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query(`
      SELECT TOP 1 RTRIM(LTRIM(code_client)) AS code_client
      FROM lab_beneficiaires_effectifs
      WHERE id = @id AND RTRIM(LTRIM(actif)) = N'O'
    `);
  const code = cleanText(result.recordset?.[0]?.code_client);
  if (!code) {
    throw new LabDossierError('Bénéficiaire effectif introuvable', 404);
  }
  return code;
}

/**
 * Met à jour un bénéficiaire effectif existant (+ événement CHANGEMENT_BE par défaut).
 */
export async function updateBeneficiaireLab(beId, payload, userId = null) {
  const id = parseEntityId(beId);
  const nom = cleanText(payload?.nom);
  if (!nom) {
    throw new LabDossierError('nom requis', 400);
  }
  assertBeneficiaireFieldLengths({
    nom,
    prenom: payload?.prenom,
    nationalite: payload?.nationalite,
    pays_residence: payload?.pays_residence,
    commentaire: payload?.commentaire,
  });

  const pourcentage = toNumberOrNull(payload?.pourcentage);
  const modeControle = normalizeModeControle(payload?.mode_controle);
  const detention = modeControle === 'Detention_capital' ? pourcentage : null;
  const controleTotal = pourcentage;
  const estPep = yesNoToDb(payload?.pep_statut);
  const sanctions = yesNoUnknown(payload?.sanctions_gel) === 'Oui';
  const creerEvenement = payload?.options?.creer_evenement_changement_be !== false;
  const modifiePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const existing = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`
        SELECT TOP 1 id, RTRIM(LTRIM(code_client)) AS code_client, version
        FROM lab_beneficiaires_effectifs
        WHERE id = @id AND RTRIM(LTRIM(actif)) = N'O'
      `);
    const row = existing.recordset?.[0];
    if (!row) {
      throw new LabDossierError('Bénéficiaire effectif introuvable', 404);
    }
    const codeSafe = cleanText(row.code_client);
    await assertDossierExists(transaction, codeSafe);

    const nextVersion = (row.version ?? 1) + 1;

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('nom', sql.NChar(50), nom)
      .input('prenom', sql.NChar(30), cleanText(payload?.prenom))
      .input('nationalite', sql.NChar(40), cleanText(payload?.nationalite))
      .input('pays_residence', sql.NChar(40), cleanText(payload?.pays_residence))
      .input('pourcentage_detention', sql.Decimal(5, 2), detention)
      .input('pourcentage_controle_total', sql.Decimal(5, 2), controleTotal)
      .input('type_controle', sql.NChar(30), modeControle)
      .input('est_pep', sql.NChar(1), estPep)
      .input('sous_sanctions', sql.NChar(1), sanctions ? 'O' : 'N')
      .input('gel_avoirs', sql.NChar(1), sanctions ? 'O' : 'N')
      .input('detail_statut', sql.NVarChar(500), cleanText(payload?.commentaire))
      .input('version', sql.Int, nextVersion)
      .input('modifie_par', sql.NChar(20), modifiePar)
      .query(`
        UPDATE lab_beneficiaires_effectifs
        SET
          nom = @nom,
          prenom = @prenom,
          nationalite = @nationalite,
          pays_residence = @pays_residence,
          pourcentage_detention = @pourcentage_detention,
          pourcentage_controle_total = @pourcentage_controle_total,
          type_controle = @type_controle,
          est_pep = @est_pep,
          sous_sanctions = @sous_sanctions,
          gel_avoirs = @gel_avoirs,
          detail_statut = @detail_statut,
          version = @version,
          date_modification = SYSUTCDATETIME(),
          modifie_par = @modifie_par
        WHERE id = @id
      `);

    let evenement = null;
    if (creerEvenement) {
      evenement = await insertChangementBeEvent(
        transaction,
        codeSafe,
        modifiePar,
        'Modification bénéficiaire effectif',
      );
    }

    await writeLabAuditLog(transaction, {
      userId: modifiePar,
      typeAction: 'MODIF_BE',
      entite: 'lab_beneficiaires_effectifs',
      idEntite: id,
      codeClient: codeSafe,
      detail: JSON.stringify({ nom, source: 'wizard', version: nextVersion }),
    });

    await transaction.commit();

    const beneficiaires = await getBeneficiairesDossierLab(pool, codeSafe);
    const beneficiaire = beneficiaires.find((b) => b.id === String(id)) ?? {
      id: String(id),
      nom,
      prenom: cleanText(payload?.prenom),
      type: 'Personne_physique',
      nationalite: cleanText(payload?.nationalite),
      pays_residence: cleanText(payload?.pays_residence),
      pourcentage: controleTotal,
      mode_controle: modeControle,
      pep_statut: yesNoUnknown(estPep === 'O' ? 'Oui' : 'Non'),
      sanctions_gel: sanctions ? 'Oui' : 'Non',
      commentaire: cleanText(payload?.commentaire),
    };

    return { beneficiaire, evenement };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/**
 * Désactive un bénéficiaire effectif (actif = N, date_fin = aujourd'hui).
 */
export async function deleteBeneficiaireLab(beId, userId = null) {
  const id = parseEntityId(beId);
  const modifiePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const existing = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`
        SELECT TOP 1 id, RTRIM(LTRIM(code_client)) AS code_client, nom, version
        FROM lab_beneficiaires_effectifs
        WHERE id = @id AND RTRIM(LTRIM(actif)) = N'O'
      `);
    const row = existing.recordset?.[0];
    if (!row) {
      throw new LabDossierError('Bénéficiaire effectif introuvable', 404);
    }
    const codeSafe = cleanText(row.code_client);
    const nom = cleanText(row.nom);
    const nextVersion = (row.version ?? 1) + 1;

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('version', sql.Int, nextVersion)
      .input('modifie_par', sql.NChar(20), modifiePar)
      .input('date_fin', sql.Date, todayUtcDate())
      .query(`
        UPDATE lab_beneficiaires_effectifs
        SET
          actif = N'N',
          date_fin = @date_fin,
          version = @version,
          date_modification = SYSUTCDATETIME(),
          modifie_par = @modifie_par
        WHERE id = @id
      `);

    await insertChangementBeEvent(
      transaction,
      codeSafe,
      modifiePar,
      'Suppression bénéficiaire effectif',
    );

    await writeLabAuditLog(transaction, {
      userId: modifiePar,
      typeAction: 'SUPPRESSION_BE',
      entite: 'lab_beneficiaires_effectifs',
      idEntite: id,
      codeClient: codeSafe,
      detail: JSON.stringify({ nom, source: 'wizard' }),
    });

    await transaction.commit();
    return { id: String(id), code_client: codeSafe };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

const PIECE_KYC_MAX_BYTES = 20 * 1024 * 1024;
const PIECE_KYC_ALLOWED_EXT = new Set([
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.doc', '.docx', '.xls', '.xlsx', '.odt', '.ods',
]);

const BE_FIELD_MAX = {
  nom: 50,
  prenom: 30,
  nationalite: 40,
  pays_residence: 40,
  commentaire: 500,
};

function sanitizePieceFilename(name) {
  const base = path.basename(String(name ?? '').trim() || 'piece');
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}

/** Valide les longueurs BE contre le schéma SQL (évite des 500 SQL Server). */
function assertBeneficiaireFieldLengths(fields) {
  for (const [key, max] of Object.entries(BE_FIELD_MAX)) {
    const value = cleanText(fields?.[key]);
    if (value && value.length > max) {
      throw new LabDossierError(`${key} trop long (max ${max} caractères)`, 400);
    }
  }
}

/**
 * Si un filepath pointe vers le stockage clients, il doit être sous
 * CLIENT_FILES_ROOT/{code}/LAB/KYC/. Les références textuelles restent autorisées.
 */
function assertPieceFilepathInClientScope(codeClient, filepath) {
  const fp = cleanText(filepath);
  if (!fp) return null;

  const clientRoot = path.resolve(PATHS.clientFilesRoot);
  const clientPrefix = clientRoot.endsWith(path.sep) ? clientRoot : `${clientRoot}${path.sep}`;
  const resolved = path.resolve(fp);
  const underClientRoot = resolved === clientRoot || resolved.startsWith(clientPrefix);

  if (!underClientRoot) {
    if (path.isAbsolute(fp)) {
      throw new LabDossierError('filepath hors périmètre du dossier client', 400);
    }
    return fp;
  }

  const expectedRoot = path.resolve(
    PATHS.clientFilesRoot,
    String(codeClient).trim().toUpperCase(),
    'LAB',
    'KYC',
  );
  const prefix = expectedRoot.endsWith(path.sep) ? expectedRoot : `${expectedRoot}${path.sep}`;
  if (resolved !== expectedRoot && !resolved.startsWith(prefix)) {
    throw new LabDossierError('filepath hors périmètre du dossier client', 400);
  }
  return resolved;
}

/**
 * Enregistre le binaire d'une pièce KYC sous CLIENT_FILES_ROOT/{code_client}/LAB/KYC/.
 */
export async function savePieceKycFileLab(codeClient, file) {
  const code = codeClient != null ? String(codeClient).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }
  if (!file?.buffer?.length) {
    throw new LabDossierError('Fichier requis', 400);
  }
  if (file.size > PIECE_KYC_MAX_BYTES) {
    throw new LabDossierError('Fichier trop volumineux (max 20 Mo)', 400);
  }

  const originalName = sanitizePieceFilename(file.originalname);
  const ext = path.extname(originalName).toLowerCase();
  if (ext && !PIECE_KYC_ALLOWED_EXT.has(ext)) {
    throw new LabDossierError('Type de fichier non autorisé', 400);
  }

  const dir = path.join(PATHS.clientFilesRoot, code.toUpperCase(), 'LAB', 'KYC');
  await fs.mkdir(dir, { recursive: true });

  const storedName = `${Date.now()}_${originalName}`;
  const fullPath = path.join(dir, storedName);
  await fs.writeFile(fullPath, file.buffer);

  return {
    nom_fichier: originalName,
    filepath: fullPath,
  };
}

/**
 * Référence une pièce KYC (métadonnées ; le binaire est stocké via savePieceKycFileLab).
 */
export async function createPieceKycLab(payload, userId = null) {
  const code = payload?.code_client != null ? String(payload.code_client).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }
  const codeSafe = code;

  const typePiece = cleanText(payload.type_piece);
  if (!typePiece) {
    throw new LabDossierError('type_piece requis', 400);
  }

  const statutBdd = statutPieceForStorage(payload.statut);
  const libelle = buildPieceLibelle(payload.titulaire, payload.commentaire);
  const reference = cleanText(payload.reference);
  const nomFichier = cleanText(payload.nom_fichier) || reference;
  const filepath = assertPieceFilepathInClientScope(
    codeSafe,
    cleanText(payload.filepath) || reference,
  );
  const modifiePar = cleanText(userId);

  let dateDelivrance = null;
  if (payload.date_delivrance != null && String(payload.date_delivrance).trim() !== '') {
    dateDelivrance = parseIsoDate(payload.date_delivrance);
    if (dateDelivrance === undefined) {
      throw new LabDossierError('date_delivrance invalide', 400);
    }
  }
  let dateEcheance = null;
  if (payload.date_echeance != null && String(payload.date_echeance).trim() !== '') {
    dateEcheance = parseIsoDate(payload.date_echeance);
    if (dateEcheance === undefined) {
      throw new LabDossierError('date_echeance invalide', 400);
    }
  }

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await assertClientExists(transaction, codeSafe);
    await assertDossierExists(transaction, codeSafe);

    const insertPiece = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('type_piece', sql.NChar(50), typePiece)
      .input('libelle', sql.NChar(200), libelle)
      .input('statut', sql.NChar(20), statutBdd)
      .input('date_delivrance', sql.Date, dateDelivrance)
      .input('date_echeance', sql.Date, dateEcheance)
      .input('nom_fichier', sql.NVarChar(200), nomFichier)
      .input('filepath', sql.NVarChar(500), filepath)
      .input('date_reception', sql.DateTime2, statutBdd === 'Recue' ? new Date() : null)
      .input('recu_par', sql.NChar(20), statutBdd === 'Recue' ? modifiePar : null)
      .input('modifie_par', sql.NChar(20), modifiePar)
      .query(`
        INSERT INTO lab_pieces_kyc (
          code_client,
          type_piece,
          libelle,
          statut,
          date_delivrance,
          date_echeance,
          nom_fichier,
          filepath,
          date_reception,
          recu_par,
          modifie_par
        )
        OUTPUT INSERTED.id
        VALUES (
          @code_client,
          @type_piece,
          @libelle,
          @statut,
          @date_delivrance,
          @date_echeance,
          @nom_fichier,
          @filepath,
          @date_reception,
          @recu_par,
          @modifie_par
        )
      `);

    const pieceId = insertPiece.recordset?.[0]?.id;
    if (pieceId == null) {
      throw new Error('INSERT lab_pieces_kyc sans id retourné');
    }

    await writeLabAuditLog(transaction, {
      userId: modifiePar,
      typeAction: 'CREATION_PIECE',
      entite: 'lab_pieces_kyc',
      idEntite: pieceId,
      codeClient: codeSafe,
      detail: JSON.stringify({ type_piece: typePiece, source: 'wizard' }),
    });

    await transaction.commit();

    return {
      piece: {
        id: String(pieceId),
        type_piece: typePiece,
        titulaire: cleanText(payload.titulaire) || 'Client',
        statut: normalizeStatutPiece(statutBdd),
        date_delivrance: dateDelivrance,
        date_echeance: dateEcheance,
        reference: nomFichier || filepath,
        commentaire: cleanText(payload.commentaire),
      },
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/**
 * Résout le code_client d'une pièce KYC (contrôle RBAC avant PUT/DELETE).
 */
export async function resolvePieceCodeClient(pieceId) {
  const id = parseEntityId(pieceId);
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query(`
      SELECT TOP 1 RTRIM(LTRIM(code_client)) AS code_client
      FROM lab_pieces_kyc
      WHERE id = @id
    `);
  const code = cleanText(result.recordset?.[0]?.code_client);
  if (!code) {
    throw new LabDossierError('Pièce KYC introuvable', 404);
  }
  return code;
}

/**
 * Met à jour une pièce KYC existante (métadonnées).
 */
export async function updatePieceKycLab(pieceId, payload, userId = null) {
  const id = parseEntityId(pieceId);
  const typePiece = cleanText(payload?.type_piece);
  if (!typePiece) {
    throw new LabDossierError('type_piece requis', 400);
  }

  const statutBdd = statutPieceForStorage(payload?.statut);
  const libelle = buildPieceLibelle(payload?.titulaire, payload?.commentaire);
  const reference = cleanText(payload?.reference);
  const nomFichier = cleanText(payload?.nom_fichier) || reference;
  const modifiePar = cleanText(userId);

  let dateDelivrance = null;
  if (payload?.date_delivrance != null && String(payload.date_delivrance).trim() !== '') {
    dateDelivrance = parseIsoDate(payload.date_delivrance);
    if (dateDelivrance === undefined) {
      throw new LabDossierError('date_delivrance invalide', 400);
    }
  }
  let dateEcheance = null;
  if (payload?.date_echeance != null && String(payload.date_echeance).trim() !== '') {
    dateEcheance = parseIsoDate(payload.date_echeance);
    if (dateEcheance === undefined) {
      throw new LabDossierError('date_echeance invalide', 400);
    }
  }

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const existing = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`
        SELECT TOP 1 id, RTRIM(LTRIM(code_client)) AS code_client
        FROM lab_pieces_kyc
        WHERE id = @id
      `);
    const row = existing.recordset?.[0];
    if (!row) {
      throw new LabDossierError('Pièce KYC introuvable', 404);
    }
    const codeSafe = cleanText(row.code_client);
    await assertDossierExists(transaction, codeSafe);

    const filepath = assertPieceFilepathInClientScope(
      codeSafe,
      cleanText(payload?.filepath) || reference,
    );

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('type_piece', sql.NChar(50), typePiece)
      .input('libelle', sql.NChar(200), libelle)
      .input('statut', sql.NChar(20), statutBdd)
      .input('date_delivrance', sql.Date, dateDelivrance)
      .input('date_echeance', sql.Date, dateEcheance)
      .input('nom_fichier', sql.NVarChar(200), nomFichier)
      .input('filepath', sql.NVarChar(500), filepath)
      .input('date_reception', sql.DateTime2, statutBdd === 'Recue' ? new Date() : null)
      .input('recu_par', sql.NChar(20), statutBdd === 'Recue' ? modifiePar : null)
      .input('modifie_par', sql.NChar(20), modifiePar)
      .query(`
        UPDATE lab_pieces_kyc
        SET
          type_piece = @type_piece,
          libelle = @libelle,
          statut = @statut,
          date_delivrance = @date_delivrance,
          date_echeance = @date_echeance,
          nom_fichier = @nom_fichier,
          filepath = @filepath,
          date_reception = @date_reception,
          recu_par = @recu_par,
          date_modification = SYSUTCDATETIME(),
          modifie_par = @modifie_par
        WHERE id = @id
      `);

    await writeLabAuditLog(transaction, {
      userId: modifiePar,
      typeAction: 'MODIF_PIECE',
      entite: 'lab_pieces_kyc',
      idEntite: id,
      codeClient: codeSafe,
      detail: JSON.stringify({ type_piece: typePiece, source: 'wizard' }),
    });

    await transaction.commit();

    return {
      piece: {
        id: String(id),
        type_piece: typePiece,
        titulaire: cleanText(payload?.titulaire) || 'Client',
        statut: normalizeStatutPiece(statutBdd),
        date_delivrance: dateDelivrance,
        date_echeance: dateEcheance,
        reference: nomFichier || filepath,
        commentaire: cleanText(payload?.commentaire),
      },
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/**
 * Supprime une pièce KYC (hard delete).
 */
export async function deletePieceKycLab(pieceId, userId = null) {
  const id = parseEntityId(pieceId);
  const modifiePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const existing = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`
        SELECT TOP 1 id, RTRIM(LTRIM(code_client)) AS code_client, type_piece
        FROM lab_pieces_kyc
        WHERE id = @id
      `);
    const row = existing.recordset?.[0];
    if (!row) {
      throw new LabDossierError('Pièce KYC introuvable', 404);
    }
    const codeSafe = cleanText(row.code_client);
    const typePiece = cleanText(row.type_piece);

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`DELETE FROM lab_pieces_kyc WHERE id = @id`);

    await writeLabAuditLog(transaction, {
      userId: modifiePar,
      typeAction: 'SUPPRESSION_PIECE',
      entite: 'lab_pieces_kyc',
      idEntite: id,
      codeClient: codeSafe,
      detail: JSON.stringify({ type_piece: typePiece, source: 'wizard' }),
    });

    await transaction.commit();
    return { id: String(id), code_client: codeSafe };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function loadArpecQuestionnaire(pool) {
  const result = await pool.request().query(`
    SELECT
      q.id,
      q.id_axe,
      q.code_question,
      q.libelle,
      q.sous_axe,
      q.est_declencheur,
      q.niveau_risque_si_oui,
      q.ordre_affichage AS question_ordre_affichage,
      a.code AS axe_code,
      a.libelle AS axe_libelle,
      a.ordre_affichage AS axe_ordre_affichage
    FROM lab_arpec_questions q
    INNER JOIN lab_arpec_axes a ON a.id = q.id_axe
    WHERE RTRIM(LTRIM(q.actif)) = N'O'
      AND RTRIM(LTRIM(a.actif)) = N'O'
    ORDER BY a.ordre_affichage, q.ordre_affichage, q.id
  `);
  return result.recordset || [];
}

/**
 * Retourne le référentiel ARPEC actif (axes + questions) pour le frontend.
 */
export async function getArpecQuestionnaire() {
  const pool = await poolPromise;

  let rows;
  try {
    rows = await loadArpecQuestionnaire(pool);
  } catch (err) {
    if (err?.number === 208) {
      throw new LabDossierError('Module ARPEC non disponible en base (tables lab_arpec_*)', 503);
    }
    throw err;
  }

  if (!rows.length) {
    throw new LabDossierError('Référentiel ARPEC vide ou indisponible', 503);
  }

  const axesMap = new Map();
  for (const row of rows) {
    const axeCode = cleanText(row.axe_code) || 'D?';
    if (!axesMap.has(axeCode)) {
      axesMap.set(axeCode, {
        code: axeCode,
        libelle: cleanText(row.axe_libelle) || axeCode,
        ordre_affichage: row.axe_ordre_affichage ?? null,
        questions: [],
      });
    }

    axesMap.get(axeCode).questions.push({
      code: cleanText(row.code_question),
      libelle: cleanText(row.libelle) || '',
      sousAxe: cleanText(row.sous_axe) || undefined,
      estDeclencheur: yesNoUnknown(row.est_declencheur) === 'Oui',
      niveauSiOui: cleanText(row.niveau_risque_si_oui)?.includes('lev') ? 'Élevé' : 'Moyen',
      ordre_affichage: row.question_ordre_affichage ?? null,
    });
  }

  return {
    axes: Array.from(axesMap.values()).map((axe) => ({
      code: axe.code,
      libelle: axe.libelle,
      questions: axe.questions.map((question) => ({
        code: question.code,
        libelle: question.libelle,
        sousAxe: question.sousAxe,
        estDeclencheur: question.estDeclencheur,
        niveauSiOui: question.niveauSiOui,
      })),
    })),
  };
}

function computeAxeLevelFromQuestions(questions, reponsesByCode) {
  let niveauRank = 0;
  for (const q of questions) {
    const code = cleanText(q.code_question);
    if (!code || reponsesByCode.get(code) !== 'O') continue;
    const isDeclencheur = yesNoUnknown(q.est_declencheur) === 'Oui';
    if (isDeclencheur) {
      return 2;
    }
    const niveauSiOui = cleanText(q.niveau_risque_si_oui);
    const rank = niveauSiOui?.includes('lev') ? 2 : 1;
    niveauRank = Math.max(niveauRank, rank);
  }
  return niveauRank;
}

/**
 * Enregistre une évaluation ARPEC (étape 2 du wizard).
 */
export async function saveArpecEvaluation(payload, userId = null) {
  const code = payload?.code_client != null ? String(payload.code_client).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }
  const codeSafe = code;

  const modulation = normalizeModulation(payload.modulation);
  if (modulation !== 'Conforme' && !cleanText(payload.justification_modulation)) {
    throw new LabDossierError('justification_modulation requise si modulation ≠ Conforme', 400);
  }

  const reponsesInput = Array.isArray(payload.reponses) ? payload.reponses : [];
  const reponsesByCode = new Map();
  for (const item of reponsesInput) {
    const qCode = cleanText(item?.code_question);
    if (!qCode) continue;
    const rep = cleanText(item.reponse)?.toUpperCase() === 'O' ? 'O' : 'N';
    reponsesByCode.set(qCode, rep);
  }

  const evaluePar = cleanText(userId);
  const pool = await poolPromise;

  let questions;
  try {
    questions = await loadArpecQuestionnaire(pool);
  } catch (err) {
    if (err?.number === 208) {
      throw new LabDossierError('Module ARPEC non disponible en base (tables lab_arpec_*)', 503);
    }
    throw err;
  }
  if (!questions.length) {
    throw new LabDossierError('Référentiel ARPEC vide ou indisponible', 503);
  }

  const unanswered = questions.filter((q) => {
    const qCode = cleanText(q.code_question);
    return qCode && !reponsesByCode.has(qCode);
  });
  if (unanswered.length > 0) {
    throw new LabDossierError(
      `Questionnaire ARPEC incomplet : ${unanswered.length} question(s) sans réponse OUI/NON`,
      400,
    );
  }

  const axesMap = new Map();
  for (const q of questions) {
    const axeCode = cleanText(q.axe_code) || 'D?';
    if (!axesMap.has(axeCode)) {
      axesMap.set(axeCode, { axeCode, questions: [], idAxe: null });
    }
    axesMap.get(axeCode).questions.push(q);
  }

  let niveauCalculeRank = 0;
  const axeResults = [];
  for (const [axeCode, axeData] of axesMap.entries()) {
    const nbOui = axeData.questions.filter((q) => reponsesByCode.get(cleanText(q.code_question)) === 'O').length;
    const axeRank = computeAxeLevelFromQuestions(axeData.questions, reponsesByCode);
    niveauCalculeRank = Math.max(niveauCalculeRank, axeRank);
    axeResults.push({ axeCode, axeRank, nbOui, questions: axeData.questions });
  }

  const modulationDelta = modulation === 'Hausse' ? 1 : modulation === 'Baisse' ? -1 : 0;
  const niveauRetenuRank = Math.max(0, Math.min(2, niveauCalculeRank + modulationDelta));
  const niveauCalcule = niveauArpecFromRank(niveauCalculeRank);
  const niveauRetenu = niveauArpecFromRank(niveauRetenuRank);
  const vigilance = niveauRetenuRank >= 2 ? 'Renforcee' : 'Standard';
  const niveauDossier = normalizeNiveauRisqueForStorage(niveauRetenu);
  const periodicite = periodiciteFromNiveau(niveauRetenu);

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  let evalId = null;
  try {
    await assertClientExists(transaction, codeSafe);
    await assertDossierExists(transaction, codeSafe);

    const previous = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .query(`
        SELECT TOP 1 niveau_retenu
        FROM lab_arpec_evaluations
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(est_active)) = N'O'
        ORDER BY date_evaluation DESC, id DESC
      `);
    const previousNiveau = cleanText(previous.recordset?.[0]?.niveau_retenu);

    await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .query(`
        UPDATE lab_arpec_evaluations
        SET est_active = N'N'
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(est_active)) = N'O'
      `);

    const insertEval = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('niveau_calcule', sql.NChar(10), niveauCalcule)
      .input('niveau_retenu', sql.NChar(10), niveauRetenu)
      .input('modulation', sql.NChar(10), modulation)
      .input('justification_modulation', sql.NVarChar(500), cleanText(payload.justification_modulation))
      .input('vigilance', sql.NChar(10), vigilance)
      .input('commentaire', sql.NVarChar(sql.MAX), cleanText(payload.commentaire))
      .input('evalue_par', sql.NChar(20), evaluePar)
      .query(`
        INSERT INTO lab_arpec_evaluations (
          code_client,
          niveau_calcule,
          niveau_retenu,
          modulation,
          justification_modulation,
          vigilance,
          est_active,
          commentaire,
          evalue_par
        )
        OUTPUT INSERTED.id
        VALUES (
          @code_client,
          @niveau_calcule,
          @niveau_retenu,
          @modulation,
          @justification_modulation,
          @vigilance,
          N'O',
          @commentaire,
          @evalue_par
        )
      `);

    evalId = insertEval.recordset?.[0]?.id;
    if (evalId == null) {
      throw new Error('INSERT lab_arpec_evaluations sans id retourné');
    }

    for (const q of questions) {
      const qCode = cleanText(q.code_question);
      const reponse = reponsesByCode.get(qCode) || 'N';
      await new sql.Request(transaction)
        .input('id_evaluation', sql.Int, evalId)
        .input('id_question', sql.Int, q.id)
        .input('reponse', sql.NChar(1), reponse)
        .query(`
          INSERT INTO lab_arpec_reponses (id_evaluation, id_question, reponse)
          VALUES (@id_evaluation, @id_question, @reponse)
        `);
    }

    for (const axe of axeResults) {
      const idAxe = axe.questions[0]?.id_axe;
      if (!idAxe) continue;
      await new sql.Request(transaction)
        .input('id_evaluation', sql.Int, evalId)
        .input('id_axe', sql.Int, idAxe)
        .input('nb_oui', sql.Int, axe.nbOui)
        .input('niveau_axe', sql.NChar(10), niveauArpecFromRank(axe.axeRank))
        .query(`
          INSERT INTO lab_arpec_evaluation_axes (id_evaluation, id_axe, nb_oui, niveau_axe)
          VALUES (@id_evaluation, @id_axe, @nb_oui, @niveau_axe)
        `);
    }

    const revueEnCours = await getRevueEnCours(transaction, codeSafe);
    const evaluationDate = todayUtcDate();
    const dateProchaineRevue = addMonthsUtc(evaluationDate, periodicite);

    const dossierSets = [
      'niveau_risque = @niveau_risque',
      'vigilance = @vigilance',
      'periodicite_revue_mois = @periodicite_revue_mois',
      'date_modification = SYSUTCDATETIME()',
      'modifie_par = @modifie_par',
    ];
    const dossierRequest = new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('niveau_risque', sql.NChar(10), niveauDossier)
      .input('vigilance', sql.NChar(10), vigilance)
      .input('periodicite_revue_mois', sql.Int, periodicite)
      .input('modifie_par', sql.NChar(20), evaluePar);

    if (!revueEnCours) {
      dossierSets.splice(3, 0, 'date_derniere_revue = @date_derniere_revue', 'date_prochaine_revue = @date_prochaine_revue');
      dossierRequest
        .input('date_derniere_revue', sql.Date, evaluationDate)
        .input('date_prochaine_revue', sql.Date, dateProchaineRevue);
    }

    await dossierRequest.query(`
        UPDATE lab_dossier
        SET ${dossierSets.join(', ')}
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
      `);

    const previousRank = niveauRankForArpec(previousNiveau);
    if (niveauRetenuRank > previousRank) {
      await new sql.Request(transaction)
        .input('code_client', sql.NVarChar(10), codeSafe)
        .input('type_evenement', sql.NChar(50), 'CHANGEMENT_RISQUE')
        .input('libelle', sql.NChar(200), `Changement de niveau de risque (${previousNiveau || 'N/A'} → ${niveauRetenu})`)
        .input('criticite', sql.NChar(10), 'Elevee')
        .input('statut', sql.NChar(20), 'Ouvert')
        .input('date_evenement', sql.Date, todayUtcDate())
        .input('id_responsable', sql.NChar(20), evaluePar)
        .input('cree_par', sql.NChar(20), evaluePar)
        .query(`
          INSERT INTO lab_evenements (
            code_client,
            type_evenement,
            libelle,
            criticite,
            statut,
            date_evenement,
            id_responsable,
            cree_par,
            modifie_par
          )
          VALUES (
            @code_client,
            @type_evenement,
            @libelle,
            @criticite,
            @statut,
            @date_evenement,
            @id_responsable,
            @cree_par,
            @cree_par
          )
        `);
    }

    await writeLabAuditLog(transaction, {
      userId: evaluePar,
      typeAction: 'CHANGEMENT_RISQUE',
      entite: 'lab_arpec_evaluations',
      idEntite: evalId,
      codeClient: codeSafe,
      detail: JSON.stringify({
        niveau_calcule: niveauCalcule,
        niveau_retenu: niveauRetenu,
        modulation,
        vigilance,
        source: 'wizard',
      }),
    });

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    if (err?.number === 208) {
      throw new LabDossierError('Module ARPEC non disponible en base (tables lab_arpec_*)', 503);
    }
    throw err;
  }

  let planVigilance = null;
  let plan_vigilance_generation_ok = true;
  try {
    planVigilance = await genererPlanVigilanceLab(codeSafe, {
      id_evaluation: evalId,
      userId: evaluePar,
    });
  } catch (genErr) {
    plan_vigilance_generation_ok = false;
    console.error('saveArpecEvaluation: génération plan vigilance échouée (évaluation conservée):', genErr);
  }

  return {
    code_client: codeSafe,
    niveau_calcule: niveauCalcule,
    niveau_retenu: niveauRetenu,
    modulation,
    vigilance,
    axes: axeResults.map((a) => ({
      code: a.axeCode,
      nb_oui: a.nbOui,
      niveau: niveauArpecFromRank(a.axeRank),
    })),
    plan_vigilance: planVigilance,
    plan_vigilance_generation_ok,
  };
}

function displayNiveauArpec(value) {
  return niveauArpecFromRank(niveauRankForArpec(value));
}

/**
 * Retourne l'évaluation ARPEC active d'un client (réponses, axes, modulation).
 */
export async function getArpecEvaluation(codeClient) {
  const code = codeClient != null ? String(codeClient).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }

  const pool = await poolPromise;

  let evalRow;
  try {
    const evalResult = await pool
      .request()
      .input('code_client', sql.NVarChar(10), code)
      .query(`
        SELECT TOP 1
          e.id,
          RTRIM(LTRIM(e.code_client)) AS code_client,
          e.date_evaluation,
          e.niveau_calcule,
          e.niveau_retenu,
          e.modulation,
          e.justification_modulation,
          e.vigilance,
          e.commentaire
        FROM lab_arpec_evaluations e
        WHERE RTRIM(LTRIM(e.code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(e.est_active)) = N'O'
        ORDER BY e.date_evaluation DESC, e.id DESC
      `);
    evalRow = evalResult.recordset?.[0];
  } catch (err) {
    if (err?.number === 208) {
      throw new LabDossierError('Module ARPEC non disponible en base (tables lab_arpec_*)', 503);
    }
    throw err;
  }

  if (!evalRow) {
    throw new LabDossierError('Aucune évaluation ARPEC active pour ce client', 404);
  }

  const evalId = evalRow.id;

  const axesResult = await pool
    .request()
    .input('id_evaluation', sql.Int, evalId)
    .query(`
      SELECT
        RTRIM(LTRIM(a.code)) AS code,
        ea.nb_oui,
        ea.niveau_axe
      FROM lab_arpec_evaluation_axes ea
      INNER JOIN lab_arpec_axes a ON a.id = ea.id_axe
      WHERE ea.id_evaluation = @id_evaluation
      ORDER BY a.ordre_affichage, a.id
    `);

  const reponsesResult = await pool
    .request()
    .input('id_evaluation', sql.Int, evalId)
    .query(`
      SELECT
        RTRIM(LTRIM(q.code_question)) AS code_question,
        RTRIM(LTRIM(r.reponse)) AS reponse,
        r.commentaire
      FROM lab_arpec_reponses r
      INNER JOIN lab_arpec_questions q ON q.id = r.id_question
      WHERE r.id_evaluation = @id_evaluation
      ORDER BY q.id
    `);

  const modulation = normalizeModulation(evalRow.modulation);
  const vigilanceRaw = cleanText(evalRow.vigilance);

  return {
    code_client: cleanText(evalRow.code_client) || code,
    date_evaluation: evalRow.date_evaluation ?? null,
    niveau_calcule: displayNiveauArpec(evalRow.niveau_calcule),
    niveau_retenu: displayNiveauArpec(evalRow.niveau_retenu),
    modulation,
    justification_modulation: cleanText(evalRow.justification_modulation) || null,
    vigilance: vigilanceRaw === 'Renforcee' ? 'Renforcee' : 'Standard',
    commentaire: cleanText(evalRow.commentaire) || null,
    axes: (axesResult.recordset || []).map((row) => ({
      code: cleanText(row.code),
      nb_oui: row.nb_oui ?? 0,
      niveau: displayNiveauArpec(row.niveau_axe),
    })),
    reponses: (reponsesResult.recordset || []).map((row) => {
      const item = {
        code_question: cleanText(row.code_question),
        reponse: cleanText(row.reponse)?.toUpperCase() === 'O' ? 'O' : 'N',
      };
      const commentaire = cleanText(row.commentaire);
      if (commentaire) {
        item.commentaire = commentaire;
      }
      return item;
    }),
  };
}

async function getEvenementsDossierLab(pool, codeClient) {
  const query = `
    SELECT
      e.id,
      e.type_evenement,
      e.libelle,
      e.criticite,
      e.statut,
      e.date_evenement,
      e.date_echeance,
      e.conclusion,
      e.id_responsable,
      responsable.nom AS responsable_nom,
      responsable.prenom AS responsable_prenom
    FROM lab_evenements e
    LEFT JOIN collaborateurs responsable
      ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(e.id_responsable))
    WHERE RTRIM(LTRIM(e.code_client)) = RTRIM(LTRIM(@code_client))
    ORDER BY
      CASE WHEN RTRIM(LTRIM(e.statut)) = 'Cloture' THEN 1 ELSE 0 END,
      e.date_evenement DESC,
      e.id DESC
  `;

  const result = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(query);

  return (result.recordset || []).map((row) => {
    const type = cleanText(row.type_evenement) || 'AUTRE';
    return {
      id: String(row.id),
      type,
      date_creation: row.date_evenement ?? null,
      criticite: normalizeCriticite(row.criticite),
      statut: cleanText(row.statut) || 'Ouvert',
      responsable: formatCollaborateur(row.responsable_prenom, row.responsable_nom, row.id_responsable),
      echeance: row.date_echeance ?? null,
      resume: cleanText(row.libelle) || cleanText(row.conclusion) || type,
    };
  });
}

async function getDiligencesDossierLab(pool, codeClient) {
  const query = `
    SELECT
      d.id,
      d.id_evenement,
      d.intitule,
      d.type_diligence,
      d.id_responsable,
      d.date_echeance,
      d.statut,
      d.motif_abandon,
      d.commentaires,
      d.ref_piece_jointe,
      responsable.nom AS responsable_nom,
      responsable.prenom AS responsable_prenom
    FROM lab_diligences d
    LEFT JOIN collaborateurs responsable
      ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(d.id_responsable))
    WHERE RTRIM(LTRIM(d.code_client)) = RTRIM(LTRIM(@code_client))
    ORDER BY
      CASE WHEN RTRIM(LTRIM(d.statut)) IN ('Realisee', 'Abandonnee') THEN 1 ELSE 0 END,
      d.date_echeance ASC,
      d.id DESC
  `;

  const result = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(query);

  return (result.recordset || []).map((row) => ({
    id: String(row.id),
    evenement_id: row.id_evenement != null ? String(row.id_evenement) : null,
    intitule: cleanText(row.intitule) || 'Diligence sans intitulé',
    type_diligence: cleanText(row.type_diligence),
    responsable: formatCollaborateur(row.responsable_prenom, row.responsable_nom, row.id_responsable),
    statut: cleanText(row.statut) || 'A_faire',
    date_echeance: row.date_echeance ?? null,
    preuve: cleanText(row.ref_piece_jointe),
    commentaire: cleanText(row.commentaires) || cleanText(row.motif_abandon),
  }));
}

async function getRisqueHistoriqueDossierLab(pool, codeClient) {
  const query = `
    SELECT
      e.id,
      e.niveau_calcule,
      e.niveau_retenu,
      e.modulation,
      e.justification_modulation,
      e.est_active,
      e.date_evaluation,
      e.vigilance,
      e.commentaire,
      e.evalue_par,
      e.valide_par,
      evalueur.nom AS evalueur_nom,
      evalueur.prenom AS evalueur_prenom,
      validateur.nom AS validateur_nom,
      validateur.prenom AS validateur_prenom
    FROM lab_arpec_evaluations e
    LEFT JOIN collaborateurs evalueur
      ON RTRIM(LTRIM(evalueur.id_sellsy)) = RTRIM(LTRIM(e.evalue_par))
    LEFT JOIN collaborateurs validateur
      ON RTRIM(LTRIM(validateur.id_sellsy)) = RTRIM(LTRIM(e.valide_par))
    WHERE RTRIM(LTRIM(e.code_client)) = RTRIM(LTRIM(@code_client))
    ORDER BY e.date_evaluation DESC, e.id DESC
  `;

  try {
    const result = await pool
      .request()
      .input('code_client', sql.NVarChar(10), codeClient)
      .query(query);

    return (result.recordset || []).map((row) => {
      const modulation = cleanText(row.modulation) || 'Conforme';
      const niveauCalcule = normalizeNiveauRisque(row.niveau_calcule);
      const niveauRetenu = normalizeNiveauRisque(row.niveau_retenu);
      const isModulated = modulation !== 'Conforme' || niveauCalcule !== niveauRetenu;
      const isActive = yesNoUnknown(row.est_active) === 'Oui';
      const vigilance = cleanText(row.vigilance);
      const justificationParts = [
        cleanText(row.justification_modulation),
        cleanText(row.commentaire),
        vigilance === 'Renforcee' ? 'Vigilance renforcée' : null,
        isActive ? 'Évaluation active' : null,
      ].filter(Boolean);

      const utilisateurId = cleanText(row.valide_par) || cleanText(row.evalue_par);
      const utilisateurNom = cleanText(row.validateur_nom) || cleanText(row.evalueur_nom);
      const utilisateurPrenom = cleanText(row.validateur_prenom) || cleanText(row.evalueur_prenom);

      return {
        id: String(row.id),
        date: row.date_evaluation ?? null,
        niveau: niveauRetenu,
        origine: isModulated ? 'Override_manuel' : 'Calcul_auto',
        justification: justificationParts.length ? justificationParts.join(' | ') : null,
        utilisateur: formatCollaborateur(utilisateurPrenom, utilisateurNom, utilisateurId),
      };
    });
  } catch (err) {
    if (err?.number === 208) {
      console.warn('getRisqueHistoriqueDossierLab: table lab_arpec_evaluations absente, historique vide.');
      return [];
    }
    throw err;
  }
}

async function getAuditDossierLab(pool, codeClient) {
  const query = `
    SELECT TOP 50
      a.id,
      a.date_action,
      a.id_utilisateur,
      a.type_action,
      a.entite,
      a.id_entite,
      a.detail,
      utilisateur.nom AS utilisateur_nom,
      utilisateur.prenom AS utilisateur_prenom
    FROM lab_audit_log a
    LEFT JOIN collaborateurs utilisateur
      ON RTRIM(LTRIM(utilisateur.id_sellsy)) = RTRIM(LTRIM(a.id_utilisateur))
    WHERE RTRIM(LTRIM(a.code_client)) = RTRIM(LTRIM(@code_client))
    ORDER BY a.date_action DESC, a.id DESC
  `;

  const result = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(query);

  return (result.recordset || []).map((row) => {
    const entite = cleanText(row.entite) || 'lab';
    const idEntite = cleanText(row.id_entite);
    const detail = cleanText(row.detail);

    return {
      id: String(row.id),
      date: row.date_action ?? null,
      utilisateur: formatCollaborateur(row.utilisateur_prenom, row.utilisateur_nom, row.id_utilisateur),
      action: cleanText(row.type_action) || 'ACTION_LAB',
      entite: idEntite ? `${entite} #${idEntite}` : entite,
      details: detail || 'Action journalisée',
    };
  });
}

async function getRevuesDossierLab(pool, codeClient) {
  const query = `
    SELECT
      r.id,
      r.type_revue,
      r.date_revue,
      r.id_responsable,
      r.statut,
      r.conclusion_risque,
      r.commentaires_conclusion,
      r.niveau_risque_avant,
      r.niveau_risque_apres,
      responsable.nom AS responsable_nom,
      responsable.prenom AS responsable_prenom
    FROM lab_revues r
    LEFT JOIN collaborateurs responsable
      ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(r.id_responsable))
    WHERE RTRIM(LTRIM(r.code_client)) = RTRIM(LTRIM(@code_client))
      AND RTRIM(LTRIM(r.statut)) <> N'Annulee'
    ORDER BY r.date_revue DESC, r.id DESC
  `;

  const reponsesQuery = `
    SELECT
      rr.id_revue,
      rr.code_question,
      rr.libelle_question,
      rr.reponse,
      rr.commentaire
    FROM lab_revues_reponses rr
    INNER JOIN lab_revues r ON r.id = rr.id_revue
    WHERE RTRIM(LTRIM(r.code_client)) = RTRIM(LTRIM(@code_client))
      AND RTRIM(LTRIM(r.statut)) <> N'Annulee'
    ORDER BY rr.id_revue DESC, rr.id ASC
  `;

  const [result, reponsesRes] = await Promise.all([
    pool.request().input('code_client', sql.NVarChar(10), codeClient).query(query),
    pool.request().input('code_client', sql.NVarChar(10), codeClient).query(reponsesQuery),
  ]);

  const reponsesByRevue = new Map();
  for (const row of reponsesRes.recordset || []) {
    const revueId = row.id_revue;
    if (!reponsesByRevue.has(revueId)) {
      reponsesByRevue.set(revueId, []);
    }
    reponsesByRevue.get(revueId).push({
      code_question: cleanText(row.code_question),
      libelle_question: cleanText(row.libelle_question),
      reponse: cleanText(row.reponse),
      commentaire: cleanText(row.commentaire),
    });
  }

  return (result.recordset || []).map((row) => {
    const typeRevue = cleanText(row.type_revue);
    const conclusionParts = [
      cleanText(row.conclusion_risque),
      cleanText(row.commentaires_conclusion),
      cleanText(row.niveau_risque_avant) && cleanText(row.niveau_risque_apres)
        ? `Risque: ${cleanText(row.niveau_risque_avant)} -> ${cleanText(row.niveau_risque_apres)}`
        : null,
    ].filter(Boolean);

    return {
      id: typeRevue ? `${typeRevue}-${row.id}` : String(row.id),
      date: row.date_revue ?? null,
      responsable: formatCollaborateur(row.responsable_prenom, row.responsable_nom, row.id_responsable),
      statut: normalizeStatutRevue(row.statut),
      conclusion: conclusionParts.length ? conclusionParts.join(' | ') : null,
      prochain_rdv: null,
      reponses: reponsesByRevue.get(row.id) || [],
    };
  });
}

async function getKycDossierLab(pool, codeClient) {
  const query = `
    SELECT TOP 1
      secteur_activite,
      zone_geographique_principale,
      volume_affaires_estime,
      complexite_structure,
      pays_risque,
      operations_internationales,
      origine_fonds,
      origine_patrimoine,
      est_pep,
      detail_pep,
      lien_pep,
      detail_lien_pep
    FROM lab_kyc
    WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    ORDER BY date_modification DESC, id DESC
  `;

  const result = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(query);

  const row = result.recordset?.[0];
  if (!row) {
    return null;
  }

  const origineFonds = cleanText(row.origine_fonds);
  const originePatrimoineRaw = cleanText(row.origine_patrimoine);
  const { wizard_supplement: wizardSupplement, legacy_text: legacyPatrimoine } = parseOriginePatrimoine(
    originePatrimoineRaw,
  );
  const volumeAffaires = cleanText(row.volume_affaires_estime);
  const operationsInternationales = yesNoUnknown(row.operations_internationales);
  const secteur = cleanText(row.secteur_activite);
  const estPep = yesNoUnknown(row.est_pep);
  const lienPep = yesNoUnknown(row.lien_pep);
  const pepDetails = [
    cleanText(row.detail_pep),
    cleanText(row.detail_lien_pep) ? `Lien PEP: ${cleanText(row.detail_lien_pep)}` : null,
  ].filter(Boolean).join(' | ');
  const notes = [
    volumeAffaires ? `Volume d'affaires estime: ${volumeAffaires}` : null,
    operationsInternationales !== 'Inconnu'
      ? `Operations internationales: ${operationsInternationales}`
      : null,
    legacyPatrimoine ? `Origine patrimoine: ${legacyPatrimoine}` : null,
  ].filter(Boolean).join(' | ');

  const supplementCategorie = cleanText(wizardSupplement?.categorie_client);
  const categorieClient = supplementCategorie === 'Personne_physique'
    ? 'Personne_physique'
    : supplementCategorie === 'Personne_morale'
      ? 'Personne_morale'
      : 'Personne_morale';

  return {
    categorie_client: categorieClient,
    pays_residence_fiscale: cleanText(wizardSupplement?.pays_residence_fiscale) || null,
    pays_implantation: cleanText(row.zone_geographique_principale),
    pays_a_risque: splitTextList(row.pays_risque),
    secteur_sensible: false,
    secteurs: secteur ? [secteur] : [],
    pep_statut: estPep === 'Oui' || lienPep === 'Oui'
      ? 'Oui'
      : estPep === 'Inconnu' || lienPep === 'Inconnu'
        ? 'Inconnu'
        : 'Non',
    pep_details: pepDetails || null,
    origine_fonds_requise: true,
    origine_fonds_statut: origineFonds ? 'Renseignee' : 'A_renseigner',
    complexite_structure: normalizeComplexite(row.complexite_structure),
    justification_complexite: null,
    exposition_sanctions: 'Inconnu',
    notes: notes || null,
    wizard_supplement: wizardSupplement ?? null,
  };
}

async function getPiecesDossierLab(pool, codeClient) {
  const query = `
    SELECT
      id,
      type_piece,
      libelle,
      statut,
      date_delivrance,
      date_echeance,
      filepath,
      nom_fichier
    FROM lab_pieces_kyc
    WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    ORDER BY
      CASE
        WHEN RTRIM(LTRIM(statut)) IN ('Manquante', 'Perimee', 'Périmée') THEN 0
        WHEN RTRIM(LTRIM(statut)) = 'Recue' THEN 1
        ELSE 2
      END,
      date_echeance ASC,
      type_piece ASC
  `;

  const result = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(query);

  return (result.recordset || []).map((row) => {
    const { titulaire, commentaire } = parsePieceLibelle(row.libelle);
    return {
      id: String(row.id),
      type_piece: cleanText(row.type_piece) || 'Pièce KYC',
      titulaire,
      statut: normalizeStatutPiece(row.statut),
      date_delivrance: row.date_delivrance ?? null,
      date_echeance: row.date_echeance ?? null,
      reference: cleanText(row.nom_fichier) || cleanText(row.filepath),
      commentaire,
    };
  });
}

async function getBeneficiairesDossierLab(pool, codeClient) {
  const query = `
    SELECT
      id,
      nom,
      prenom,
      nationalite,
      pays_residence,
      pourcentage_detention,
      pourcentage_controle_total,
      type_controle,
      est_pep,
      sous_sanctions,
      gel_avoirs,
      detail_statut
    FROM lab_beneficiaires_effectifs
    WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
      AND RTRIM(LTRIM(actif)) = 'O'
    ORDER BY
      ISNULL(pourcentage_controle_total, pourcentage_detention) DESC,
      nom ASC,
      prenom ASC
  `;

  const result = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(query);

  return (result.recordset || []).map((row) => ({
    id: String(row.id),
    nom: cleanText(row.nom) || 'Bénéficiaire sans nom',
    prenom: cleanText(row.prenom),
    type: 'Personne_physique',
    nationalite: cleanText(row.nationalite),
    pays_residence: cleanText(row.pays_residence),
    pourcentage: toNumberOrNull(row.pourcentage_controle_total ?? row.pourcentage_detention),
    mode_controle: normalizeModeControle(row.type_controle),
    pep_statut: yesNoUnknown(row.est_pep),
    sanctions_gel: yesNoUnknown(row.sous_sanctions) === 'Oui' || yesNoUnknown(row.gel_avoirs) === 'Oui'
      ? 'Oui'
      : yesNoUnknown(row.sous_sanctions) === 'Inconnu' || yesNoUnknown(row.gel_avoirs) === 'Inconnu'
        ? 'Inconnu'
        : 'Non',
    commentaire: cleanText(row.detail_statut),
  }));
}

function buildOptionalFilters(request, filters = {}, allowed = {}) {
  const clauses = [];
  for (const [key, value] of Object.entries(filters)) {
    const config = allowed[key];
    const clean = cleanText(value);
    if (!config || !clean) continue;
    request.input(key, config.type || sql.NVarChar(config.length || 100), clean);
    clauses.push(`${config.column} = @${key}`);
  }
  return clauses;
}

/**
 * Clause RBAC réutilisable : restreint une requête aux dossiers du périmètre de
 * l'appelant à partir d'une expression code_client (ex. 'e.code_client').
 * Un dossier est « dans le périmètre » si l'appelant est expert-comptable ou
 * chef de mission du client, ou responsable LAB du dossier.
 *
 * @returns {null|{ clause: string, input: { name: string, type: any, value: string } }}
 *   null si accès complet (aucune restriction).
 */
function buildScopeClause(scope, codeClientExpr, paramName = 'scope_id') {
  if (!scope || scope.isFull) return null;
  const idSellsy = scope.idSellsy != null ? String(scope.idSellsy).trim() : '';
  const clause = `(
    EXISTS (SELECT 1 FROM clients c_scope
      WHERE RTRIM(LTRIM(c_scope.code_client)) = RTRIM(LTRIM(${codeClientExpr}))
        AND (RTRIM(LTRIM(c_scope.expert_comptable)) = @${paramName}
          OR RTRIM(LTRIM(c_scope.chef_de_mission)) = @${paramName}))
    OR EXISTS (SELECT 1 FROM lab_dossier d_scope
      WHERE RTRIM(LTRIM(d_scope.code_client)) = RTRIM(LTRIM(${codeClientExpr}))
        AND RTRIM(LTRIM(d_scope.id_responsable_lab)) = @${paramName})
  )`;
  return { clause, input: { name: paramName, type: sql.NVarChar(20), value: idSellsy } };
}

/**
 * Vérifie qu'un dossier (code_client) est dans le périmètre de l'appelant.
 * Accès complet -> ne fait rien. Sinon, lève LabDossierError 403 si le dossier
 * n'est pas assigné à l'appelant. À utiliser sur les routes mono-dossier.
 *
 * @param {string} codeClient
 * @param {{ isFull: boolean, idSellsy: string|null }} scope
 */
export async function assertDossierInScope(codeClient, scope) {
  if (!scope || scope.isFull) return;
  const idSellsy = scope.idSellsy != null ? String(scope.idSellsy).trim() : '';
  if (!idSellsy) {
    throw new LabDossierError('Accès LAB non autorisé', 403);
  }
  const code = codeClient != null ? String(codeClient).trim() : '';
  const codeSafe = code.length > 10 ? code.slice(0, 10) : code;
  if (!codeSafe) {
    throw new LabDossierError('Accès au dossier non autorisé', 403);
  }

  const pool = await poolPromise;
  const result = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeSafe)
    .input('scope_id', sql.NVarChar(20), idSellsy)
    .query(`
      SELECT TOP 1 1 AS ok
      FROM clients c
      LEFT JOIN lab_dossier d ON RTRIM(LTRIM(d.code_client)) = RTRIM(LTRIM(c.code_client))
      WHERE RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(@code_client))
        AND (RTRIM(LTRIM(c.expert_comptable)) = @scope_id
          OR RTRIM(LTRIM(c.chef_de_mission)) = @scope_id
          OR RTRIM(LTRIM(d.id_responsable_lab)) = @scope_id)
    `);

  if (!result.recordset?.[0]) {
    throw new LabDossierError('Accès au dossier non autorisé', 403);
  }
}

/**
 * Indicateurs du tableau de bord LAB.
 *
 * RBAC : le périmètre (scope) est appliqué à TOUS les agrégats (sécurité), pas
 * seulement aux listes. Un appelant restreint ne voit que ses dossiers
 * (expert-comptable / chef de mission / responsable LAB).
 *
 * Filtre période (date_debut / date_fin, format ISO yyyy-mm-dd) — choix imposé :
 *   - Cohorte de dossiers (total clients, risque, secteur, pays, vigilance) :
 *     filtrée sur d.date_entree_relation BETWEEN @date_debut AND @date_fin
 *     (bornes incluses ; une borne non fournie laisse ce côté ouvert).
 *   - Listes & compteurs événements / diligences / revues : filtrés sur LEUR
 *     propre date dans la même période (date_evenement / date_echeance /
 *     date_prochaine_revue). Les compteurs KPI suivent leur liste respective.
 * Une date invalide est ignorée (cf. parseIsoDate).
 *
 * @param {object} filters  query string : collaborateur (id_sellsy), date_debut, date_fin
 * @param {{ isFull: boolean, idSellsy: string|null }} scope  périmètre RBAC résolu par le contrôleur
 */
export async function getDashboardLab(filters = {}, scope = { isFull: true, idSellsy: null }) {
  try {
    const pool = await poolPromise;

    const isFull = scope?.isFull === true;
    const scopeId = !isFull ? (scope?.idSellsy != null ? String(scope.idSellsy).trim() : '') : null;

    const collabId = cleanText(filters.collaborateur);
    const hasCollab = !!collabId;

    // parseIsoDate -> Date (valide) | null (vide) | undefined (format invalide).
    const dDebut = parseIsoDate(filters.date_debut);
    const dFin = parseIsoDate(filters.date_fin);
    const hasDateDebut = dDebut instanceof Date;
    const hasDateFin = dFin instanceof Date;

    // Inputs communs à toutes les requêtes (mssql tolère les inputs déclarés non utilisés).
    const inputs = [];
    if (!isFull) inputs.push({ name: 'scope_id', type: sql.NVarChar(20), value: scopeId });
    if (hasCollab) inputs.push({ name: 'collab_id', type: sql.NVarChar(20), value: collabId });
    if (hasDateDebut) inputs.push({ name: 'date_debut', type: sql.Date, value: dDebut });
    if (hasDateFin) inputs.push({ name: 'date_fin', type: sql.Date, value: dFin });
    const req = () => {
      const request = pool.request();
      for (const input of inputs) request.input(input.name, input.type, input.value);
      return request;
    };

    // Prédicats RBAC + filtre collaborateur appliqués à un couple (lab_dossier, clients).
    const ownershipClauses = (dAlias, cAlias) => {
      const c = [];
      if (!isFull) {
        c.push(`(RTRIM(LTRIM(${cAlias}.expert_comptable)) = @scope_id
          OR RTRIM(LTRIM(${cAlias}.chef_de_mission)) = @scope_id
          OR RTRIM(LTRIM(${dAlias}.id_responsable_lab)) = @scope_id)`);
      }
      if (hasCollab) {
        c.push(`(RTRIM(LTRIM(${cAlias}.expert_comptable)) = @collab_id
          OR RTRIM(LTRIM(${cAlias}.chef_de_mission)) = @collab_id
          OR RTRIM(LTRIM(${dAlias}.id_responsable_lab)) = @collab_id)`);
      }
      return c;
    };

    // Restriction de périmètre pour les tables jointes par code_client (événements,
    // diligences) : le dossier correspondant doit être dans le périmètre de l'appelant.
    // Renvoie un tableau (vide si aucune restriction -> aucun filtre ajouté).
    const existsOwnership = (codeClientExpr) => {
      const owner = ownershipClauses('d2', 'c2');
      if (owner.length === 0) return [];
      const inner = [
        `RTRIM(LTRIM(d2.code_client)) = RTRIM(LTRIM(${codeClientExpr}))`,
        ...owner,
      ];
      return [`EXISTS (
        SELECT 1 FROM lab_dossier d2
        LEFT JOIN clients c2 ON RTRIM(LTRIM(c2.code_client)) = RTRIM(LTRIM(d2.code_client))
        WHERE ${inner.join(' AND ')}
      )`];
    };

    // Filtre période sur une colonne date donnée (bornes incluses, côté ouvert si absent).
    const periodClauses = (dateColExpr) => {
      const c = [];
      if (hasDateDebut) c.push(`${dateColExpr} >= @date_debut`);
      if (hasDateFin) c.push(`${dateColExpr} <= @date_fin`);
      return c;
    };

    const whereFrom = (clauses) => (clauses.length ? `WHERE ${clauses.join(' AND ')}` : '');

    // Cohorte de dossiers : RBAC + collaborateur + période sur date_entree_relation.
    const dossierCohortWhere = whereFrom([
      ...ownershipClauses('d', 'c'),
      ...periodClauses('d.date_entree_relation'),
    ]);

    const [
      kpiBaseResult,
      kpiCountsResult,
      riskResult,
      sectorResult,
      countryResult,
      vigilanceResult,
      eventResult,
      reviewResult,
      diligenceResult,
    ] = await Promise.all([
      // KPI cohorte de dossiers : total clients + risque élevé.
      req().query(`
        SELECT
          COUNT(*) AS total_clients,
          SUM(CASE WHEN RTRIM(LTRIM(d.niveau_risque)) IN ('Eleve', 'Élevé', 'Elevé') THEN 1 ELSE 0 END) AS risque_eleve
        FROM lab_dossier d
        LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(d.code_client))
        ${whereFrom([
          `RTRIM(LTRIM(d.statut_dossier)) != 'Cloture'`,
          ...ownershipClauses('d', 'c'),
          ...periodClauses('d.date_entree_relation'),
        ])}
      `),
      // KPI compteurs alignés sur leurs listes (date propre + périmètre).
      req().query(`
        SELECT
          (SELECT COUNT(*) FROM lab_evenements e
            ${whereFrom([
              `RTRIM(LTRIM(e.statut)) != 'Cloture'`,
              ...existsOwnership('e.code_client'),
              ...periodClauses('e.date_evenement'),
            ])}) AS evenements_ouverts,
          (SELECT COUNT(*) FROM lab_diligences di
            ${whereFrom([
              `di.date_echeance IS NOT NULL`,
              `di.date_echeance < CAST(GETDATE() AS DATE)`,
              `RTRIM(LTRIM(di.statut)) NOT IN ('Realisee', 'Abandonnee')`,
              ...existsOwnership('di.code_client'),
              ...periodClauses('di.date_echeance'),
            ])}) AS diligences_retard,
          (SELECT COUNT(*) FROM lab_dossier d3
            LEFT JOIN clients c3 ON RTRIM(LTRIM(c3.code_client)) = RTRIM(LTRIM(d3.code_client))
            ${whereFrom([
              `d3.date_prochaine_revue IS NOT NULL`,
              `d3.date_prochaine_revue < CAST(GETDATE() AS DATE)`,
              `RTRIM(LTRIM(d3.statut_dossier)) != 'Cloture'`,
              ...ownershipClauses('d3', 'c3'),
              ...periodClauses('d3.date_prochaine_revue'),
            ])}) AS revues_retard
      `),
      req().query(`
        SELECT COALESCE(NULLIF(RTRIM(LTRIM(d.niveau_risque)), ''), 'Non évalué') AS label, COUNT(*) AS value
        FROM lab_dossier d
        LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(d.code_client))
        ${dossierCohortWhere}
        GROUP BY COALESCE(NULLIF(RTRIM(LTRIM(d.niveau_risque)), ''), 'Non évalué')
      `),
      req().query(`
        SELECT TOP 6 COALESCE(NULLIF(RTRIM(LTRIM(k.secteur_activite)), ''), 'Non renseigné') AS label, COUNT(*) AS value
        FROM lab_dossier d
        LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(d.code_client))
        LEFT JOIN lab_kyc k ON RTRIM(LTRIM(k.code_client)) = RTRIM(LTRIM(d.code_client))
        ${dossierCohortWhere}
        GROUP BY COALESCE(NULLIF(RTRIM(LTRIM(k.secteur_activite)), ''), 'Non renseigné')
        ORDER BY COUNT(*) DESC
      `),
      req().query(`
        SELECT TOP 6 COALESCE(NULLIF(RTRIM(LTRIM(k.zone_geographique_principale)), ''), 'Non renseigné') AS label, COUNT(*) AS value
        FROM lab_dossier d
        LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(d.code_client))
        LEFT JOIN lab_kyc k ON RTRIM(LTRIM(k.code_client)) = RTRIM(LTRIM(d.code_client))
        ${dossierCohortWhere}
        GROUP BY COALESCE(NULLIF(RTRIM(LTRIM(k.zone_geographique_principale)), ''), 'Non renseigné')
        ORDER BY COUNT(*) DESC
      `),
      // Vigilance (cohorte de dossiers) : histogramme + KPI dossiers actifs en vigilance renforcée.
      req().query(`
        SELECT
          SUM(CASE WHEN RTRIM(LTRIM(d.vigilance)) = N'Standard' THEN 1 ELSE 0 END) AS standard_total,
          SUM(CASE WHEN RTRIM(LTRIM(d.vigilance)) = N'Renforcee' THEN 1 ELSE 0 END) AS renforcee_total,
          SUM(CASE WHEN RTRIM(LTRIM(d.vigilance)) = N'Renforcee'
                    AND RTRIM(LTRIM(d.statut_dossier)) != 'Cloture' THEN 1 ELSE 0 END) AS renforcee_actifs
        FROM lab_dossier d
        LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(d.code_client))
        ${dossierCohortWhere}
      `),
      req().query(`
        SELECT TOP 10
          e.code_client,
          c.raison_sociale,
          e.type_evenement,
          e.criticite,
          e.date_evenement
        FROM lab_evenements e
        LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(e.code_client))
        ${whereFrom([
          `RTRIM(LTRIM(e.statut)) != 'Cloture'`,
          ...existsOwnership('e.code_client'),
          ...periodClauses('e.date_evenement'),
        ])}
        ORDER BY
          CASE WHEN RTRIM(LTRIM(e.criticite)) IN ('Elevee', 'Élevée', 'Elevée') THEN 0 ELSE 1 END,
          e.date_evenement DESC
      `),
      req().query(`
        SELECT TOP 10
          d.code_client,
          c.raison_sociale,
          d.date_prochaine_revue,
          DATEDIFF(DAY, d.date_prochaine_revue, CAST(GETDATE() AS DATE)) AS retard_jours
        FROM lab_dossier d
        LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(d.code_client))
        ${whereFrom([
          `d.date_prochaine_revue IS NOT NULL`,
          `d.date_prochaine_revue < CAST(GETDATE() AS DATE)`,
          ...ownershipClauses('d', 'c'),
          ...periodClauses('d.date_prochaine_revue'),
        ])}
        ORDER BY d.date_prochaine_revue ASC
      `),
      req().query(`
        SELECT TOP 10
          di.code_client,
          c.raison_sociale,
          di.date_echeance,
          DATEDIFF(DAY, di.date_echeance, CAST(GETDATE() AS DATE)) AS retard_jours,
          di.id_responsable,
          responsable.nom AS responsable_nom,
          responsable.prenom AS responsable_prenom
        FROM lab_diligences di
        LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(di.code_client))
        LEFT JOIN collaborateurs responsable ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(di.id_responsable))
        ${whereFrom([
          `di.date_echeance IS NOT NULL`,
          `di.date_echeance < CAST(GETDATE() AS DATE)`,
          `RTRIM(LTRIM(di.statut)) NOT IN ('Realisee', 'Abandonnee')`,
          ...existsOwnership('di.code_client'),
          ...periodClauses('di.date_echeance'),
        ])}
        ORDER BY di.date_echeance ASC
      `),
    ]);

    const kpiRow = { ...(kpiBaseResult.recordset?.[0] || {}), ...(kpiCountsResult.recordset?.[0] || {}) };
    const totalClients = kpiRow.total_clients ?? 0;
    const risqueEleve = kpiRow.risque_eleve ?? 0;
    const vigilanceRow = vigilanceResult.recordset?.[0] || {};

    const dashboardRiskLabel = (label) => {
      const clean = cleanText(label);
      const normalized = clean
        ? clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        : '';
      if (!normalized || normalized.includes('non evalue') || normalized.includes('non renseigne')) {
        return 'Non évalué';
      }
      if (normalized.includes('eleve')) return 'Élevé';
      if (normalized.includes('moy')) return 'Moyen';
      if (normalized.includes('faible')) return 'Faible';
      return 'Non évalué';
    };

    const colorForRisk = (label) => {
      const niveau = dashboardRiskLabel(label);
      if (niveau === 'Non évalué') return 'neutral';
      if (niveau === 'Élevé') return 'red';
      if (niveau === 'Moyen') return 'orange';
      return 'green';
    };

    const riskBuckets = new Map([
      ['Faible', 0],
      ['Moyen', 0],
      ['Élevé', 0],
      ['Non évalué', 0],
    ]);

    for (const row of riskResult.recordset || []) {
      const label = dashboardRiskLabel(row.label);
      riskBuckets.set(label, (riskBuckets.get(label) ?? 0) + (row.value ?? 0));
    }

    return {
      kpi: {
        totalClients,
        pctRisqueEleve: totalClients > 0 ? Math.round((risqueEleve / totalClients) * 100) : 0,
        evenementsOuverts: kpiRow.evenements_ouverts ?? 0,
        diligencesEnRetard: kpiRow.diligences_retard ?? 0,
        revuesEnRetard: kpiRow.revues_retard ?? 0,
        vigilanceRenforcee: vigilanceRow.renforcee_actifs ?? 0,
      },
      histogramRisque: Array.from(riskBuckets.entries()).map(([label, value]) => ({
        label,
        value,
        color: colorForRisk(label),
      })),
      histogramVigilance: [
        { label: 'Standard', value: vigilanceRow.standard_total ?? 0, color: 'green' },
        { label: 'Renforcee', value: vigilanceRow.renforcee_total ?? 0, color: 'orange' },
      ],
      histogramSecteur: (sectorResult.recordset || []).map((row) => ({
        label: cleanText(row.label) || 'Non renseigné',
        value: row.value ?? 0,
        color: 'neutral',
      })),
      histogramPays: (countryResult.recordset || []).map((row) => ({
        label: cleanText(row.label) || 'Non renseigné',
        value: row.value ?? 0,
        color: 'neutral',
      })),
      evenementsCritiquesOuverts: (eventResult.recordset || []).map((row) => ({
        client: cleanText(row.raison_sociale) || cleanText(row.code_client) || 'Client inconnu',
        type: cleanText(row.type_evenement) || 'AUTRE',
        criticite: normalizeCriticite(row.criticite) === 'Elevee' ? 'Élevée' : normalizeCriticite(row.criticite),
        date: row.date_evenement ?? null,
      })),
      revuesEnRetardListe: (reviewResult.recordset || []).map((row) => ({
        client: cleanText(row.raison_sociale) || cleanText(row.code_client) || 'Client inconnu',
        echeanceDepassee: row.date_prochaine_revue ?? null,
        retardJours: row.retard_jours ?? 0,
      })),
      diligencesEnRetardListe: (diligenceResult.recordset || []).map((row) => ({
        client: cleanText(row.raison_sociale) || cleanText(row.code_client) || 'Client inconnu',
        responsable: formatCollaborateur(row.responsable_prenom, row.responsable_nom, row.id_responsable),
        echeance: row.date_echeance ?? null,
        retardJours: row.retard_jours ?? 0,
      })),
    };
  } catch (err) {
    console.error('Erreur getDashboardLab:', err);
    throw err;
  }
}

/**
 * Liste paginée et filtrée des dossiers LAB (portefeuille / dashboard onglet liste).
 *
 * @param {object} filters  query string : search, niveau, vigilance, revue, kyc, secteur, pays, page, pageSize
 * @param {{ isFull: boolean, idSellsy: string|null }} scope  périmètre RBAC résolu par le contrôleur
 * @returns {Promise<{ data: object[], total: number, page: number, pageSize: number }>}
 */
export async function getDossiersLab(filters = {}, scope = { isFull: true, idSellsy: null }) {
  try {
    const pool = await poolPromise;

    // Clauses WHERE + inputs réutilisés par les 2 requêtes (COUNT puis page).
    const where = [];
    const inputs = [];

    // RBAC : périmètre restreint -> uniquement les dossiers dont l'appelant est
    // expert-comptable, chef de mission ou responsable LAB.
    if (!scope?.isFull) {
      const scopeId = scope?.idSellsy != null ? String(scope.idSellsy).trim() : '';
      inputs.push({ name: 'scope_id', type: sql.NVarChar(20), value: scopeId });
      where.push(`(
        RTRIM(LTRIM(c.expert_comptable)) = @scope_id
        OR RTRIM(LTRIM(c.chef_de_mission)) = @scope_id
        OR RTRIM(LTRIM(d.id_responsable_lab)) = @scope_id
      )`);
    }

    const search = cleanText(filters.search);
    if (search) {
      inputs.push({ name: 'search', type: sql.NVarChar(200), value: `%${search}%` });
      where.push(`(
        c.raison_sociale LIKE @search
        OR d.code_client LIKE @search
        OR c.siret LIKE @search
        OR k.secteur_activite LIKE @search
        OR k.zone_geographique_principale LIKE @search
      )`);
    }

    const niveau = cleanText(filters.niveau);
    if (niveau === 'NonEvalue') {
      where.push(`(d.niveau_risque IS NULL OR RTRIM(LTRIM(d.niveau_risque)) = '')`);
    } else if (niveau === 'Eleve') {
      where.push(`RTRIM(LTRIM(d.niveau_risque)) IN (N'Eleve', N'Élevé', N'Elevé')`);
    } else if (niveau === 'Moyen') {
      where.push(`RTRIM(LTRIM(d.niveau_risque)) = N'Moyen'`);
    } else if (niveau === 'Faible') {
      where.push(`RTRIM(LTRIM(d.niveau_risque)) = N'Faible'`);
    }

    const vigilance = cleanText(filters.vigilance);
    if (vigilance === 'Standard' || vigilance === 'Renforcee') {
      inputs.push({ name: 'vigilance', type: sql.NVarChar(10), value: vigilance });
      where.push(`RTRIM(LTRIM(d.vigilance)) = @vigilance`);
    }

    const revue = cleanText(filters.revue);
    if (revue === 'late') {
      where.push(`d.date_prochaine_revue < CAST(GETDATE() AS DATE)`);
    } else if (revue === 'soon') {
      where.push(`(d.date_prochaine_revue >= CAST(GETDATE() AS DATE)
        AND d.date_prochaine_revue <= DATEADD(DAY, 60, CAST(GETDATE() AS DATE)))`);
    }

    const kyc = cleanText(filters.kyc);
    if (kyc === 'Complet' || kyc === 'Incomplet') {
      inputs.push({ name: 'kyc', type: sql.NVarChar(20), value: kyc });
      where.push(`RTRIM(LTRIM(d.statut_kyc)) = @kyc`);
    }

    const secteur = filters.secteur != null ? String(filters.secteur).trim() : '';
    if (secteur === '__NON_RENSEIGNE__') {
      where.push(`(k.secteur_activite IS NULL OR RTRIM(LTRIM(k.secteur_activite)) = '')`);
    } else if (secteur) {
      inputs.push({ name: 'secteur', type: sql.NVarChar(100), value: secteur });
      where.push(`RTRIM(LTRIM(k.secteur_activite)) = @secteur`);
    }

    const pays = filters.pays != null ? String(filters.pays).trim() : '';
    if (pays === '__NON_RENSEIGNE__') {
      where.push(`(k.zone_geographique_principale IS NULL OR RTRIM(LTRIM(k.zone_geographique_principale)) = '')`);
    } else if (pays) {
      inputs.push({ name: 'pays', type: sql.NVarChar(60), value: pays });
      where.push(`RTRIM(LTRIM(k.zone_geographique_principale)) = @pays`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const fromJoin = `
      FROM lab_dossier d
      LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(d.code_client))
      LEFT JOIN lab_kyc k ON RTRIM(LTRIM(k.code_client)) = RTRIM(LTRIM(d.code_client))
      LEFT JOIN collaborateurs responsable ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(d.id_responsable_lab))
    `;

    // Pagination
    let page = Number.parseInt(filters.page, 10);
    if (!Number.isInteger(page) || page < 1) page = 1;
    let pageSize = Number.parseInt(filters.pageSize, 10);
    if (!Number.isInteger(pageSize)) pageSize = 50;
    if (pageSize < 1) pageSize = 1;
    if (pageSize > 200) pageSize = 200;
    const offset = (page - 1) * pageSize;

    const applyInputs = (request) => {
      for (const input of inputs) request.input(input.name, input.type, input.value);
      return request;
    };

    // 1) Total (mêmes FROM/JOIN/WHERE/inputs que la page)
    const countResult = await applyInputs(pool.request()).query(`
      SELECT COUNT(*) AS total
      ${fromJoin}
      ${whereSql}
    `);
    const total = countResult.recordset?.[0]?.total ?? 0;

    // 2) Page
    const pageRequest = applyInputs(pool.request());
    pageRequest.input('offset', sql.Int, offset);
    pageRequest.input('pageSize', sql.Int, pageSize);
    const result = await pageRequest.query(`
      SELECT
        d.id,
        d.code_client,
        c.raison_sociale,
        c.siret,
        k.secteur_activite,
        k.zone_geographique_principale,
        d.niveau_risque,
        d.vigilance,
        d.statut_kyc,
        d.statut_dossier,
        d.date_derniere_revue,
        d.date_prochaine_revue,
        d.id_responsable_lab,
        responsable.nom AS responsable_nom,
        responsable.prenom AS responsable_prenom,
        (SELECT COUNT(*) FROM lab_evenements e
         WHERE e.code_client = d.code_client AND RTRIM(LTRIM(e.statut)) != 'Cloture') AS nb_evenements_ouverts,
        (SELECT COUNT(*) FROM lab_diligences di
         WHERE di.code_client = d.code_client
           AND di.date_echeance IS NOT NULL
           AND di.date_echeance < CAST(GETDATE() AS DATE)
           AND RTRIM(LTRIM(di.statut)) NOT IN ('Realisee', 'Abandonnee')) AS nb_diligences_retard
      ${fromJoin}
      ${whereSql}
      ORDER BY
        CASE RTRIM(LTRIM(d.niveau_risque)) WHEN 'Eleve' THEN 0 WHEN 'Élevé' THEN 0 WHEN 'Moyen' THEN 1 ELSE 2 END,
        d.date_prochaine_revue ASC,
        d.id DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);

    const data = (result.recordset || []).map((row) => ({
      id: row.id,
      code_client: cleanText(row.code_client),
      raison_sociale: cleanText(row.raison_sociale),
      siret: cleanText(row.siret),
      secteur_activite: cleanText(row.secteur_activite),
      zone_geographique_principale: cleanText(row.zone_geographique_principale),
      niveau_risque: cleanText(row.niveau_risque),
      vigilance: cleanText(row.vigilance),
      statut_kyc: cleanText(row.statut_kyc),
      statut_dossier: cleanText(row.statut_dossier),
      date_derniere_revue: row.date_derniere_revue ?? null,
      date_prochaine_revue: row.date_prochaine_revue ?? null,
      responsable_lab: formatCollaborateur(row.responsable_prenom, row.responsable_nom, row.id_responsable_lab),
      nb_evenements_ouverts: row.nb_evenements_ouverts ?? 0,
      nb_diligences_retard: row.nb_diligences_retard ?? 0,
    }));

    return { data, total, page, pageSize };
  } catch (err) {
    console.error('Erreur getDossiersLab:', err);
    throw err;
  }
}

export async function getEvenementsLab(filters = {}, scope = { isFull: true, idSellsy: null }) {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    const clauses = buildOptionalFilters(request, filters, {
      code_client: { column: 'RTRIM(LTRIM(e.code_client))', type: sql.NVarChar(10) },
      statut: { column: 'RTRIM(LTRIM(e.statut))', type: sql.NVarChar(20) },
      criticite: { column: 'RTRIM(LTRIM(e.criticite))', type: sql.NVarChar(10) },
    });
    const idEvenement = Number(filters.id);
    if (Number.isInteger(idEvenement) && idEvenement > 0) {
      request.input('id_evenement', sql.Int, idEvenement);
      clauses.push('e.id = @id_evenement');
    }
    if (filters.ouverts === '1' || filters.ouverts === 'true') {
      clauses.push(`RTRIM(LTRIM(e.statut)) != N'Cloture'`);
    }
    const scopeClause = buildScopeClause(scope, 'e.code_client');
    if (scopeClause) {
      request.input(scopeClause.input.name, scopeClause.input.type, scopeClause.input.value);
      clauses.push(scopeClause.clause);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await request.query(`
      SELECT
        e.id,
        e.code_client,
        c.raison_sociale,
        e.type_evenement,
        e.libelle,
        e.criticite,
        e.statut,
        e.date_evenement,
        e.date_echeance,
        e.id_responsable,
        responsable.nom AS responsable_nom,
        responsable.prenom AS responsable_prenom,
        (SELECT COUNT(*) FROM lab_diligences di WHERE di.id_evenement = e.id) AS nb_diligences
      FROM lab_evenements e
      LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(e.code_client))
      LEFT JOIN collaborateurs responsable ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(e.id_responsable))
      ${where}
      ORDER BY e.date_evenement DESC, e.id DESC
    `);

    const data = (result.recordset || []).map((row) => ({
      id: row.id,
      code_client: cleanText(row.code_client),
      client: cleanText(row.raison_sociale),
      type_evenement: cleanText(row.type_evenement),
      libelle: cleanText(row.libelle),
      criticite: normalizeCriticite(row.criticite),
      statut: cleanText(row.statut),
      date_evenement: row.date_evenement ?? null,
      date_echeance: row.date_echeance ?? null,
      responsable: formatCollaborateur(row.responsable_prenom, row.responsable_nom, row.id_responsable),
      nb_diligences: row.nb_diligences ?? 0,
    }));
    return { data, total: data.length };
  } catch (err) {
    console.error('Erreur getEvenementsLab:', err);
    throw err;
  }
}

export async function getDiligencesLab(filters = {}, scope = { isFull: true, idSellsy: null }) {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    const clauses = buildOptionalFilters(request, filters, {
      code_client: { column: 'RTRIM(LTRIM(d.code_client))', type: sql.NVarChar(10) },
      statut: { column: 'RTRIM(LTRIM(d.statut))', type: sql.NVarChar(20) },
      id_responsable: { column: 'RTRIM(LTRIM(d.id_responsable))', type: sql.NVarChar(20) },
    });
    const idEvenement = Number(filters.id_evenement);
    if (Number.isInteger(idEvenement) && idEvenement > 0) {
      request.input('id_evenement', sql.Int, idEvenement);
      clauses.push('d.id_evenement = @id_evenement');
    }
    const scopeClause = buildScopeClause(scope, 'd.code_client');
    if (scopeClause) {
      request.input(scopeClause.input.name, scopeClause.input.type, scopeClause.input.value);
      clauses.push(scopeClause.clause);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await request.query(`
      SELECT
        d.id,
        d.id_evenement,
        d.code_client,
        c.raison_sociale,
        e.type_evenement,
        d.intitule,
        d.type_diligence,
        d.id_responsable,
        d.date_echeance,
        d.statut,
        d.date_realisation,
        d.commentaires,
        d.ref_piece_jointe,
        responsable.nom AS responsable_nom,
        responsable.prenom AS responsable_prenom
      FROM lab_diligences d
      LEFT JOIN lab_evenements e ON e.id = d.id_evenement
      LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(d.code_client))
      LEFT JOIN collaborateurs responsable ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(d.id_responsable))
      ${where}
      ORDER BY
        CASE WHEN RTRIM(LTRIM(d.statut)) IN ('Realisee', 'Abandonnee') THEN 1 ELSE 0 END,
        d.date_echeance ASC,
        d.id DESC
    `);

    const data = (result.recordset || []).map((row) => ({
      id: row.id,
      id_evenement: row.id_evenement,
      code_client: cleanText(row.code_client),
      client: cleanText(row.raison_sociale),
      type_evenement: cleanText(row.type_evenement),
      intitule: cleanText(row.intitule),
      type_diligence: cleanText(row.type_diligence),
      responsable: formatCollaborateur(row.responsable_prenom, row.responsable_nom, row.id_responsable),
      date_echeance: row.date_echeance ?? null,
      statut: cleanText(row.statut),
      date_realisation: row.date_realisation ?? null,
      commentaires: cleanText(row.commentaires),
      ref_piece_jointe: cleanText(row.ref_piece_jointe),
    }));
    return { data, total: data.length };
  } catch (err) {
    console.error('Erreur getDiligencesLab:', err);
    throw err;
  }
}

const MANUAL_FORBIDDEN_EVENT_TYPES = new Set([
  'ENTREE_RELATION',
  'CHANGEMENT_BE',
  'CHANGEMENT_RISQUE',
  'REVUE_ANNUELLE',
  'PLAN_VIGILANCE',
]);

/**
 * Catalogue plan de vigilance — constante code (pas de table référentiel).
 * Uniquement les diligences Renforcées : les obligations « Standard »
 * (gel des avoirs, pièces KYC, fiche identification, programmation revue)
 * sont déjà couvertes par le wizard / la revue annuelle.
 */
const CATALOGUE_PLAN_VIGILANCE_RENFORCEE = [
  {
    intitule: 'Documenter le bénéficiaire effectif final',
    description: 'Remonter à la personne physique. Pièce d\'identité si manquante.',
    type_diligence: 'Renforcee',
    delai_jours: 15,
  },
  {
    intitule: 'Demander un KBIS à jour',
    description: 'Si pièce périmée / manquante — relance sous délai court.',
    type_diligence: 'Renforcee',
    delai_jours: 15,
  },
  {
    intitule: 'Qualifier l\'implantation à l\'étranger et justifier la relation',
    description: 'Note d\'analyse pays à risque si exposition hors UE / listes.',
    type_diligence: 'Renforcee',
    delai_jours: 15,
  },
  {
    intitule: 'Note sur l\'origine des fonds et les flux intra-groupe',
    description: 'Si flux devises / sous-traitants hors UE / trésorerie groupe.',
    type_diligence: 'Renforcee',
    delai_jours: 15,
  },
  {
    intitule: 'Approbation hiérarchique du responsable LAB',
    description: 'Validation de la poursuite en vigilance renforcée.',
    type_diligence: 'Renforcee',
    delai_jours: 15,
  },
  {
    intitule: 'Examen renforcé des opérations atypiques',
    description: 'Art. L.561-10-2 CMF — lien vers écran Opérations atypiques.',
    type_diligence: 'Renforcee',
    delai_jours: null,
  },
];

const EVENT_TYPE_DEFAULT_LIBELLES = {
  PIECE_MANQUANTE: 'Pièce manquante',
  PIECE_PERIMEE: 'Pièce périmée',
  CHANGEMENT_KYC: 'Changement KYC',
  TRANSACTION_ATYPIQUE: 'Transaction atypique',
  PLAN_VIGILANCE: 'Plan de vigilance',
  AUTRE: 'Autre événement',
};

const DILIGENCE_STATUT_TRANSITIONS = {
  A_faire: new Set(['En_cours']),
  En_cours: new Set(['Realisee', 'Abandonnee']),
  Realisee: new Set(),
  Abandonnee: new Set(),
};

const REVUE_REPONSES_META = [
  { code: 'KYC_MAJ', libelle: 'KYC à jour' },
  { code: 'RISQUE_VERIFIE', libelle: 'Risque vérifié' },
  { code: 'PIECES_COMPLETES', libelle: 'Pièces complètes' },
  { code: 'OPS_ATYPIQUES', libelle: 'Opérations atypiques' },
  { code: 'CONCLUSION', libelle: 'Conclusion de la revue' },
];

function defaultLibelleEvenement(typeEvenement) {
  const type = cleanText(typeEvenement) || 'AUTRE';
  return EVENT_TYPE_DEFAULT_LIBELLES[type] || type.replace(/_/g, ' ');
}

/**
 * Génère (idempotent) le plan de vigilance d'un dossier :
 * uniquement si vigilance = Renforcee → événement PLAN_VIGILANCE
 * + diligences catalogue Renforcée (6).
 * Vigilance Standard → no-op (obligations déjà couvertes par wizard / revue).
 *
 * @param {string} codeClient
 * @param {{ id_evaluation?: number|null, userId?: string|null }} [options]
 * @returns {Promise<object>}
 */
export async function genererPlanVigilanceLab(codeClient, { id_evaluation = null, userId = null } = {}) {
  const code = codeClient != null ? String(codeClient).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }
  const codeSafe = code;
  const creePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await assertClientExists(transaction, codeSafe);
    await assertDossierExists(transaction, codeSafe);

    const dossierRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .query(`
        SELECT
          RTRIM(LTRIM(d.vigilance)) AS vigilance,
          RTRIM(LTRIM(d.id_responsable_lab)) AS id_responsable_lab,
          RTRIM(LTRIM(c.expert_comptable)) AS expert_comptable
        FROM lab_dossier d
        INNER JOIN clients c
          ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(d.code_client))
        WHERE RTRIM(LTRIM(d.code_client)) = RTRIM(LTRIM(@code_client))
      `);
    const dossierRow = dossierRes.recordset?.[0];
    if (!dossierRow) {
      throw new LabDossierError('Dossier LAB introuvable', 404);
    }

    const vigilanceRaw = cleanText(dossierRow.vigilance) || 'Standard';
    const vigilance = vigilanceRaw.toLowerCase().includes('renforc') ? 'Renforcee' : 'Standard';
    const idResponsable =
      cleanText(dossierRow.id_responsable_lab) || cleanText(dossierRow.expert_comptable) || creePar;

    if (vigilance !== 'Renforcee') {
      await transaction.rollback();
      return {
        code_client: codeSafe,
        id_evenement: null,
        evenement_cree: false,
        vigilance,
        id_evaluation: id_evaluation ?? null,
        nb_creees: 0,
        nb_sautees: 0,
        diligences_creees_ids: [],
        diligences_sautees: [],
        skipped_reason: 'vigilance_standard',
      };
    }

    const catalogue = [...CATALOGUE_PLAN_VIGILANCE_RENFORCEE];

    let eventRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .query(`
        SELECT TOP 1 id
        FROM lab_evenements
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(type_evenement)) = N'PLAN_VIGILANCE'
          AND RTRIM(LTRIM(statut)) = N'Ouvert'
        ORDER BY id DESC
      `);

    let eventId = eventRes.recordset?.[0]?.id ?? null;
    let eventCreated = false;

    if (eventId == null) {
      const insertEvent = await new sql.Request(transaction)
        .input('code_client', sql.NVarChar(10), codeSafe)
        .input('type_evenement', sql.NChar(50), 'PLAN_VIGILANCE')
        .input('libelle', sql.NChar(200), defaultLibelleEvenement('PLAN_VIGILANCE'))
        .input('criticite', sql.NChar(10), 'Elevee')
        .input('statut', sql.NChar(20), 'Ouvert')
        .input('date_evenement', sql.Date, todayUtcDate())
        .input('id_responsable', sql.NChar(20), idResponsable)
        .input('cree_par', sql.NChar(20), creePar)
        .query(`
          INSERT INTO lab_evenements (
            code_client, type_evenement, libelle, criticite, statut,
            date_evenement, id_responsable, cree_par, modifie_par
          )
          OUTPUT INSERTED.id
          VALUES (
            @code_client, @type_evenement, @libelle, @criticite, @statut,
            @date_evenement, @id_responsable, @cree_par, @cree_par
          )
        `);
      eventId = insertEvent.recordset?.[0]?.id;
      if (eventId == null) {
        throw new Error('INSERT lab_evenements PLAN_VIGILANCE sans id retourné');
      }
      eventCreated = true;
    }

    const existingDilRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .query(`
        SELECT id, intitule, id_evenement
        FROM lab_diligences
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(statut)) <> N'Abandonnee'
      `);

    const existingKeys = new Set(
      (existingDilRes.recordset || [])
        .map((row) => normalizeIntituleKey(row.intitule))
        .filter(Boolean),
    );

    const today = todayUtcDate();
    const createdIds = [];
    const skipped = [];

    for (const item of catalogue) {
      const key = normalizeIntituleKey(item.intitule);
      if (!key || existingKeys.has(key)) {
        skipped.push(item.intitule);
        continue;
      }

      const dateEcheance =
        item.delai_jours == null ? null : addDaysUtc(today, item.delai_jours);

      const dilRes = await new sql.Request(transaction)
        .input('id_evenement', sql.Int, eventId)
        .input('code_client', sql.NVarChar(10), codeSafe)
        .input('intitule', sql.NChar(200), item.intitule)
        .input('type_diligence', sql.NChar(50), item.type_diligence)
        .input('id_responsable', sql.NChar(20), idResponsable)
        .input('date_echeance', sql.Date, dateEcheance)
        .input('statut', sql.NChar(20), 'A_faire')
        .input('commentaires', sql.NVarChar(sql.MAX), item.description)
        .input('cree_par', sql.NChar(20), creePar)
        .query(`
          INSERT INTO lab_diligences (
            id_evenement, code_client, intitule, type_diligence,
            id_responsable, date_echeance, statut, commentaires,
            cree_par, modifie_par
          )
          OUTPUT INSERTED.id
          VALUES (
            @id_evenement, @code_client, @intitule, @type_diligence,
            @id_responsable, @date_echeance, @statut, @commentaires,
            @cree_par, @cree_par
          )
        `);

      const dilId = dilRes.recordset?.[0]?.id;
      if (dilId != null) {
        createdIds.push(dilId);
        existingKeys.add(key);
      }
    }

    await writeLabAuditLog(transaction, {
      userId: creePar,
      typeAction: 'GENERATION_PLAN_VIGILANCE',
      entite: 'lab_evenements',
      idEntite: eventId,
      codeClient: codeSafe,
      detail: JSON.stringify({
        nb_creees: createdIds.length,
        nb_sautees: skipped.length,
        vigilance,
        id_evaluation: id_evaluation ?? null,
        id_evenement: eventId,
        evenement_cree: eventCreated,
      }),
    });

    await transaction.commit();

    return {
      code_client: codeSafe,
      id_evenement: eventId,
      evenement_cree: eventCreated,
      vigilance,
      id_evaluation: id_evaluation ?? null,
      nb_creees: createdIds.length,
      nb_sautees: skipped.length,
      diligences_creees_ids: createdIds,
      diligences_sautees: skipped,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

function buildWizardUrl(codeClient, revueId) {
  const code = encodeURIComponent(codeClient);
  return `/lab/dossier/formulaire?code_client=${code}&id_revue=${revueId}`;
}

function computeConclusionRisque(niveauAvant, niveauApres) {
  const rankAvant = niveauRankForArpec(niveauAvant);
  const rankApres = niveauRankForArpec(niveauApres);
  if (rankApres > rankAvant) return 'Augmentation';
  if (rankApres < rankAvant) return 'Diminution';
  return 'Maintien';
}

function mapEvenementRow(row) {
  return {
    id: row.id,
    code_client: cleanText(row.code_client),
    client: cleanText(row.raison_sociale),
    type_evenement: cleanText(row.type_evenement),
    libelle: cleanText(row.libelle),
    criticite: normalizeCriticite(row.criticite),
    statut: cleanText(row.statut) || 'Ouvert',
    date_evenement: row.date_evenement ?? null,
    date_echeance: row.date_echeance ?? null,
    responsable: formatCollaborateur(row.responsable_prenom, row.responsable_nom, row.id_responsable),
    nb_diligences: row.nb_diligences ?? 0,
  };
}

function mapDiligenceRow(row) {
  return {
    id: row.id,
    id_evenement: row.id_evenement,
    code_client: cleanText(row.code_client),
    client: cleanText(row.raison_sociale),
    type_evenement: cleanText(row.type_evenement),
    intitule: cleanText(row.intitule),
    type_diligence: cleanText(row.type_diligence),
    responsable: formatCollaborateur(row.responsable_prenom, row.responsable_nom, row.id_responsable),
    date_echeance: row.date_echeance ?? null,
    statut: cleanText(row.statut) || 'A_faire',
    date_realisation: row.date_realisation ?? null,
    commentaires: cleanText(row.commentaires),
    ref_piece_jointe: cleanText(row.ref_piece_jointe),
  };
}

async function fetchEvenementById(transaction, id) {
  const result = await new sql.Request(transaction)
    .input('id', sql.Int, id)
    .query(`
      SELECT TOP 1
        e.id,
        e.code_client,
        e.type_evenement,
        e.libelle,
        e.criticite,
        e.statut,
        e.date_evenement,
        e.date_echeance,
        e.conclusion,
        e.tracfin_declare,
        e.tracfin_commentaire,
        e.id_responsable
      FROM lab_evenements e
      WHERE e.id = @id
    `);
  const row = result.recordset?.[0];
  if (!row) {
    throw new LabDossierError('Événement introuvable', 404);
  }
  return row;
}

async function fetchEvenementEnriched(transaction, eventId) {
  const result = await new sql.Request(transaction)
    .input('id', sql.Int, eventId)
    .query(`
      SELECT
        e.id,
        e.code_client,
        c.raison_sociale,
        e.type_evenement,
        e.libelle,
        e.criticite,
        e.statut,
        e.date_evenement,
        e.date_echeance,
        e.id_responsable,
        responsable.nom AS responsable_nom,
        responsable.prenom AS responsable_prenom,
        (SELECT COUNT(*) FROM lab_diligences di WHERE di.id_evenement = e.id) AS nb_diligences
      FROM lab_evenements e
      LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(e.code_client))
      LEFT JOIN collaborateurs responsable ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(e.id_responsable))
      WHERE e.id = @id
    `);
  const row = result.recordset?.[0];
  if (!row) {
    throw new LabDossierError('Événement introuvable', 404);
  }
  const evenement = mapEvenementRow(row);
  const dilResult = await new sql.Request(transaction)
    .input('id_evenement', sql.Int, eventId)
    .query(`
      SELECT
        d.id,
        d.id_evenement,
        d.code_client,
        c.raison_sociale,
        e.type_evenement,
        d.intitule,
        d.type_diligence,
        d.id_responsable,
        d.date_echeance,
        d.statut,
        d.date_realisation,
        d.commentaires,
        d.ref_piece_jointe,
        responsable.nom AS responsable_nom,
        responsable.prenom AS responsable_prenom
      FROM lab_diligences d
      LEFT JOIN lab_evenements e ON e.id = d.id_evenement
      LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(d.code_client))
      LEFT JOIN collaborateurs responsable ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(d.id_responsable))
      WHERE d.id_evenement = @id_evenement
      ORDER BY d.id ASC
    `);
  evenement.diligences = (dilResult.recordset || []).map(mapDiligenceRow);
  return evenement;
}

async function fetchDiligenceEnriched(transaction, diligenceId) {
  const result = await new sql.Request(transaction)
    .input('id', sql.Int, diligenceId)
    .query(`
      SELECT
        d.id,
        d.id_evenement,
        d.code_client,
        c.raison_sociale,
        e.type_evenement,
        d.intitule,
        d.type_diligence,
        d.id_responsable,
        d.date_echeance,
        d.statut,
        d.date_realisation,
        d.commentaires,
        d.ref_piece_jointe,
        d.motif_abandon,
        responsable.nom AS responsable_nom,
        responsable.prenom AS responsable_prenom
      FROM lab_diligences d
      LEFT JOIN lab_evenements e ON e.id = d.id_evenement
      LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(d.code_client))
      LEFT JOIN collaborateurs responsable ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(d.id_responsable))
      WHERE d.id = @id
    `);
  const row = result.recordset?.[0];
  if (!row) {
    throw new LabDossierError('Diligence introuvable', 404);
  }
  return mapDiligenceRow(row);
}

export async function resolveEvenementCodeClient(eventId) {
  const id = parseEntityId(eventId, 'id événement');
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query(`
      SELECT TOP 1 RTRIM(LTRIM(code_client)) AS code_client
      FROM lab_evenements
      WHERE id = @id
    `);
  const code = cleanText(result.recordset?.[0]?.code_client);
  if (!code) {
    throw new LabDossierError('Événement introuvable', 404);
  }
  return code;
}

export async function resolveDiligenceCodeClient(diligenceId) {
  const id = parseEntityId(diligenceId, 'id diligence');
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query(`
      SELECT TOP 1 RTRIM(LTRIM(code_client)) AS code_client
      FROM lab_diligences
      WHERE id = @id
    `);
  const code = cleanText(result.recordset?.[0]?.code_client);
  if (!code) {
    throw new LabDossierError('Diligence introuvable', 404);
  }
  return code;
}

export async function resolveRevueCodeClient(revueId) {
  const id = parseEntityId(revueId, 'id revue');
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query(`
      SELECT TOP 1 RTRIM(LTRIM(code_client)) AS code_client
      FROM lab_revues
      WHERE id = @id
    `);
  const code = cleanText(result.recordset?.[0]?.code_client);
  if (!code) {
    throw new LabDossierError('Revue introuvable', 404);
  }
  return code;
}

export async function getRevueEnCours(poolOrTransaction, codeClient) {
  const code = codeClient != null ? String(codeClient).trim() : '';
  if (!code) return null;
  const codeSafe = code.length > 10 ? code.slice(0, 10) : code;

  const request = poolOrTransaction instanceof sql.Transaction
    ? new sql.Request(poolOrTransaction)
    : poolOrTransaction.request();

  const result = await request
    .input('code_client', sql.NVarChar(10), codeSafe)
    .query(`
      SELECT TOP 1
        r.id,
        r.id_evenement,
        r.date_revue,
        r.statut
      FROM lab_revues r
      WHERE RTRIM(LTRIM(r.code_client)) = RTRIM(LTRIM(@code_client))
        AND RTRIM(LTRIM(r.statut)) = N'En_cours'
      ORDER BY r.id DESC
    `);

  const row = result.recordset?.[0];
  if (!row) return null;

  return {
    id: row.id,
    id_evenement: row.id_evenement ?? null,
    date_revue: row.date_revue ?? null,
    statut: cleanText(row.statut) || 'En_cours',
    wizard_url: buildWizardUrl(codeSafe, row.id),
  };
}

function extractSirenFromClientRow(row) {
  const digits = (value) => {
    const cleaned = cleanText(value);
    return cleaned ? cleaned.replace(/\D/g, '') : '';
  };
  const siren = digits(row?.siren);
  if (siren.length === 9) return siren;
  const siret = digits(row?.siret);
  if (siret.length >= 9) return siret.slice(0, 9);
  return '';
}

async function assertBodaccCriticalResolvedForRevue(pool, codeClient, checklistState) {
  const sirenRes = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1 siret
      FROM clients
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);
  const siren = extractSirenFromClientRow(sirenRes.recordset?.[0]);
  if (siren.length !== 9) {
    return;
  }

  const { fetchBodaccAlertes, countPendingCriticalBodacc } = await import('./lab-enrichment-service.js');
  const bodacc = await fetchBodaccAlertes(siren);
  if (!bodacc.ok) {
    throw new LabDossierError(
      bodacc.error || 'Impossible de vérifier les annonces BODACC — clôture refusée',
      503,
    );
  }

  const pending = countPendingCriticalBodacc(bodacc.alertes, checklistState);
  if (pending > 0) {
    throw new LabDossierError(
      `Clôture refusée : ${pending} annonce(s) BODACC critique(s) non traitée(s)`,
      400,
    );
  }
}

async function assertEvenementsOuvertsPourRevue(transaction, codeClient) {
  const result = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1
        e.id,
        e.type_evenement,
        e.statut
      FROM lab_evenements e
      WHERE RTRIM(LTRIM(e.code_client)) = RTRIM(LTRIM(@code_client))
        AND RTRIM(LTRIM(e.statut)) IN (N'Ouvert', N'En_cours')
        AND RTRIM(LTRIM(e.type_evenement)) != N'REVUE_ANNUELLE'
    `);

  const blocking = result.recordset?.[0];
  if (blocking) {
    throw new LabDossierError(
      'Impossible de lancer la revue : des événements sont encore ouverts sur le dossier',
      400,
    );
  }
}

async function captureDossierSnapshot(transaction, codeClient) {
  const clientRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1
        siret, raison_sociale, forme_societe, rcs, ape, activite, nature, tvaintracom,
        montant_capital_social, date_entree_cabinet, adr1_siege, adr2_siege, cpos_siege,
        ville_siege, tel_fixe, tel_portable, email, regime_fiscal, soumis_is, mois_cloture,
        logiciel_compta, expert_comptable, chef_de_mission
      FROM clients
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);

  const dossierRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1
        id, statut_dossier, niveau_risque, vigilance, id_responsable_lab,
        date_entree_relation, date_derniere_revue, date_prochaine_revue,
        periodicite_revue_mois, statut_kyc
      FROM lab_dossier
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);

  const kycRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1 *
      FROM lab_kyc
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);

  const beRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT *
      FROM lab_beneficiaires_effectifs
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
        AND RTRIM(LTRIM(actif)) = N'O'
    `);

  const piecesRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT *
      FROM lab_pieces_kyc
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);

  const evalRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1 *
      FROM lab_arpec_evaluations
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
        AND RTRIM(LTRIM(est_active)) = N'O'
      ORDER BY date_evaluation DESC, id DESC
    `);

  const maxEvalRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT MAX(id) AS max_eval_id
      FROM lab_arpec_evaluations
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);

  const activeEval = evalRes.recordset?.[0] ?? null;
  let arpecReponses = [];
  let arpecAxes = [];
  if (activeEval?.id != null) {
    const repRes = await new sql.Request(transaction)
      .input('id_evaluation', sql.Int, activeEval.id)
      .query(`
        SELECT id_evaluation, id_question, reponse, commentaire
        FROM lab_arpec_reponses
        WHERE id_evaluation = @id_evaluation
      `);
    arpecReponses = repRes.recordset || [];

    const axesRes = await new sql.Request(transaction)
      .input('id_evaluation', sql.Int, activeEval.id)
      .query(`
        SELECT id_evaluation, id_axe, nb_oui, niveau_axe
        FROM lab_arpec_evaluation_axes
        WHERE id_evaluation = @id_evaluation
      `);
    arpecAxes = axesRes.recordset || [];
  }

  return {
    captured_at: new Date().toISOString(),
    client: clientRes.recordset?.[0] ?? null,
    dossier: dossierRes.recordset?.[0] ?? null,
    kyc: kycRes.recordset?.[0] ?? null,
    beneficiaires: beRes.recordset || [],
    pieces: piecesRes.recordset || [],
    arpec: {
      evaluation: activeEval,
      reponses: arpecReponses,
      axes: arpecAxes,
      max_eval_id: maxEvalRes.recordset?.[0]?.max_eval_id ?? null,
    },
  };
}

async function restoreDossierSnapshot(transaction, codeClient, snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new LabDossierError('Snapshot de revue invalide', 500);
  }

  const client = snapshot.client;
  if (client) {
    await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeClient)
      .input('siret', sql.NChar(17), cleanText(client.siret))
      .input('raison_sociale', sql.NChar(100), cleanText(client.raison_sociale))
      .input('forme_societe', sql.NChar(30), cleanText(client.forme_societe))
      .input('rcs', sql.NChar(50), cleanText(client.rcs))
      .input('ape', sql.NChar(10), cleanText(client.ape))
      .input('activite', sql.NChar(100), cleanText(client.activite))
      .input('nature', sql.NChar(50), cleanText(client.nature))
      .input('tvaintracom', sql.NChar(20), cleanText(client.tvaintracom))
      .input('montant_capital_social', sql.Decimal(18, 2), client.montant_capital_social ?? null)
      .input('date_entree_cabinet', sql.Date, client.date_entree_cabinet ?? null)
      .input('adr1_siege', sql.NChar(50), cleanText(client.adr1_siege))
      .input('adr2_siege', sql.NChar(50), cleanText(client.adr2_siege))
      .input('cpos_siege', sql.NChar(10), cleanText(client.cpos_siege))
      .input('ville_siege', sql.NChar(50), cleanText(client.ville_siege))
      .input('tel_fixe', sql.NChar(20), cleanText(client.tel_fixe))
      .input('tel_portable', sql.NChar(20), cleanText(client.tel_portable))
      .input('email', sql.NChar(100), cleanText(client.email))
      .input('regime_fiscal', sql.NChar(30), cleanText(client.regime_fiscal))
      .input('soumis_is', sql.NChar(1), cleanText(client.soumis_is) || 'N')
      .input('mois_cloture', sql.Int, client.mois_cloture ?? null)
      .input('logiciel_compta', sql.NChar(50), cleanText(client.logiciel_compta))
      .input('expert_comptable', sql.NChar(20), cleanText(client.expert_comptable))
      .input('chef_de_mission', sql.NChar(20), cleanText(client.chef_de_mission))
      .query(`
        UPDATE clients
        SET
          siret = @siret,
          raison_sociale = @raison_sociale,
          forme_societe = @forme_societe,
          rcs = @rcs,
          ape = @ape,
          activite = @activite,
          nature = @nature,
          tvaintracom = @tvaintracom,
          montant_capital_social = @montant_capital_social,
          date_entree_cabinet = @date_entree_cabinet,
          adr1_siege = @adr1_siege,
          adr2_siege = @adr2_siege,
          cpos_siege = @cpos_siege,
          ville_siege = @ville_siege,
          tel_fixe = @tel_fixe,
          tel_portable = @tel_portable,
          email = @email,
          regime_fiscal = @regime_fiscal,
          soumis_is = @soumis_is,
          mois_cloture = @mois_cloture,
          logiciel_compta = @logiciel_compta,
          expert_comptable = @expert_comptable,
          chef_de_mission = @chef_de_mission
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
      `);
  }

  const dossier = snapshot.dossier;
  if (dossier) {
    await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeClient)
      .input('statut_dossier', sql.NChar(20), cleanText(dossier.statut_dossier) || 'Actif')
      .input('niveau_risque', sql.NChar(10), cleanText(dossier.niveau_risque) || 'Faible')
      .input('vigilance', sql.NChar(10), cleanText(dossier.vigilance) || 'Standard')
      .input('id_responsable_lab', sql.NChar(20), cleanText(dossier.id_responsable_lab))
      .input('date_entree_relation', sql.Date, dossier.date_entree_relation ?? null)
      .input('date_derniere_revue', sql.Date, dossier.date_derniere_revue ?? null)
      .input('date_prochaine_revue', sql.Date, dossier.date_prochaine_revue ?? null)
      .input('periodicite_revue_mois', sql.Int, dossier.periodicite_revue_mois ?? 12)
      .input('statut_kyc', sql.NChar(20), cleanText(dossier.statut_kyc) || 'Incomplet')
      .query(`
        UPDATE lab_dossier
        SET
          statut_dossier = @statut_dossier,
          niveau_risque = @niveau_risque,
          vigilance = @vigilance,
          id_responsable_lab = @id_responsable_lab,
          date_entree_relation = @date_entree_relation,
          date_derniere_revue = @date_derniere_revue,
          date_prochaine_revue = @date_prochaine_revue,
          periodicite_revue_mois = @periodicite_revue_mois,
          statut_kyc = @statut_kyc,
          date_modification = SYSUTCDATETIME()
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
      `);
  }

  const kyc = snapshot.kyc;
  const existingKyc = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1 id FROM lab_kyc
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);
  const existingKycId = existingKyc.recordset?.[0]?.id;

  if (kyc) {
    if (existingKycId != null) {
      await new sql.Request(transaction)
        .input('id', sql.Int, existingKycId)
        .input('secteur_activite', sql.NChar(100), cleanText(kyc.secteur_activite))
        .input('zone_geographique_principale', sql.NChar(60), cleanText(kyc.zone_geographique_principale))
        .input('volume_affaires_estime', sql.NChar(30), cleanText(kyc.volume_affaires_estime))
        .input('complexite_structure', sql.NChar(20), cleanText(kyc.complexite_structure))
        .input('pays_risque', sql.NVarChar(500), cleanText(kyc.pays_risque))
        .input('operations_internationales', sql.NChar(1), cleanText(kyc.operations_internationales) || 'N')
        .input('origine_fonds', sql.NVarChar(sql.MAX), cleanText(kyc.origine_fonds))
        .input('origine_patrimoine', sql.NVarChar(sql.MAX), cleanText(kyc.origine_patrimoine))
        .input('est_pep', sql.NChar(1), cleanText(kyc.est_pep) || 'N')
        .input('detail_pep', sql.NVarChar(500), cleanText(kyc.detail_pep))
        .input('lien_pep', sql.NChar(1), cleanText(kyc.lien_pep) || 'N')
        .input('detail_lien_pep', sql.NVarChar(500), cleanText(kyc.detail_lien_pep))
        .query(`
          UPDATE lab_kyc
          SET
            secteur_activite = @secteur_activite,
            zone_geographique_principale = @zone_geographique_principale,
            volume_affaires_estime = @volume_affaires_estime,
            complexite_structure = @complexite_structure,
            pays_risque = @pays_risque,
            operations_internationales = @operations_internationales,
            origine_fonds = @origine_fonds,
            origine_patrimoine = @origine_patrimoine,
            est_pep = @est_pep,
            detail_pep = @detail_pep,
            lien_pep = @lien_pep,
            detail_lien_pep = @detail_lien_pep,
            date_modification = SYSUTCDATETIME()
          WHERE id = @id
        `);
    } else {
      await new sql.Request(transaction)
        .input('code_client', sql.NVarChar(10), codeClient)
        .input('secteur_activite', sql.NChar(100), cleanText(kyc.secteur_activite))
        .input('zone_geographique_principale', sql.NChar(60), cleanText(kyc.zone_geographique_principale))
        .input('volume_affaires_estime', sql.NChar(30), cleanText(kyc.volume_affaires_estime))
        .input('complexite_structure', sql.NChar(20), cleanText(kyc.complexite_structure))
        .input('pays_risque', sql.NVarChar(500), cleanText(kyc.pays_risque))
        .input('operations_internationales', sql.NChar(1), cleanText(kyc.operations_internationales) || 'N')
        .input('origine_fonds', sql.NVarChar(sql.MAX), cleanText(kyc.origine_fonds))
        .input('origine_patrimoine', sql.NVarChar(sql.MAX), cleanText(kyc.origine_patrimoine))
        .input('est_pep', sql.NChar(1), cleanText(kyc.est_pep) || 'N')
        .input('detail_pep', sql.NVarChar(500), cleanText(kyc.detail_pep))
        .input('lien_pep', sql.NChar(1), cleanText(kyc.lien_pep) || 'N')
        .input('detail_lien_pep', sql.NVarChar(500), cleanText(kyc.detail_lien_pep))
        .query(`
          INSERT INTO lab_kyc (
            code_client, secteur_activite, zone_geographique_principale,
            volume_affaires_estime, complexite_structure, pays_risque,
            operations_internationales, origine_fonds, origine_patrimoine,
            est_pep, detail_pep, lien_pep, detail_lien_pep
          )
          VALUES (
            @code_client, @secteur_activite, @zone_geographique_principale,
            @volume_affaires_estime, @complexite_structure, @pays_risque,
            @operations_internationales, @origine_fonds, @origine_patrimoine,
            @est_pep, @detail_pep, @lien_pep, @detail_lien_pep
          )
        `);
    }
  } else if (existingKycId != null) {
    await new sql.Request(transaction)
      .input('id', sql.Int, existingKycId)
      .query(`DELETE FROM lab_kyc WHERE id = @id`);
  }

  const snapshotBe = Array.isArray(snapshot.beneficiaires) ? snapshot.beneficiaires : [];
  const snapshotBeIds = snapshotBe.map((b) => b.id).filter((id) => id != null);

  if (snapshotBeIds.length > 0) {
    const idList = snapshotBeIds.join(',');
    await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeClient)
      .input('date_fin', sql.Date, todayUtcDate())
      .query(`
        UPDATE lab_beneficiaires_effectifs
        SET actif = N'N', date_fin = @date_fin, date_modification = SYSUTCDATETIME()
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(actif)) = N'O'
          AND id NOT IN (${idList})
      `);
  } else {
    await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeClient)
      .input('date_fin', sql.Date, todayUtcDate())
      .query(`
        UPDATE lab_beneficiaires_effectifs
        SET actif = N'N', date_fin = @date_fin, date_modification = SYSUTCDATETIME()
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(actif)) = N'O'
      `);
  }

  for (const be of snapshotBe) {
    if (be.id == null) continue;
    await new sql.Request(transaction)
      .input('id', sql.Int, be.id)
      .input('nom', sql.NChar(50), cleanText(be.nom))
      .input('prenom', sql.NChar(30), cleanText(be.prenom))
      .input('nationalite', sql.NChar(40), cleanText(be.nationalite))
      .input('pays_residence', sql.NChar(40), cleanText(be.pays_residence))
      .input('pourcentage_detention', sql.Decimal(5, 2), be.pourcentage_detention ?? null)
      .input('pourcentage_controle_total', sql.Decimal(5, 2), be.pourcentage_controle_total ?? null)
      .input('type_controle', sql.NChar(30), cleanText(be.type_controle))
      .input('est_pep', sql.NChar(1), cleanText(be.est_pep) || 'N')
      .input('sous_sanctions', sql.NChar(1), cleanText(be.sous_sanctions) || 'N')
      .input('gel_avoirs', sql.NChar(1), cleanText(be.gel_avoirs) || 'N')
      .input('detail_statut', sql.NVarChar(500), cleanText(be.detail_statut))
      .input('actif', sql.NChar(1), 'O')
      .input('date_debut', sql.Date, be.date_debut ?? null)
      .input('date_fin', sql.Date, null)
      .query(`
        UPDATE lab_beneficiaires_effectifs
        SET
          nom = @nom,
          prenom = @prenom,
          nationalite = @nationalite,
          pays_residence = @pays_residence,
          pourcentage_detention = @pourcentage_detention,
          pourcentage_controle_total = @pourcentage_controle_total,
          type_controle = @type_controle,
          est_pep = @est_pep,
          sous_sanctions = @sous_sanctions,
          gel_avoirs = @gel_avoirs,
          detail_statut = @detail_statut,
          actif = @actif,
          date_debut = @date_debut,
          date_fin = @date_fin,
          date_modification = SYSUTCDATETIME()
        WHERE id = @id
      `);
  }

  const snapshotPieces = Array.isArray(snapshot.pieces) ? snapshot.pieces : [];
  const snapshotPieceIds = snapshotPieces.map((p) => p.id).filter((id) => id != null);

  if (snapshotPieceIds.length > 0) {
    const pieceIdList = snapshotPieceIds.join(',');
    await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeClient)
      .query(`
        DELETE FROM lab_pieces_kyc
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND id NOT IN (${pieceIdList})
      `);
  } else {
    await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeClient)
      .query(`
        DELETE FROM lab_pieces_kyc
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
      `);
  }

  for (const piece of snapshotPieces) {
    if (piece.id == null) continue;
    await new sql.Request(transaction)
      .input('id', sql.Int, piece.id)
      .input('type_piece', sql.NChar(50), cleanText(piece.type_piece) || 'Pièce KYC')
      .input('libelle', sql.NChar(200), cleanText(piece.libelle))
      .input('statut', sql.NChar(20), cleanText(piece.statut) || 'Attendue')
      .input('date_delivrance', sql.Date, piece.date_delivrance ?? null)
      .input('date_echeance', sql.Date, piece.date_echeance ?? null)
      .input('filepath', sql.NVarChar(500), cleanText(piece.filepath))
      .input('nom_fichier', sql.NVarChar(200), cleanText(piece.nom_fichier))
      .query(`
        UPDATE lab_pieces_kyc
        SET
          type_piece = @type_piece,
          libelle = @libelle,
          statut = @statut,
          date_delivrance = @date_delivrance,
          date_echeance = @date_echeance,
          filepath = @filepath,
          nom_fichier = @nom_fichier,
          date_modification = SYSUTCDATETIME()
        WHERE id = @id
      `);
  }

  const maxEvalId = snapshot.arpec?.max_eval_id ?? null;
  if (maxEvalId != null) {
    const newEvals = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeClient)
      .input('max_eval_id', sql.Int, maxEvalId)
      .query(`
        SELECT id FROM lab_arpec_evaluations
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND id > @max_eval_id
      `);
    for (const row of newEvals.recordset || []) {
      await new sql.Request(transaction)
        .input('id_evaluation', sql.Int, row.id)
        .query(`DELETE FROM lab_arpec_reponses WHERE id_evaluation = @id_evaluation`);
      await new sql.Request(transaction)
        .input('id_evaluation', sql.Int, row.id)
        .query(`DELETE FROM lab_arpec_evaluation_axes WHERE id_evaluation = @id_evaluation`);
      await new sql.Request(transaction)
        .input('id', sql.Int, row.id)
        .query(`DELETE FROM lab_arpec_evaluations WHERE id = @id`);
    }
  }

  await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      UPDATE lab_arpec_evaluations
      SET est_active = N'N'
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
        AND RTRIM(LTRIM(est_active)) = N'O'
    `);

  const snapshotEval = snapshot.arpec?.evaluation;
  if (snapshotEval?.id != null) {
    await new sql.Request(transaction)
      .input('id', sql.Int, snapshotEval.id)
      .input('niveau_calcule', sql.NChar(10), cleanText(snapshotEval.niveau_calcule))
      .input('niveau_retenu', sql.NChar(10), cleanText(snapshotEval.niveau_retenu))
      .input('modulation', sql.NChar(10), cleanText(snapshotEval.modulation) || 'Conforme')
      .input('justification_modulation', sql.NVarChar(500), cleanText(snapshotEval.justification_modulation))
      .input('vigilance', sql.NChar(10), cleanText(snapshotEval.vigilance) || 'Standard')
      .input('commentaire', sql.NVarChar(sql.MAX), cleanText(snapshotEval.commentaire))
      .query(`
        UPDATE lab_arpec_evaluations
        SET
          niveau_calcule = @niveau_calcule,
          niveau_retenu = @niveau_retenu,
          modulation = @modulation,
          justification_modulation = @justification_modulation,
          vigilance = @vigilance,
          commentaire = @commentaire,
          est_active = N'O'
        WHERE id = @id
      `);
  }
}

async function evaluateKycMaj(transaction, codeClient, revueOpenedAt = null) {
  if (revueOpenedAt) {
    const auditRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeClient)
      .input('since', sql.DateTime2, revueOpenedAt)
      .query(`
        SELECT TOP 1 id
        FROM lab_audit_log
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(type_action)) IN (N'MODIF_KYC', N'CREATION_KYC')
          AND date_action >= @since
      `);
    if (auditRes.recordset?.[0]) {
      return 'O';
    }
  }

  const dossierRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1 statut_kyc
      FROM lab_dossier
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);
  const statutKyc = cleanText(dossierRes.recordset?.[0]?.statut_kyc);
  if (statutKyc === 'Complet') return 'O';

  const kycRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1 origine_fonds, secteur_activite, zone_geographique_principale
      FROM lab_kyc
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);
  const kyc = kycRes.recordset?.[0];
  if (kyc && cleanText(kyc.origine_fonds) && cleanText(kyc.secteur_activite)) {
    return 'O';
  }
  return 'N';
}

async function evaluateRisqueVerifie(transaction, codeClient, revueOpenedAt = null) {
  const request = new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient);

  let query = `
      SELECT TOP 1 id
      FROM lab_arpec_evaluations
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
        AND RTRIM(LTRIM(est_active)) = N'O'
  `;
  if (revueOpenedAt) {
    request.input('since', sql.DateTime2, revueOpenedAt);
    query += ' AND date_evaluation >= @since';
  }
  query += ' ORDER BY date_evaluation DESC, id DESC';

  const result = await request.query(query);
  return result.recordset?.[0] ? 'O' : 'N';
}

async function evaluatePiecesCompletes(transaction, codeClient) {
  const result = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1 id
      FROM lab_pieces_kyc
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
        AND RTRIM(LTRIM(statut)) IN (N'Manquante', N'Perimee', N'Périmée')
    `);
  return result.recordset?.[0] ? 'N' : 'O';
}

async function buildRevuesReponses(transaction, codeClient, revueId, conclusionRisque, commentaires, revueOpenedAt = null) {
  const kycMaj = await evaluateKycMaj(transaction, codeClient, revueOpenedAt);
  const risqueVerifie = await evaluateRisqueVerifie(transaction, codeClient, revueOpenedAt);
  const piecesCompletes = await evaluatePiecesCompletes(transaction, codeClient);
  const conclusionComment = [
    conclusionRisque,
    cleanText(commentaires),
  ].filter(Boolean).join(' — ');

  const values = {
    KYC_MAJ: { reponse: kycMaj, commentaire: kycMaj === 'O' ? 'KYC conforme au moment de la clôture' : 'KYC incomplet' },
    RISQUE_VERIFIE: { reponse: risqueVerifie, commentaire: risqueVerifie === 'O' ? 'Évaluation ARPEC active' : 'Évaluation ARPEC absente' },
    PIECES_COMPLETES: { reponse: piecesCompletes, commentaire: piecesCompletes === 'O' ? 'Aucune pièce manquante ou périmée' : 'Pièces manquantes ou périmées détectées' },
    OPS_ATYPIQUES: { reponse: 'NA', commentaire: 'Hors périmètre MVP — pas d\'écran opérations atypiques' },
    CONCLUSION: { reponse: 'O', commentaire: conclusionComment || conclusionRisque },
  };

  for (const meta of REVUE_REPONSES_META) {
    const item = values[meta.code];
    const existing = await new sql.Request(transaction)
      .input('id_revue', sql.Int, revueId)
      .input('code_question', sql.NChar(50), meta.code)
      .query(`
        SELECT TOP 1 id
        FROM lab_revues_reponses
        WHERE id_revue = @id_revue AND RTRIM(LTRIM(code_question)) = RTRIM(LTRIM(@code_question))
      `);

    if (existing.recordset?.[0]?.id != null) {
      await new sql.Request(transaction)
        .input('id', sql.Int, existing.recordset[0].id)
        .input('reponse', sql.NChar(10), item.reponse)
        .input('commentaire', sql.NVarChar(sql.MAX), item.commentaire)
        .query(`
          UPDATE lab_revues_reponses
          SET reponse = @reponse, commentaire = @commentaire
          WHERE id = @id
        `);
    } else {
      await new sql.Request(transaction)
        .input('id_revue', sql.Int, revueId)
        .input('code_question', sql.NChar(50), meta.code)
        .input('libelle_question', sql.NChar(200), meta.libelle)
        .input('reponse', sql.NChar(10), item.reponse)
        .input('commentaire', sql.NVarChar(sql.MAX), item.commentaire)
        .query(`
          INSERT INTO lab_revues_reponses (
            id_revue, code_question, libelle_question, reponse, commentaire
          )
          VALUES (
            @id_revue, @code_question, @libelle_question, @reponse, @commentaire
          )
        `);
    }
  }
}

export async function createEvenementLab(payload, userId = null) {
  const code = payload?.code_client != null ? String(payload.code_client).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }
  const codeSafe = code;

  const typeEvenement = cleanText(payload?.type_evenement) || 'AUTRE';
  if (MANUAL_FORBIDDEN_EVENT_TYPES.has(typeEvenement)) {
    throw new LabDossierError(`Type d'événement réservé : ${typeEvenement}`, 400);
  }

  const libelle = cleanText(payload?.libelle) || defaultLibelleEvenement(typeEvenement);
  const criticite = normalizeCriticite(payload?.criticite ?? 'Moyenne');
  const statut = cleanText(payload?.statut) || 'Ouvert';
  if (!['Ouvert', 'En_cours'].includes(statut)) {
    throw new LabDossierError('statut invalide à la création (Ouvert ou En_cours)', 400);
  }

  const dateEvenement = payload?.date_evenement != null
    ? parseIsoDate(payload.date_evenement)
    : todayUtcDate();
  if (dateEvenement === undefined) {
    throw new LabDossierError('date_evenement invalide', 400);
  }

  let dateEcheance = null;
  if (payload?.date_echeance !== undefined) {
    if (payload.date_echeance == null || String(payload.date_echeance).trim() === '') {
      dateEcheance = null;
    } else {
      dateEcheance = parseIsoDate(payload.date_echeance);
      if (dateEcheance === undefined) {
        throw new LabDossierError('date_echeance invalide', 400);
      }
    }
  }

  const idResponsable = cleanText(payload?.id_responsable) || cleanText(userId);
  const creePar = cleanText(userId);
  const nestedDiligences = Array.isArray(payload?.diligences) ? payload.diligences : [];

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await assertClientExists(transaction, codeSafe);
    await assertDossierExists(transaction, codeSafe);

    const eventRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('type_evenement', sql.NChar(50), typeEvenement)
      .input('libelle', sql.NChar(200), libelle)
      .input('criticite', sql.NChar(10), criticite)
      .input('statut', sql.NChar(20), statut)
      .input('date_evenement', sql.Date, dateEvenement ?? todayUtcDate())
      .input('date_echeance', sql.Date, dateEcheance)
      .input('id_responsable', sql.NChar(20), idResponsable)
      .input('cree_par', sql.NChar(20), creePar)
      .query(`
        INSERT INTO lab_evenements (
          code_client, type_evenement, libelle, criticite, statut,
          date_evenement, date_echeance, id_responsable, cree_par, modifie_par
        )
        OUTPUT INSERTED.id
        VALUES (
          @code_client, @type_evenement, @libelle, @criticite, @statut,
          @date_evenement, @date_echeance, @id_responsable, @cree_par, @cree_par
        )
      `);

    const eventId = eventRes.recordset?.[0]?.id;
    if (eventId == null) {
      throw new Error('INSERT lab_evenements sans id retourné');
    }

    await writeLabAuditLog(transaction, {
      userId: creePar,
      typeAction: 'CREATION_EVENEMENT',
      entite: 'lab_evenements',
      idEntite: eventId,
      codeClient: codeSafe,
      detail: JSON.stringify({ type_evenement: typeEvenement, libelle, criticite, statut }),
    });

    for (const dil of nestedDiligences) {
      const intitule = cleanText(dil?.intitule);
      if (!intitule) {
        throw new LabDossierError('intitule requis pour chaque diligence', 400);
      }
      let dilEcheance = null;
      if (dil?.date_echeance != null && String(dil.date_echeance).trim() !== '') {
        dilEcheance = parseIsoDate(dil.date_echeance);
        if (dilEcheance === undefined) {
          throw new LabDossierError('date_echeance diligence invalide', 400);
        }
      }

      const dilRes = await new sql.Request(transaction)
        .input('id_evenement', sql.Int, eventId)
        .input('code_client', sql.NVarChar(10), codeSafe)
        .input('intitule', sql.NChar(200), intitule)
        .input('type_diligence', sql.NChar(50), cleanText(dil?.type_diligence) || 'Manuelle')
        .input('id_responsable', sql.NChar(20), cleanText(dil?.id_responsable) || idResponsable)
        .input('date_echeance', sql.Date, dilEcheance)
        .input('statut', sql.NChar(20), 'A_faire')
        .input('cree_par', sql.NChar(20), creePar)
        .query(`
          INSERT INTO lab_diligences (
            id_evenement, code_client, intitule, type_diligence,
            id_responsable, date_echeance, statut, cree_par, modifie_par
          )
          OUTPUT INSERTED.id
          VALUES (
            @id_evenement, @code_client, @intitule, @type_diligence,
            @id_responsable, @date_echeance, @statut, @cree_par, @cree_par
          )
        `);

      const dilId = dilRes.recordset?.[0]?.id;
      await writeLabAuditLog(transaction, {
        userId: creePar,
        typeAction: 'CREATION_DILIGENCE',
        entite: 'lab_diligences',
        idEntite: dilId,
        codeClient: codeSafe,
        detail: JSON.stringify({ id_evenement: eventId, intitule }),
      });
    }

    const data = await fetchEvenementEnriched(transaction, eventId);
    await transaction.commit();
    return data;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function updateEvenementLab(eventId, payload, userId = null) {
  const id = parseEntityId(eventId);
  const modifiePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const existing = await fetchEvenementById(transaction, id);
    const statut = cleanText(existing.statut);
    if (statut === 'Cloture') {
      throw new LabDossierError('Événement clôturé : modification interdite', 400);
    }
    if (cleanText(existing.type_evenement) === 'REVUE_ANNUELLE') {
      throw new LabDossierError('Événement REVUE_ANNUELLE : modification manuelle interdite', 400);
    }

    const sets = ['date_modification = SYSUTCDATETIME()', 'modifie_par = @modifie_par'];
    const request = new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('modifie_par', sql.NChar(20), modifiePar);

    if (payload?.libelle !== undefined) {
      request.input('libelle', sql.NChar(200), cleanText(payload.libelle));
      sets.push('libelle = @libelle');
    }
    if (payload?.criticite !== undefined) {
      request.input('criticite', sql.NChar(10), normalizeCriticite(payload.criticite));
      sets.push('criticite = @criticite');
    }
    if (payload?.statut !== undefined) {
      const newStatut = cleanText(payload.statut);
      if (!['Ouvert', 'En_cours'].includes(newStatut)) {
        throw new LabDossierError('statut invalide (Ouvert ou En_cours)', 400);
      }
      request.input('statut', sql.NChar(20), newStatut);
      sets.push('statut = @statut');
    }
    if (payload?.date_echeance !== undefined) {
      if (payload.date_echeance == null || String(payload.date_echeance).trim() === '') {
        request.input('date_echeance', sql.Date, null);
      } else {
        const dateEcheance = parseIsoDate(payload.date_echeance);
        if (dateEcheance === undefined) {
          throw new LabDossierError('date_echeance invalide', 400);
        }
        request.input('date_echeance', sql.Date, dateEcheance);
      }
      sets.push('date_echeance = @date_echeance');
    }
    if (payload?.id_responsable !== undefined) {
      request.input('id_responsable', sql.NChar(20), cleanText(payload.id_responsable));
      sets.push('id_responsable = @id_responsable');
    }

    if (sets.length <= 2) {
      throw new LabDossierError('Aucun champ modifiable fourni', 400);
    }

    await request.query(`
      UPDATE lab_evenements
      SET ${sets.join(', ')}
      WHERE id = @id
    `);

    const data = await fetchEvenementEnriched(transaction, id);
    await transaction.commit();
    return data;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function cloturerEvenementLab(eventId, payload, userId = null) {
  const id = parseEntityId(eventId);
  const conclusion = cleanText(payload?.conclusion);
  if (!conclusion) {
    throw new LabDossierError('conclusion requise pour clôturer l\'événement', 400);
  }

  const cloturePar = cleanText(userId);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const existing = await fetchEvenementById(transaction, id);
    const codeSafe = cleanText(existing.code_client);
    const typeEvenement = cleanText(existing.type_evenement);

    if (typeEvenement === 'REVUE_ANNUELLE') {
      throw new LabDossierError(
        'Clôture de REVUE_ANNUELLE via PUT /api/lab/revues/cloturer uniquement',
        400,
      );
    }
    if (cleanText(existing.statut) === 'Cloture') {
      throw new LabDossierError('Événement déjà clôturé', 400);
    }

    const openDiligences = await new sql.Request(transaction)
      .input('id_evenement', sql.Int, id)
      .query(`
        SELECT id, statut, motif_abandon
        FROM lab_diligences
        WHERE id_evenement = @id_evenement
          AND RTRIM(LTRIM(statut)) NOT IN (N'Realisee', N'Abandonnee')
      `);
    if ((openDiligences.recordset || []).length > 0) {
      throw new LabDossierError(
        'Toutes les diligences liées doivent être Réalisées ou Abandonnées avant clôture',
        400,
      );
    }

    const abandoned = await new sql.Request(transaction)
      .input('id_evenement', sql.Int, id)
      .query(`
        SELECT id FROM lab_diligences
        WHERE id_evenement = @id_evenement
          AND RTRIM(LTRIM(statut)) = N'Abandonnee'
          AND (motif_abandon IS NULL OR RTRIM(LTRIM(motif_abandon)) = N'')
      `);
    if ((abandoned.recordset || []).length > 0) {
      throw new LabDossierError('motif_abandon requis pour les diligences abandonnées', 400);
    }

    let tracfinDeclare = null;
    let tracfinCommentaire = null;
    if (typeEvenement === 'TRANSACTION_ATYPIQUE') {
      tracfinDeclare = cleanText(payload?.tracfin_declare)?.toUpperCase();
      if (tracfinDeclare !== 'O' && tracfinDeclare !== 'N') {
        throw new LabDossierError('tracfin_declare requis (O ou N) pour TRANSACTION_ATYPIQUE', 400);
      }
      if (tracfinDeclare === 'O') {
        tracfinCommentaire = cleanText(payload?.tracfin_commentaire);
        if (!tracfinCommentaire) {
          throw new LabDossierError('tracfin_commentaire requis si tracfin_declare = O', 400);
        }
      }
    }

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('conclusion', sql.NVarChar(sql.MAX), conclusion)
      .input('tracfin_declare', sql.NChar(1), tracfinDeclare)
      .input('tracfin_commentaire', sql.NVarChar(sql.MAX), tracfinCommentaire)
      .input('cloture_par', sql.NChar(20), cloturePar)
      .query(`
        UPDATE lab_evenements
        SET
          statut = N'Cloture',
          conclusion = @conclusion,
          tracfin_declare = @tracfin_declare,
          tracfin_commentaire = @tracfin_commentaire,
          date_cloture = SYSUTCDATETIME(),
          cloture_par = @cloture_par,
          date_modification = SYSUTCDATETIME(),
          modifie_par = @cloture_par
        WHERE id = @id
      `);

    await writeLabAuditLog(transaction, {
      userId: cloturePar,
      typeAction: 'CLOTURE_EVENEMENT',
      entite: 'lab_evenements',
      idEntite: id,
      codeClient: codeSafe,
      detail: JSON.stringify({ type_evenement: typeEvenement, conclusion }),
    });

    const data = await fetchEvenementEnriched(transaction, id);
    await transaction.commit();
    return data;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function createDiligenceLab(payload, userId = null) {
  const idEvenement = parseEntityId(payload?.id_evenement, 'id_evenement');
  const intitule = cleanText(payload?.intitule);
  if (!intitule) {
    throw new LabDossierError('intitule requis', 400);
  }

  const creePar = cleanText(userId);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const event = await fetchEvenementById(transaction, idEvenement);
    const eventStatut = cleanText(event.statut);
    if (!['Ouvert', 'En_cours'].includes(eventStatut)) {
      throw new LabDossierError('Diligence impossible : événement non ouvert', 400);
    }

    const codeSafe = cleanText(event.code_client);
    let dateEcheance = null;
    if (payload?.date_echeance != null && String(payload.date_echeance).trim() !== '') {
      dateEcheance = parseIsoDate(payload.date_echeance);
      if (dateEcheance === undefined) {
        throw new LabDossierError('date_echeance invalide', 400);
      }
    }

    const dilRes = await new sql.Request(transaction)
      .input('id_evenement', sql.Int, idEvenement)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('intitule', sql.NChar(200), intitule)
      .input('type_diligence', sql.NChar(50), cleanText(payload?.type_diligence) || 'Manuelle')
      .input('id_responsable', sql.NChar(20), cleanText(payload?.id_responsable) || cleanText(event.id_responsable) || creePar)
      .input('date_echeance', sql.Date, dateEcheance)
      .input('statut', sql.NChar(20), 'A_faire')
      .input('cree_par', sql.NChar(20), creePar)
      .query(`
        INSERT INTO lab_diligences (
          id_evenement, code_client, intitule, type_diligence,
          id_responsable, date_echeance, statut, cree_par, modifie_par
        )
        OUTPUT INSERTED.id
        VALUES (
          @id_evenement, @code_client, @intitule, @type_diligence,
          @id_responsable, @date_echeance, @statut, @cree_par, @cree_par
        )
      `);

    const dilId = dilRes.recordset?.[0]?.id;
    if (dilId == null) {
      throw new Error('INSERT lab_diligences sans id retourné');
    }

    await writeLabAuditLog(transaction, {
      userId: creePar,
      typeAction: 'CREATION_DILIGENCE',
      entite: 'lab_diligences',
      idEntite: dilId,
      codeClient: codeSafe,
      detail: JSON.stringify({ id_evenement: idEvenement, intitule }),
    });

    const data = await fetchDiligenceEnriched(transaction, dilId);
    await transaction.commit();
    return data;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function updateDiligenceLab(diligenceId, payload, userId = null) {
  const id = parseEntityId(diligenceId);
  const modifiePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const existingRes = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`
        SELECT id, code_client, statut, id_evenement
        FROM lab_diligences
        WHERE id = @id
      `);
    const existing = existingRes.recordset?.[0];
    if (!existing) {
      throw new LabDossierError('Diligence introuvable', 404);
    }

    const currentStatut = cleanText(existing.statut) || 'A_faire';
    const codeSafe = cleanText(existing.code_client);
    const sets = ['date_modification = SYSUTCDATETIME()', 'modifie_par = @modifie_par'];
    const request = new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('modifie_par', sql.NChar(20), modifiePar);

    let auditCloture = false;

    if (payload?.statut !== undefined) {
      const newStatut = cleanText(payload.statut);
      const allowed = DILIGENCE_STATUT_TRANSITIONS[currentStatut];
      if (!allowed || !allowed.has(newStatut)) {
        throw new LabDossierError(
          `Transition de statut invalide : ${currentStatut} → ${newStatut}`,
          400,
        );
      }
      if (newStatut === 'Abandonnee') {
        const motif = cleanText(payload?.motif_abandon);
        if (!motif) {
          throw new LabDossierError('motif_abandon requis pour Abandonnee', 400);
        }
        request.input('motif_abandon', sql.NVarChar(500), motif);
        sets.push('motif_abandon = @motif_abandon');
      }
      if (newStatut === 'Realisee') {
        request.input('date_realisation', sql.DateTime2, new Date());
        request.input('realise_par', sql.NChar(20), modifiePar);
        sets.push('date_realisation = @date_realisation');
        sets.push('realise_par = @realise_par');
      }
      request.input('statut', sql.NChar(20), newStatut);
      sets.push('statut = @statut');
      if (newStatut === 'Realisee' || newStatut === 'Abandonnee') {
        auditCloture = true;
      }
    }

    if (payload?.date_echeance !== undefined) {
      if (payload.date_echeance == null || String(payload.date_echeance).trim() === '') {
        request.input('date_echeance', sql.Date, null);
      } else {
        const dateEcheance = parseIsoDate(payload.date_echeance);
        if (dateEcheance === undefined) {
          throw new LabDossierError('date_echeance invalide', 400);
        }
        request.input('date_echeance', sql.Date, dateEcheance);
      }
      sets.push('date_echeance = @date_echeance');
    }
    if (payload?.commentaires !== undefined) {
      request.input('commentaires', sql.NVarChar(sql.MAX), cleanText(payload.commentaires));
      sets.push('commentaires = @commentaires');
    }
    if (payload?.ref_piece_jointe !== undefined) {
      request.input('ref_piece_jointe', sql.NVarChar(500), cleanText(payload.ref_piece_jointe));
      sets.push('ref_piece_jointe = @ref_piece_jointe');
    }

    if (sets.length <= 2) {
      throw new LabDossierError('Aucun champ modifiable fourni', 400);
    }

    await request.query(`
      UPDATE lab_diligences
      SET ${sets.join(', ')}
      WHERE id = @id
    `);

    if (auditCloture) {
      await writeLabAuditLog(transaction, {
        userId: modifiePar,
        typeAction: 'CLOTURE_DILIGENCE',
        entite: 'lab_diligences',
        idEntite: id,
        codeClient: codeSafe,
        detail: JSON.stringify({
          statut: cleanText(payload?.statut),
          id_evenement: existing.id_evenement,
        }),
      });
    }

    const data = await fetchDiligenceEnriched(transaction, id);
    await transaction.commit();
    return data;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function getRevuesLab(codeClient) {
  const code = codeClient != null ? String(codeClient).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  const codeSafe = code.length > 10 ? code.slice(0, 10) : code;

  const pool = await poolPromise;
  const revuesRes = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeSafe)
    .query(`
      SELECT
        r.id,
        r.code_client,
        r.id_evenement,
        r.type_revue,
        r.date_revue,
        r.id_responsable,
        r.statut,
        r.conclusion_risque,
        r.commentaires_conclusion,
        r.niveau_risque_avant,
        r.niveau_risque_apres,
        r.date_cloture,
        responsable.nom AS responsable_nom,
        responsable.prenom AS responsable_prenom
      FROM lab_revues r
      LEFT JOIN collaborateurs responsable
        ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(r.id_responsable))
      WHERE RTRIM(LTRIM(r.code_client)) = RTRIM(LTRIM(@code_client))
      ORDER BY r.date_revue DESC, r.id DESC
    `);

  const reponsesRes = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeSafe)
    .query(`
      SELECT
        rr.id,
        rr.id_revue,
        rr.code_question,
        rr.libelle_question,
        rr.reponse,
        rr.commentaire
      FROM lab_revues_reponses rr
      INNER JOIN lab_revues r ON r.id = rr.id_revue
      WHERE RTRIM(LTRIM(r.code_client)) = RTRIM(LTRIM(@code_client))
      ORDER BY rr.id_revue DESC, rr.id ASC
    `);

  const reponsesByRevue = new Map();
  for (const row of reponsesRes.recordset || []) {
    const revueId = row.id_revue;
    if (!reponsesByRevue.has(revueId)) {
      reponsesByRevue.set(revueId, []);
    }
    reponsesByRevue.get(revueId).push({
      code_question: cleanText(row.code_question),
      libelle_question: cleanText(row.libelle_question),
      reponse: cleanText(row.reponse),
      commentaire: cleanText(row.commentaire),
    });
  }

  const data = (revuesRes.recordset || []).map((row) => ({
    id: row.id,
    code_client: cleanText(row.code_client),
    id_evenement: row.id_evenement ?? null,
    type_revue: cleanText(row.type_revue) || 'Annuelle',
    date_revue: row.date_revue ?? null,
    statut: normalizeStatutRevue(row.statut),
    conclusion_risque: cleanText(row.conclusion_risque),
    commentaires_conclusion: cleanText(row.commentaires_conclusion),
    niveau_risque_avant: normalizeNiveauRisque(row.niveau_risque_avant),
    niveau_risque_apres: normalizeNiveauRisque(row.niveau_risque_apres),
    date_cloture: row.date_cloture ?? null,
    responsable: formatCollaborateur(row.responsable_prenom, row.responsable_nom, row.id_responsable),
    reponses: reponsesByRevue.get(row.id) || [],
  }));

  return { data, total: data.length };
}

export async function createRevueLab(payload, userId = null) {
  const code = payload?.code_client != null ? String(payload.code_client).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }
  const codeSafe = code;

  const dateRevue = payload?.date_revue != null
    ? parseIsoDate(payload.date_revue)
    : todayUtcDate();
  if (dateRevue === undefined) {
    throw new LabDossierError('date_revue invalide', 400);
  }

  const idResponsable = cleanText(payload?.id_responsable) || cleanText(userId);
  const creePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await assertClientExists(transaction, codeSafe);
    await assertDossierExists(transaction, codeSafe);

    const enCours = await getRevueEnCours(transaction, codeSafe);
    if (enCours) {
      throw new LabDossierError('Une revue est déjà en cours pour ce dossier', 409);
    }

    await assertEvenementsOuvertsPourRevue(transaction, codeSafe);

    const dossierRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .query(`
        SELECT TOP 1 niveau_risque
        FROM lab_dossier
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
      `);
    const niveauRisqueAvant = normalizeNiveauRisqueForStorage(
      dossierRes.recordset?.[0]?.niveau_risque,
    );

    const snapshot = await captureDossierSnapshot(transaction, codeSafe);

    const eventRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('type_evenement', sql.NChar(50), 'REVUE_ANNUELLE')
      .input('libelle', sql.NChar(200), 'Revue périodique')
      .input('criticite', sql.NChar(10), 'Moyenne')
      .input('statut', sql.NChar(20), 'Ouvert')
      .input('date_evenement', sql.Date, dateRevue ?? todayUtcDate())
      .input('id_responsable', sql.NChar(20), idResponsable)
      .input('cree_par', sql.NChar(20), creePar)
      .query(`
        INSERT INTO lab_evenements (
          code_client, type_evenement, libelle, criticite, statut,
          date_evenement, id_responsable, cree_par, modifie_par
        )
        OUTPUT INSERTED.id
        VALUES (
          @code_client, @type_evenement, @libelle, @criticite, @statut,
          @date_evenement, @id_responsable, @cree_par, @cree_par
        )
      `);

    const eventId = eventRes.recordset?.[0]?.id;
    if (eventId == null) {
      throw new Error('INSERT lab_evenements REVUE_ANNUELLE sans id retourné');
    }

    const revueRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('id_evenement', sql.Int, eventId)
      .input('type_revue', sql.NChar(30), 'Annuelle')
      .input('date_revue', sql.Date, dateRevue ?? todayUtcDate())
      .input('id_responsable', sql.NChar(20), idResponsable)
      .input('statut', sql.NChar(20), 'En_cours')
      .input('niveau_risque_avant', sql.NChar(10), niveauRisqueAvant)
      .query(`
        INSERT INTO lab_revues (
          code_client, id_evenement, type_revue, date_revue,
          id_responsable, statut, niveau_risque_avant
        )
        OUTPUT INSERTED.id
        VALUES (
          @code_client, @id_evenement, @type_revue, @date_revue,
          @id_responsable, @statut, @niveau_risque_avant
        )
      `);

    const revueId = revueRes.recordset?.[0]?.id;
    if (revueId == null) {
      throw new Error('INSERT lab_revues sans id retourné');
    }

    const snapshotDetail = JSON.stringify(snapshot);
    await writeLabAuditLog(transaction, {
      userId: creePar,
      typeAction: 'CREATION_REVUE',
      entite: 'lab_revues',
      idEntite: revueId,
      codeClient: codeSafe,
      detail: snapshotDetail,
    });

    await writeLabAuditLog(transaction, {
      userId: creePar,
      typeAction: 'CREATION_EVENEMENT',
      entite: 'lab_evenements',
      idEntite: eventId,
      codeClient: codeSafe,
      detail: JSON.stringify({ type_evenement: 'REVUE_ANNUELLE', id_revue: revueId }),
    });

    await transaction.commit();

    return {
      revue: {
        id: revueId,
        code_client: codeSafe,
        id_evenement: eventId,
        statut: 'En_cours',
        date_revue: dateRevue ?? todayUtcDate(),
      },
      evenement: {
        id: eventId,
        type_evenement: 'REVUE_ANNUELLE',
        statut: 'Ouvert',
      },
      wizard_url: buildWizardUrl(codeSafe, revueId),
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function cloturerRevueLab(revueId, payload, userId = null) {
  const id = parseEntityId(revueId);
  const cloturePar = cleanText(userId);
  const options = payload?.options && typeof payload.options === 'object' ? payload.options : {};
  const checklistState = options.bodacc_checklist && typeof options.bodacc_checklist === 'object'
    ? options.bodacc_checklist
    : {};

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const revueRes = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`
        SELECT TOP 1 *
        FROM lab_revues
        WHERE id = @id
      `);
    const revue = revueRes.recordset?.[0];
    if (!revue) {
      throw new LabDossierError('Revue introuvable', 404);
    }
    if (cleanText(revue.statut) !== 'En_cours') {
      throw new LabDossierError('Seule une revue En_cours peut être clôturée', 400);
    }

    const codeSafe = cleanText(revue.code_client);
    await assertBodaccCriticalResolvedForRevue(pool, codeSafe, checklistState);
    const niveauAvant = cleanText(revue.niveau_risque_avant);
    const revueOpenedAt = revue.date_creation ?? revue.date_revue;
    if (!revueOpenedAt) {
      throw new LabDossierError('Date d\'ouverture de la revue introuvable', 500);
    }

    const evalRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('since', sql.DateTime2, revueOpenedAt)
      .query(`
        SELECT TOP 1 niveau_retenu
        FROM lab_arpec_evaluations
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(est_active)) = N'O'
          AND date_evaluation >= @since
        ORDER BY date_evaluation DESC, id DESC
      `);
    const niveauApresRaw = cleanText(evalRes.recordset?.[0]?.niveau_retenu);
    if (!niveauApresRaw) {
      throw new LabDossierError('Évaluation ARPEC de la session requise pour clôturer la revue', 400);
    }
    const niveauApres = normalizeNiveauRisqueForStorage(niveauApresRaw);
    const conclusionRisque = computeConclusionRisque(niveauAvant, niveauApres);
    const commentaires = cleanText(payload?.commentaires_conclusion);

    await buildRevuesReponses(transaction, codeSafe, id, conclusionRisque, commentaires, revueOpenedAt);

    const today = todayUtcDate();

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('conclusion_risque', sql.NChar(20), conclusionRisque)
      .input('commentaires_conclusion', sql.NVarChar(sql.MAX), commentaires)
      .input('niveau_risque_apres', sql.NChar(10), niveauApres)
      .input('cloture_par', sql.NChar(20), cloturePar)
      .query(`
        UPDATE lab_revues
        SET
          statut = N'Cloturee',
          conclusion_risque = @conclusion_risque,
          commentaires_conclusion = @commentaires_conclusion,
          niveau_risque_apres = @niveau_risque_apres,
          date_cloture = SYSUTCDATETIME(),
          cloture_par = @cloture_par,
          date_modification = SYSUTCDATETIME()
        WHERE id = @id
      `);

    const eventId = revue.id_evenement;
    if (eventId != null) {
      const autoConclusion = [
        'Revue périodique clôturée',
        `Conclusion risque : ${conclusionRisque}`,
        commentaires,
      ].filter(Boolean).join(' — ');

      await new sql.Request(transaction)
        .input('id', sql.Int, eventId)
        .input('conclusion', sql.NVarChar(sql.MAX), autoConclusion)
        .input('cloture_par', sql.NChar(20), cloturePar)
        .query(`
          UPDATE lab_evenements
          SET
            statut = N'Cloture',
            conclusion = @conclusion,
            date_cloture = SYSUTCDATETIME(),
            cloture_par = @cloture_par,
            date_modification = SYSUTCDATETIME(),
            modifie_par = @cloture_par
          WHERE id = @id
        `);

      await writeLabAuditLog(transaction, {
        userId: cloturePar,
        typeAction: 'CLOTURE_EVENEMENT',
        entite: 'lab_evenements',
        idEntite: eventId,
        codeClient: codeSafe,
        detail: JSON.stringify({ type_evenement: 'REVUE_ANNUELLE', source: 'cloture_revue' }),
      });
    }

    const dossierRes = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .query(`
        SELECT TOP 1 periodicite_revue_mois
        FROM lab_dossier
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
      `);
    const periodicite = dossierRes.recordset?.[0]?.periodicite_revue_mois ?? 12;
    const dateProchaine = addMonthsUtc(today, periodicite);

    await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), codeSafe)
      .input('date_derniere_revue', sql.Date, today)
      .input('date_prochaine_revue', sql.Date, dateProchaine)
      .input('modifie_par', sql.NChar(20), cloturePar)
      .query(`
        UPDATE lab_dossier
        SET
          date_derniere_revue = @date_derniere_revue,
          date_prochaine_revue = @date_prochaine_revue,
          date_modification = SYSUTCDATETIME(),
          modifie_par = @modifie_par
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
      `);

    await writeLabAuditLog(transaction, {
      userId: cloturePar,
      typeAction: 'CLOTURE_REVUE',
      entite: 'lab_revues',
      idEntite: id,
      codeClient: codeSafe,
      detail: JSON.stringify({
        conclusion_risque: conclusionRisque,
        niveau_risque_avant: niveauAvant,
        niveau_risque_apres: niveauApres,
        source: cleanText(options.source) || 'wizard_revision',
      }),
    });

    await transaction.commit();

    return {
      id,
      code_client: codeSafe,
      statut: 'Cloturee',
      conclusion_risque: conclusionRisque,
      niveau_risque_avant: normalizeNiveauRisque(niveauAvant),
      niveau_risque_apres: normalizeNiveauRisque(niveauApres),
      date_derniere_revue: today,
      date_prochaine_revue: dateProchaine,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function annulerRevueLab(revueId, userId = null) {
  const id = parseEntityId(revueId);
  const annulePar = cleanText(userId);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const revueRes = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 * FROM lab_revues WHERE id = @id`);
    const revue = revueRes.recordset?.[0];
    if (!revue) {
      throw new LabDossierError('Revue introuvable', 404);
    }
    if (cleanText(revue.statut) !== 'En_cours') {
      throw new LabDossierError('Seule une revue En_cours peut être annulée', 400);
    }

    const codeSafe = cleanText(revue.code_client);
    const auditRes = await new sql.Request(transaction)
      .input('id_entite', sql.NVarChar(50), String(id))
      .input('code_client', sql.NVarChar(10), codeSafe)
      .query(`
        SELECT TOP 1 detail
        FROM lab_audit_log
        WHERE type_action = N'CREATION_REVUE'
          AND entite = N'lab_revues'
          AND id_entite = @id_entite
          AND RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
        ORDER BY date_action DESC, id DESC
      `);

    const detailRaw = cleanText(auditRes.recordset?.[0]?.detail);
    if (!detailRaw) {
      throw new LabDossierError('Snapshot de revue introuvable pour annulation', 500);
    }

    let snapshot;
    try {
      snapshot = JSON.parse(detailRaw);
    } catch {
      throw new LabDossierError('Snapshot de revue corrompu', 500);
    }

    await restoreDossierSnapshot(transaction, codeSafe, snapshot);

    const eventId = revue.id_evenement;

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`
        UPDATE lab_revues
        SET
          statut = N'Annulee',
          id_evenement = NULL,
          date_modification = SYSUTCDATETIME()
        WHERE id = @id
      `);

    await new sql.Request(transaction)
      .input('id_revue', sql.Int, id)
      .query(`DELETE FROM lab_revues_reponses WHERE id_revue = @id_revue`);

    if (eventId != null) {
      await new sql.Request(transaction)
        .input('id_evenement', sql.Int, eventId)
        .query(`DELETE FROM lab_diligences WHERE id_evenement = @id_evenement`);

      await new sql.Request(transaction)
        .input('id', sql.Int, eventId)
        .query(`DELETE FROM lab_evenements WHERE id = @id`);
    }

    await writeLabAuditLog(transaction, {
      userId: annulePar,
      typeAction: 'ANNULATION_REVUE',
      entite: 'lab_revues',
      idEntite: id,
      codeClient: codeSafe,
      detail: JSON.stringify({ id_evenement: eventId, restored: true }),
    });

    await transaction.commit();

    return {
      id,
      code_client: codeSafe,
      statut: 'Annulee',
      revue_en_cours: null,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function getTransactionsLab(filters = {}, scope = { isFull: true, idSellsy: null }) {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    const clauses = buildOptionalFilters(request, filters, {
      code_client: { column: 'RTRIM(LTRIM(t.code_client))', type: sql.NVarChar(10) },
      statut: { column: 'RTRIM(LTRIM(t.statut))', type: sql.NVarChar(20) },
    });
    const scopeClause = buildScopeClause(scope, 't.code_client');
    if (scopeClause) {
      request.input(scopeClause.input.name, scopeClause.input.type, scopeClause.input.value);
      clauses.push(scopeClause.clause);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await request.query(`
      SELECT
        t.id,
        t.code_client,
        c.raison_sociale,
        t.id_evenement,
        e.type_evenement,
        t.fec_annee,
        t.fec_ecriture_num,
        t.fec_ecriture_date,
        t.fec_montant,
        t.fec_libelle,
        t.fec_journal_code,
        t.motif_atypique,
        t.statut,
        t.signale_par,
        t.date_signalement,
        signaleur.nom AS signaleur_nom,
        signaleur.prenom AS signaleur_prenom
      FROM lab_transactions_atypiques t
      LEFT JOIN lab_evenements e ON e.id = t.id_evenement
      LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(t.code_client))
      LEFT JOIN collaborateurs signaleur ON RTRIM(LTRIM(signaleur.id_sellsy)) = RTRIM(LTRIM(t.signale_par))
      ${where}
      ORDER BY t.date_signalement DESC, t.id DESC
    `);

    const data = (result.recordset || []).map((row) => ({
      id: row.id,
      code_client: cleanText(row.code_client),
      client: cleanText(row.raison_sociale),
      id_evenement: row.id_evenement ?? null,
      type_evenement: cleanText(row.type_evenement),
      fec_annee: row.fec_annee ?? null,
      fec_ecriture_num: cleanText(row.fec_ecriture_num),
      fec_ecriture_date: row.fec_ecriture_date ?? null,
      fec_montant: row.fec_montant ?? null,
      fec_libelle: cleanText(row.fec_libelle),
      fec_journal_code: cleanText(row.fec_journal_code),
      motif_atypique: cleanText(row.motif_atypique),
      statut: cleanText(row.statut),
      signale_par: formatCollaborateur(row.signaleur_prenom, row.signaleur_nom, row.signale_par),
      date_signalement: row.date_signalement ?? null,
    }));
    return { data, total: data.length };
  } catch (err) {
    console.error('Erreur getTransactionsLab:', err);
    throw err;
  }
}

export async function getTracfinLab(filters = {}, scope = { isFull: true, idSellsy: null }) {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    const clauses = buildOptionalFilters(request, filters, {
      code_client: { column: 'RTRIM(LTRIM(t.code_client))', type: sql.NVarChar(10) },
      statut: { column: 'RTRIM(LTRIM(t.statut))', type: sql.NVarChar(30) },
    });
    const scopeClause = buildScopeClause(scope, 't.code_client');
    if (scopeClause) {
      request.input(scopeClause.input.name, scopeClause.input.type, scopeClause.input.value);
      clauses.push(scopeClause.clause);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await request.query(`
      SELECT
        t.id,
        t.code_client,
        c.raison_sociale,
        t.id_evenement,
        e.type_evenement,
        t.nature_soupcon,
        t.description_operations,
        t.montants_concernes,
        t.periode_concernee_debut,
        t.periode_concernee_fin,
        t.diligences_effectuees,
        t.statut,
        t.date_declaration,
        t.reference_declaration,
        t.declare_par,
        declarant.nom AS declarant_nom,
        declarant.prenom AS declarant_prenom
      FROM lab_tracfin t
      LEFT JOIN lab_evenements e ON e.id = t.id_evenement
      LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(t.code_client))
      LEFT JOIN collaborateurs declarant ON RTRIM(LTRIM(declarant.id_sellsy)) = RTRIM(LTRIM(t.declare_par))
      ${where}
      ORDER BY t.date_creation DESC, t.id DESC
    `);

    const data = (result.recordset || []).map((row) => ({
      id: row.id,
      code_client: cleanText(row.code_client),
      client: cleanText(row.raison_sociale),
      id_evenement: row.id_evenement ?? null,
      type_evenement: cleanText(row.type_evenement),
      nature_soupcon: cleanText(row.nature_soupcon),
      description_operations: cleanText(row.description_operations),
      montants_concernes: cleanText(row.montants_concernes),
      periode_concernee_debut: row.periode_concernee_debut ?? null,
      periode_concernee_fin: row.periode_concernee_fin ?? null,
      diligences_effectuees: cleanText(row.diligences_effectuees),
      statut: cleanText(row.statut),
      date_declaration: row.date_declaration ?? null,
      reference_declaration: cleanText(row.reference_declaration),
      declare_par: formatCollaborateur(row.declarant_prenom, row.declarant_nom, row.declare_par),
    }));
    return { data, total: data.length };
  } catch (err) {
    console.error('Erreur getTracfinLab:', err);
    throw err;
  }
}

export async function getParametrageLab() {
  try {
    const pool = await poolPromise;
    const [paramsResult, criteresResult, valeursResult] = await Promise.all([
      pool.request().query(`
        SELECT id, code_param, libelle, valeur, version, actif, date_modification, modifie_par
        FROM lab_parametrage
        ORDER BY code_param ASC, version DESC
      `),
      pool.request().query(`
        SELECT id, code_critere, libelle, ponderation, actif, ordre_affichage
        FROM lab_scoring_criteres
        ORDER BY ISNULL(ordre_affichage, 999), code_critere
      `),
      pool.request().query(`
        SELECT v.id, v.id_critere, c.code_critere, v.valeur, v.libelle, v.niveau_risque, v.score
        FROM lab_scoring_valeurs_ref v
        LEFT JOIN lab_scoring_criteres c ON c.id = v.id_critere
        ORDER BY c.code_critere, v.score DESC
      `),
    ]);

    return {
      parametrage: (paramsResult.recordset || []).map((row) => ({
        id: row.id,
        code_param: cleanText(row.code_param),
        libelle: cleanText(row.libelle),
        valeur: cleanText(row.valeur),
        version: row.version ?? null,
        actif: yesNoUnknown(row.actif),
        date_modification: row.date_modification ?? null,
        modifie_par: cleanText(row.modifie_par),
      })),
      criteres: (criteresResult.recordset || []).map((row) => ({
        id: row.id,
        code_critere: cleanText(row.code_critere),
        libelle: cleanText(row.libelle),
        ponderation: toNumberOrNull(row.ponderation),
        actif: yesNoUnknown(row.actif),
        ordre_affichage: row.ordre_affichage ?? null,
      })),
      valeurs_ref: (valeursResult.recordset || []).map((row) => ({
        id: row.id,
        id_critere: row.id_critere,
        code_critere: cleanText(row.code_critere),
        valeur: cleanText(row.valeur),
        libelle: cleanText(row.libelle),
        niveau_risque: normalizeNiveauRisque(row.niveau_risque),
        score: toNumberOrNull(row.score),
      })),
    };
  } catch (err) {
    console.error('Erreur getParametrageLab:', err);
    throw err;
  }
}

/**
 * Fiche dossier LAB pour l'écran /lab/dossier.
 * Jointure lab_dossier + clients pour remonter à la fois les infos client
 * (identité, coordonnées, juridique/fiscal, équipe cabinet) et les données LAB
 * (statuts, risque, revue) enrichies des agrégats événements / diligences.
 *
 * @param {string} codeClient
 * @returns {Promise<{ client: object, lab: object }|null>}
 */
export async function getDossierLab(codeClient) {
  try {
    const code = codeClient != null ? String(codeClient).trim() : '';
    if (!code) {
      return null;
    }

    const pool = await poolPromise;
    const query = `
      SELECT
        -- Identification
        c.code_client,

        -- Bloc client (issu de la table clients)
        c.raison_sociale            AS c_raison_sociale,
        c.forme_societe             AS c_forme_societe,
        c.siret                     AS c_siret,
        c.ape                       AS c_ape,
        c.activite                  AS c_activite,
        c.nature                    AS c_nature,
        c.rcs                       AS c_rcs,
        c.tvaintracom               AS c_tvaintracom,
        c.montant_capital_social    AS c_montant_capital_social,
        c.date_entree_cabinet       AS c_date_entree_cabinet,
        c.adr1_siege                AS c_adr1_siege,
        c.adr2_siege                AS c_adr2_siege,
        c.cpos_siege                AS c_cpos_siege,
        c.ville_siege               AS c_ville_siege,
        c.tel_fixe                  AS c_tel_fixe,
        c.tel_portable              AS c_tel_portable,
        c.email                     AS c_email,
        c.regime_fiscal             AS c_regime_fiscal,
        c.soumis_is                 AS c_soumis_is,
        c.mois_cloture              AS c_mois_cloture,
        c.logiciel_compta           AS c_logiciel_compta,
        c.expert_comptable          AS c_expert_comptable,
        c.chef_de_mission           AS c_chef_de_mission,

        -- Noms des collaborateurs (expert-comptable, chef de mission, responsable LAB)
        collab_exp.nom              AS c_expert_comptable_nom,
        collab_exp.prenom           AS c_expert_comptable_prenom,
        collab_chef.nom             AS c_chef_de_mission_nom,
        collab_chef.prenom          AS c_chef_de_mission_prenom,
        collab_lab.nom              AS l_responsable_lab_nom,
        collab_lab.prenom           AS l_responsable_lab_prenom,

        -- Bloc lab_dossier (toutes les colonnes utiles pour l'écran)
        d.id                        AS l_id,
        d.statut_dossier            AS l_statut_dossier,
        d.niveau_risque             AS l_niveau_risque,
        d.vigilance                 AS l_vigilance,
        d.id_responsable_lab        AS l_id_responsable_lab,
        d.date_entree_relation      AS l_date_entree_relation,
        d.date_derniere_revue       AS l_date_derniere_revue,
        d.date_prochaine_revue      AS l_date_prochaine_revue,
        d.periodicite_revue_mois    AS l_periodicite_revue_mois,
        d.statut_kyc                AS l_statut_kyc,
        d.date_creation             AS l_date_creation,
        d.date_modification         AS l_date_modification,
        d.cree_par                  AS l_cree_par,
        d.modifie_par               AS l_modifie_par,

        -- Agrégats (mêmes règles que getResumeLab)
        (SELECT COUNT(*)
         FROM lab_evenements e
         WHERE RTRIM(LTRIM(e.code_client)) = RTRIM(LTRIM(@code_client))
           AND e.statut != 'Cloture') AS l_nb_evenements_ouverts,
        (SELECT COUNT(*)
         FROM lab_diligences di
         WHERE RTRIM(LTRIM(di.code_client)) = RTRIM(LTRIM(@code_client))
           AND di.date_echeance IS NOT NULL
           AND di.date_echeance < CAST(GETDATE() AS DATE)
           AND di.statut NOT IN ('Realisee', 'Abandonnee')) AS l_nb_diligences_retard
      FROM clients c
      LEFT JOIN lab_dossier d
        ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(d.code_client))
      LEFT JOIN collaborateurs collab_exp
        ON RTRIM(LTRIM(collab_exp.id_sellsy)) = RTRIM(LTRIM(c.expert_comptable))
      LEFT JOIN collaborateurs collab_chef
        ON RTRIM(LTRIM(collab_chef.id_sellsy)) = RTRIM(LTRIM(c.chef_de_mission))
      LEFT JOIN collaborateurs collab_lab
        ON RTRIM(LTRIM(collab_lab.id_sellsy)) = RTRIM(LTRIM(d.id_responsable_lab))
      WHERE RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(@code_client))
    `;

    const codeSafe = code.length > 10 ? code.slice(0, 10) : code;
    const result = await pool
      .request()
      .input('code_client', sql.NVarChar(10), codeSafe)
      .query(query);

    const row = result.recordset?.[0];
    if (!row) {
      return null;
    }

    const key = row.code_client != null ? String(row.code_client).trim() : code;

    const client = {
      code_client: key,
      raison_sociale: cleanText(row.c_raison_sociale),
      forme_societe: cleanText(row.c_forme_societe),
      siret: cleanText(row.c_siret),
      ape: cleanText(row.c_ape),
      activite: cleanText(row.c_activite),
      nature: cleanText(row.c_nature),
      rcs: cleanText(row.c_rcs),
      tvaintracom: cleanText(row.c_tvaintracom),
      montant_capital_social: row.c_montant_capital_social ?? null,
      date_entree_cabinet: row.c_date_entree_cabinet ?? null,
      adr1_siege: cleanText(row.c_adr1_siege),
      adr2_siege: cleanText(row.c_adr2_siege),
      cpos_siege: cleanText(row.c_cpos_siege),
      ville_siege: cleanText(row.c_ville_siege),
      tel_fixe: cleanText(row.c_tel_fixe),
      tel_portable: cleanText(row.c_tel_portable),
      email: cleanText(row.c_email),
      regime_fiscal: cleanText(row.c_regime_fiscal),
      soumis_is: cleanText(row.c_soumis_is),
      mois_cloture: row.c_mois_cloture ?? null,
      logiciel_compta: cleanText(row.c_logiciel_compta),
      expert_comptable: cleanText(row.c_expert_comptable),
      expert_comptable_nom: cleanText(row.c_expert_comptable_nom),
      expert_comptable_prenom: cleanText(row.c_expert_comptable_prenom),
      chef_de_mission: cleanText(row.c_chef_de_mission),
      chef_de_mission_nom: cleanText(row.c_chef_de_mission_nom),
      chef_de_mission_prenom: cleanText(row.c_chef_de_mission_prenom),
    };

    const lab = row.l_id != null ? {
      id: row.l_id ?? null,
      code_client: key,
      statut_dossier: cleanText(row.l_statut_dossier),
      niveau_risque: cleanText(row.l_niveau_risque),
      vigilance: cleanText(row.l_vigilance),
      id_responsable_lab: cleanText(row.l_id_responsable_lab),
      responsable_lab_nom: cleanText(row.l_responsable_lab_nom),
      responsable_lab_prenom: cleanText(row.l_responsable_lab_prenom),
      date_entree_relation: row.l_date_entree_relation ?? null,
      date_derniere_revue: row.l_date_derniere_revue ?? null,
      date_prochaine_revue: row.l_date_prochaine_revue ?? null,
      periodicite_revue_mois: row.l_periodicite_revue_mois ?? null,
      statut_kyc: cleanText(row.l_statut_kyc),
      date_creation: row.l_date_creation ?? null,
      date_modification: row.l_date_modification ?? null,
      cree_par: cleanText(row.l_cree_par),
      modifie_par: cleanText(row.l_modifie_par),
      nb_evenements_ouverts: row.l_nb_evenements_ouverts ?? 0,
      nb_diligences_retard: row.l_nb_diligences_retard ?? 0,
    } : null;

    const [
      kyc,
      beneficiaires,
      pieces,
      evenements,
      diligences,
      revues,
      risqueHistorique,
      audit,
      revueEnCours,
    ] = await Promise.all([
      getKycDossierLab(pool, codeSafe),
      getBeneficiairesDossierLab(pool, codeSafe),
      getPiecesDossierLab(pool, codeSafe),
      getEvenementsDossierLab(pool, codeSafe),
      getDiligencesDossierLab(pool, codeSafe),
      getRevuesDossierLab(pool, codeSafe),
      getRisqueHistoriqueDossierLab(pool, codeSafe),
      getAuditDossierLab(pool, codeSafe),
      getRevueEnCours(pool, codeSafe),
    ]);

    return {
      client,
      lab,
      kyc,
      beneficiaires,
      pieces,
      evenements,
      diligences,
      revues,
      risqueHistorique,
      audit,
      revue_en_cours: revueEnCours,
    };
  } catch (err) {
    console.error('Erreur getDossierLab:', err);
    throw err;
  }
}
