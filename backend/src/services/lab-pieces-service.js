/**
 * Pièces KYC : CRUD, upload, job pièces périmées, loader GET dossier.
 * Extrait de labService.js — Phase 7.4 Vague 2 (DEV/code). Comportement inchangé.
 */

import fs from 'fs/promises';

import path from 'path';

import { poolPromise, sql } from '../config/db.js';

import { PATHS } from '../config/paths.js';

import {
  LabDossierError,
  cleanText,
  formatCollaborateur,
  normalizeCriticite,
  yesNoUnknown,
  normalizeModeControle,
  normalizeStatutPiece,
  normalizeStatutRevue,
  normalizeNiveauRisque,
  normalizeComplexite,
  splitTextList,
  toNumberOrNull,
  normalizeNiveauRisqueForStorage,
  parseIsoDate,
  todayUtcDate,
  addMonthsUtc,
  addDaysUtc,
  normalizeIntituleKey,
  assertClientExists,
  assertDossierAbsent,
  assertCollaborateurExists,
  assertDossierExists,
  writeLabAuditLog,
  yesNoToDb,
  normalizeComplexiteForStorage,
  ensureEvenementAutoLab,
  parseEntityId,
  getAuditDossierLab,
  buildOptionalFilters,
  buildScopeClause,
  sqlIsClient,
  sqlIsProspect,
  assertDossierInScope,
  defaultLibelleEvenement,
  normalizeModulation,
  niveauRankForArpec,
  niveauArpecFromRank,
  periodiciteFromNiveau,
  normalizeSoumisIs,
} from './lab-utils.js';

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

/** D5.3-G : statut Perimee OU date_echeance < aujourd'hui, hors Non_requise. */
function isPieceExpiredForEvent(statutBdd, dateEcheance) {
  const statut = cleanText(statutBdd) || '';
  if (statut === 'Non_requise') return false;
  if (statut === 'Perimee') return true;
  if (!(dateEcheance instanceof Date) || Number.isNaN(dateEcheance.getTime())) return false;
  return dateEcheance.getTime() < todayUtcDate().getTime();
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

const PIECE_KYC_MAX_BYTES = 20 * 1024 * 1024;
const PIECE_KYC_ALLOWED_EXT = new Set([
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.doc', '.docx', '.xls', '.xlsx', '.odt', '.ods',
]);

const PIECE_KYC_OFFICE_MIME = {
  '.doc': new Set(['application/msword', 'application/octet-stream']),
  '.xls': new Set(['application/vnd.ms-excel', 'application/octet-stream']),
  '.docx': new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream',
    'application/zip',
  ]),
  '.xlsx': new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
    'application/zip',
  ]),
  '.odt': new Set([
    'application/vnd.oasis.opendocument.text',
    'application/octet-stream',
    'application/zip',
  ]),
  '.ods': new Set([
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/octet-stream',
    'application/zip',
  ]),
};

function bufferHasPrefix(buf, bytes) {
  if (!buf || buf.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (buf[i] !== bytes[i]) return false;
  }
  return true;
}

function looksLikePdf(buf) {
  return buf?.length >= 4 && buf.slice(0, 4).toString('latin1') === '%PDF';
}

function looksLikeJpeg(buf) {
  return bufferHasPrefix(buf, [0xff, 0xd8, 0xff]);
}

function looksLikePng(buf) {
  return bufferHasPrefix(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function looksLikeGif(buf) {
  const header = buf?.length >= 6 ? buf.slice(0, 6).toString('ascii') : '';
  return header === 'GIF87a' || header === 'GIF89a';
}

function looksLikeWebp(buf) {
  return buf?.length >= 12
    && buf.slice(0, 4).toString('ascii') === 'RIFF'
    && buf.slice(8, 12).toString('ascii') === 'WEBP';
}

function looksLikeOle(buf) {
  return bufferHasPrefix(buf, [0xd0, 0xcf, 0x11, 0xe0]);
}

function looksLikeZip(buf) {
  return bufferHasPrefix(buf, [0x50, 0x4b, 0x03, 0x04])
    || bufferHasPrefix(buf, [0x50, 0x4b, 0x05, 0x06])
    || bufferHasPrefix(buf, [0x50, 0x4b, 0x07, 0x08]);
}

function normalizeClaimedMime(file) {
  return String(file?.mimetype ?? '').split(';')[0].trim().toLowerCase();
}

function assertPieceKycContent(file, ext) {
  const buf = file?.buffer;
  if (ext === '.pdf' && !looksLikePdf(buf)) {
    throw new LabDossierError('Le fichier n\'est pas un PDF valide', 400);
  }
  if ((ext === '.jpg' || ext === '.jpeg') && !looksLikeJpeg(buf)) {
    throw new LabDossierError('Le fichier n\'est pas une image JPEG valide', 400);
  }
  if (ext === '.png' && !looksLikePng(buf)) {
    throw new LabDossierError('Le fichier n\'est pas une image PNG valide', 400);
  }
  if (ext === '.gif' && !looksLikeGif(buf)) {
    throw new LabDossierError('Le fichier n\'est pas une image GIF valide', 400);
  }
  if (ext === '.webp' && !looksLikeWebp(buf)) {
    throw new LabDossierError('Le fichier n\'est pas une image WebP valide', 400);
  }

  const officeMimes = PIECE_KYC_OFFICE_MIME[ext];
  if (officeMimes) {
    const claimed = normalizeClaimedMime(file);
    const mimeOk = claimed !== '' && officeMimes.has(claimed);
    const magicOk = (ext === '.doc' || ext === '.xls') ? looksLikeOle(buf) : looksLikeZip(buf);
    if (!mimeOk && !magicOk) {
      throw new LabDossierError('Type de fichier bureautique non autorisé', 400);
    }
  }
}

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
  if (!ext || !PIECE_KYC_ALLOWED_EXT.has(ext)) {
    throw new LabDossierError('Type de fichier non autorisé (extension obligatoire)', 400);
  }
  assertPieceKycContent(file, ext);

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

    let evenement = null;
    if (isPieceExpiredForEvent(statutBdd, dateEcheance)) {
      evenement = await ensureEvenementAutoLab(transaction, {
        codeClient: codeSafe,
        typeEvenement: 'PIECE_PERIMEE',
        criticite: 'Elevee',
        userId: modifiePar,
        source: 'auto_piece',
        extraDetail: { id_piece: pieceId, type_piece: typePiece, statut: statutBdd },
      });
    }

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
      evenement,
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

    let evenement = null;
    if (isPieceExpiredForEvent(statutBdd, dateEcheance)) {
      evenement = await ensureEvenementAutoLab(transaction, {
        codeClient: codeSafe,
        typeEvenement: 'PIECE_PERIMEE',
        criticite: 'Elevee',
        userId: modifiePar,
        source: 'auto_piece',
        extraDetail: { id_piece: id, type_piece: typePiece, statut: statutBdd },
      });
    }

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
      evenement,
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

/**
 * Job 5.3b — scan cabinet des pièces périmées.
 * Marque statut Perimee + assure un événement PIECE_PERIMEE ouvert par dossier.
 * Idempotent. Ignore les dossiers clôturés et les pièces Non_requise.
 *
 * @param {string|null} [userId='JOB_LAB']
 * @returns {Promise<{ scanned: number, marked_perimee: number, events_created: number, events_skipped: number, ids: number[] }>}
 */
export async function scanPiecesPerimeesLab(userId = 'JOB_LAB') {
  const actor = cleanText(userId) || 'JOB_LAB';
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const expiredRes = await new sql.Request(transaction).query(`
      SELECT
        p.id,
        RTRIM(LTRIM(p.code_client)) AS code_client,
        RTRIM(LTRIM(p.type_piece)) AS type_piece,
        RTRIM(LTRIM(p.statut)) AS statut,
        p.date_echeance
      FROM lab_pieces_kyc p
      INNER JOIN lab_dossier d
        ON RTRIM(LTRIM(d.code_client)) = RTRIM(LTRIM(p.code_client))
      WHERE RTRIM(LTRIM(ISNULL(d.statut_dossier, N''))) NOT IN (N'Cloture', N'Clôturé', N'Cloturee')
        AND RTRIM(LTRIM(p.statut)) <> N'Non_requise'
        AND (
          RTRIM(LTRIM(p.statut)) = N'Perimee'
          OR (
            p.date_echeance IS NOT NULL
            AND p.date_echeance < CAST(SYSUTCDATETIME() AS DATE)
          )
        )
      ORDER BY p.code_client, p.id
    `);

    const rows = expiredRes.recordset || [];
    const scanned = rows.length;
    let markedPerimee = 0;
    const byClient = new Map();

    for (const row of rows) {
      const codeClient = cleanText(row.code_client);
      if (!codeClient) continue;
      const statut = cleanText(row.statut);
      if (statut !== 'Perimee') {
        await new sql.Request(transaction)
          .input('id', sql.Int, row.id)
          .input('modifie_par', sql.NChar(20), actor)
          .query(`
            UPDATE lab_pieces_kyc
            SET
              statut = N'Perimee',
              date_modification = SYSUTCDATETIME(),
              modifie_par = @modifie_par
            WHERE id = @id
          `);
        await writeLabAuditLog(transaction, {
          userId: actor,
          typeAction: 'MODIF_PIECE',
          entite: 'lab_pieces_kyc',
          idEntite: row.id,
          codeClient,
          detail: JSON.stringify({
            type_piece: cleanText(row.type_piece),
            statut: 'Perimee',
            source: 'job_pieces_perimees',
          }),
        });
        markedPerimee += 1;
      }

      if (!byClient.has(codeClient)) {
        byClient.set(codeClient, []);
      }
      byClient.get(codeClient).push(row);
    }

    const ids = [];
    let eventsCreated = 0;
    let eventsSkipped = 0;

    for (const [codeClient, pieces] of byClient.entries()) {
      const first = pieces[0];
      const evenement = await ensureEvenementAutoLab(transaction, {
        codeClient,
        typeEvenement: 'PIECE_PERIMEE',
        criticite: 'Elevee',
        userId: actor,
        source: 'job_pieces_perimees',
        extraDetail: {
          pieces: pieces.map((p) => p.id),
          type_piece: cleanText(first?.type_piece),
        },
      });
      if (!evenement) {
        eventsSkipped += 1;
        continue;
      }
      if (evenement.created) {
        eventsCreated += 1;
        ids.push(evenement.id);
      } else {
        eventsSkipped += 1;
      }
    }

    await transaction.commit();

    return {
      scanned,
      marked_perimee: markedPerimee,
      events_created: eventsCreated,
      events_skipped: eventsSkipped,
      ids,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function getPiecesDossierLab(pool, codeClient) {
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
