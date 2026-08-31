/**
 * Helpers LAB partagés (erreur, RBAC D14, audit, normalize, événements auto).
 * Extrait de labService.js — Phase 7.4 Vague 2 (DEV/code). Comportement inchangé.
 */

import { poolPromise, sql } from '../config/db.js';

export function cleanText(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

export function formatCollaborateur(prenom, nom, fallbackId) {
  const fullName = [cleanText(prenom), cleanText(nom)].filter(Boolean).join(' ');
  return fullName || cleanText(fallbackId) || 'Non attribué';
}

export function normalizeCriticite(value) {
  const clean = cleanText(value);
  if (!clean) return 'Faible';
  if (clean === 'Élevée' || clean === 'Elevée' || clean === 'Elevee') return 'Elevee';
  if (clean === 'Moyenne') return 'Moyenne';
  return 'Faible';
}

export function yesNoUnknown(value) {
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

export function normalizeModeControle(value) {
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

export function normalizeStatutPiece(value) {
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

export function normalizeStatutRevue(value) {
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

export function normalizeNiveauRisque(value) {
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

export function normalizeComplexite(value) {
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

export function splitTextList(value) {
  const clean = cleanText(value);
  if (!clean) return [];
  return clean
    .split(/[;,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toNumberOrNull(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeNiveauRisqueForStorage(value) {
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

export function parseIsoDate(value) {
  if (value == null || String(value).trim() === '') return null;
  const raw = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return undefined;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function todayUtcDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function addMonthsUtc(date, months) {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

export function addDaysUtc(date, days) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function normalizeIntituleKey(value) {
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

export async function assertClientExists(transaction, codeClient) {
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

export async function assertDossierAbsent(transaction, codeClient) {
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

export async function assertCollaborateurExists(transaction, idSellsy, fieldLabel) {
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

export async function assertDossierExists(transaction, codeClient) {
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

export async function writeLabAuditLog(transaction, {
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

export function yesNoToDb(value) {
  return yesNoUnknown(value) === 'Oui' ? 'O' : 'N';
}

export function normalizeComplexiteForStorage(value) {
  const normalized = normalizeComplexite(value);
  if (normalized === 'Simple') return 'Simple';
  if (normalized === 'Moyenne') return 'Moyenne';
  if (normalized === 'Complexe') return 'Complexe';
  return 'Inconnue';
}

export const AUTO_EVENT_OPEN_STATUTS_SQL = `N'Ouvert', N'En_cours', N'A_VALIDER'`;

/**
 * Idempotence D5.3-I : un événement ouvert (Ouvert / En_cours / A_VALIDER)
 * du même type par dossier. Pas de création si le dossier est clôturé.
 *
 * @returns {Promise<{ id: number, type: string, created: boolean }|null>}
 */
export async function ensureEvenementAutoLab(transaction, {
  codeClient,
  typeEvenement,
  criticite = 'Moyenne',
  libelle = null,
  userId = null,
  source = 'auto',
  extraDetail = null,
} = {}) {
  const codeSafe = cleanText(codeClient);
  const type = cleanText(typeEvenement);
  if (!codeSafe || !type) return null;

  const creePar = cleanText(userId);
  const criticiteNorm = normalizeCriticite(criticite);

  const dossierRes = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeSafe)
    .query(`
      SELECT TOP 1
        RTRIM(LTRIM(d.statut_dossier)) AS statut_dossier,
        RTRIM(LTRIM(d.id_responsable_lab)) AS id_responsable_lab,
        RTRIM(LTRIM(c.expert_comptable)) AS expert_comptable
      FROM lab_dossier d
      LEFT JOIN clients c
        ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(d.code_client))
      WHERE RTRIM(LTRIM(d.code_client)) = RTRIM(LTRIM(@code_client))
    `);
  const dossier = dossierRes.recordset?.[0];
  if (!dossier) {
    throw new LabDossierError('Dossier LAB introuvable', 404);
  }
  const statutDossier = (cleanText(dossier.statut_dossier) || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (statutDossier.includes('clotur')) {
    return null;
  }

  const existing = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeSafe)
    .input('type_evenement', sql.NChar(50), type)
    .query(`
      SELECT TOP 1 id
      FROM lab_evenements
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
        AND RTRIM(LTRIM(type_evenement)) = RTRIM(LTRIM(@type_evenement))
        AND RTRIM(LTRIM(statut)) IN (${AUTO_EVENT_OPEN_STATUTS_SQL})
      ORDER BY id DESC
    `);
  const existingId = existing.recordset?.[0]?.id;
  if (existingId != null) {
    return { id: existingId, type, created: false };
  }

  const idResponsable =
    cleanText(dossier.id_responsable_lab) || cleanText(dossier.expert_comptable) || creePar;
  const eventLibelle = cleanText(libelle) || defaultLibelleEvenement(type);

  const insertEvent = await new sql.Request(transaction)
    .input('code_client', sql.NVarChar(10), codeSafe)
    .input('type_evenement', sql.NChar(50), type)
    .input('libelle', sql.NChar(200), eventLibelle)
    .input('criticite', sql.NChar(10), criticiteNorm)
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
  const eventId = insertEvent.recordset?.[0]?.id;
  if (eventId == null) {
    throw new Error(`INSERT lab_evenements ${type} sans id retourné`);
  }

  const detail = {
    type_evenement: type,
    libelle: eventLibelle,
    criticite: criticiteNorm,
    statut: 'Ouvert',
    source,
  };
  if (extraDetail && typeof extraDetail === 'object') {
    Object.assign(detail, extraDetail);
  }

  await writeLabAuditLog(transaction, {
    userId: creePar,
    typeAction: 'CREATION_EVENEMENT',
    entite: 'lab_evenements',
    idEntite: eventId,
    codeClient: codeSafe,
    detail: JSON.stringify(detail),
  });

  return { id: eventId, type, created: true };
}

export function normalizeSoumisIs(value) {
  const clean = cleanText(value);
  if (!clean) return null;
  const upper = clean.toUpperCase();
  if (upper === 'O' || upper === 'OUI' || upper === 'Y' || upper === 'YES') return 'O';
  if (upper === 'N' || upper === 'NON' || upper === 'NO') return 'N';
  return clean.length === 1 ? clean : null;
}

export function normalizeModulation(value) {
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

export function niveauRankForArpec(value) {
  const normalized = cleanText(value)
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized?.includes('eleve')) return 2;
  if (normalized?.includes('moy')) return 1;
  return 0;
}

export function niveauArpecFromRank(rank) {
  if (rank >= 2) return 'Élevé';
  if (rank === 1) return 'Moyen';
  return 'Faible';
}

export function periodiciteFromNiveau(niveau) {
  const rank = niveauRankForArpec(niveau);
  if (rank >= 2) return 3;
  if (rank === 1) return 6;
  return 12;
}

export function parseEntityId(value, label = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new LabDossierError(`${label} invalide`, 400);
  }
  return id;
}

export async function getAuditDossierLab(pool, codeClient) {
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


export function buildOptionalFilters(request, filters = {}, allowed = {}) {
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
export function buildScopeClause(scope, codeClientExpr, paramName = 'scope_id') {
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
 * isClientPredicate / isProspectPredicate — contrat 5.5 (clients.prospect nchar(1) NULL).
 * Toujours RTRIM(LTRIM) : nchar pad. NULL / vide / N / 0 = client ; O / 1 = prospect.
 */
export function sqlIsClient(alias = 'c') {
  return `(${alias}.prospect IS NULL OR RTRIM(LTRIM(${alias}.prospect)) IN (N'', N'N', N'n', N'0'))`;
}

export function sqlIsProspect(alias = 'c') {
  return `(RTRIM(LTRIM(${alias}.prospect)) IN (N'O', N'o', N'1'))`;
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

export const EVENT_TYPE_DEFAULT_LIBELLES = {
  PIECE_MANQUANTE: 'Pièce manquante',
  PIECE_PERIMEE: 'Pièce périmée',
  CHANGEMENT_KYC: 'Changement KYC',
  TRANSACTION_ATYPIQUE: 'Transaction atypique',
  PLAN_VIGILANCE: 'Plan de vigilance',
  REVUE_ANNUELLE: 'Revue périodique',
  AUTRE: 'Autre événement',
};

export function defaultLibelleEvenement(typeEvenement) {
  const type = cleanText(typeEvenement) || 'AUTRE';
  return EVENT_TYPE_DEFAULT_LIBELLES[type] || type.replace(/_/g, ' ');
}
