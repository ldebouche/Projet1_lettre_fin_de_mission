/**
 * Orchestration Fiche LCB-FT PDF (Phase 9.3).
 * Fiche 1 si pas d'id_revue ; Fiche 2 si id_revue.
 * Décisions : archive pièce KYC ; PDF même si IA échoue ; synthèse 5 axes seulement.
 */
import { getDossierLab } from './lab-dossier-service.js';
import { getArpecEvaluation } from './lab-arpec-service.js';
import { extraireInfosCommentaireEtape1, emptyExtractionEtape1 } from './lab-ia-extraction-service.js';
import { savePieceKycFileLab, createPieceKycLab } from './lab-pieces-service.js';
import { buildFicheLcbftHtml } from './lab-fiche-lcbft-html.js';
import { renderFicheLcbftPdfBuffer } from './lab-fiche-lcbft-pdf-service.js';
import {
  LabDossierError,
  cleanText,
  parseEntityId,
  writeLabAuditLog,
} from './lab-utils.js';
import { poolPromise } from '../config/db.js';

function todayStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return { yyyy, mm, dd, fr: `${dd}/${mm}/${yyyy}`, compact: `${yyyy}${mm}${dd}` };
}

function axeLibelle(code) {
  const c = String(code || '').trim().toUpperCase();
  const map = {
    D1: 'D1 — Client',
    D2: 'D2 — Opérations / relation',
    D3: 'D3 — Localisation géographique',
    D4: 'D4 — Produits / canaux',
    D5: 'D5 — Autres facteurs',
  };
  return map[c] || code;
}

/**
 * @param {{ code_client: string, id_revue?: number|string|null, redacteur?: string|null, userId?: string|null }} opts
 * @returns {Promise<{ buffer: Buffer, filename: string, type_fiche: '1'|'2', piece_id: number|null }>}
 */
export async function genererFicheLcbftLab(opts = {}) {
  const code = cleanText(opts.code_client);
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }

  let idRevue = null;
  if (opts.id_revue != null && String(opts.id_revue).trim() !== '') {
    idRevue = parseEntityId(opts.id_revue, 'id_revue');
  }

  const typeFiche = idRevue != null ? '2' : '1';

  const dossier = await getDossierLab(code);
  if (!dossier?.lab) {
    throw new LabDossierError('Dossier LAB introuvable', 404);
  }

  if (idRevue != null) {
    const pool = await poolPromise;
    const revueCheck = await pool
      .request()
      .input('id', sql.Int, idRevue)
      .input('code_client', sql.NVarChar(10), code)
      .query(`
        SELECT TOP 1 id
        FROM lab_revues
        WHERE id = @id
          AND RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
      `);
    if (!revueCheck.recordset?.[0]) {
      throw new LabDossierError('Revue introuvable pour ce dossier', 404);
    }
  }

  let arpec;
  try {
    arpec = await getArpecEvaluation(code);
  } catch (err) {
    if (err instanceof LabDossierError && err.statusCode === 404) {
      throw new LabDossierError('Évaluation ARPEC active requise pour générer la fiche', 409);
    }
    throw err;
  }

  const axes = (arpec.axes || []).map((a) => ({
    code: a.code,
    libelle: axeLibelle(a.code),
    niveau: a.niveau,
    nb_oui: a.nb_oui,
  }));

  const supplement = dossier.kyc?.wizard_supplement || {};
  const commentaire = cleanText(supplement.commentaire_etape1) || '';

  let extraction = emptyExtractionEtape1();
  if (commentaire) {
    try {
      extraction = await extraireInfosCommentaireEtape1(commentaire);
    } catch (err) {
      console.warn('Extraction IA commentaire étape 1 échouée — PDF sans extraction:', err?.message || err);
      extraction = emptyExtractionEtape1();
    }
  }

  const stamp = todayStamp();
  const client = dossier.client || {};
  const html = buildFicheLcbftHtml(typeFiche, {
    client: { ...client, code_client: code },
    lab: dossier.lab,
    kyc: dossier.kyc || {},
    beneficiaires: dossier.beneficiaires || [],
    pieces: dossier.pieces || [],
    arpec: {
      niveau_calcule: arpec.niveau_calcule,
      niveau_retenu: arpec.niveau_retenu,
      modulation: arpec.modulation,
      justification_modulation: arpec.justification_modulation,
      vigilance: arpec.vigilance,
      axes,
    },
    extraction,
    idRevue,
    dateFicheFr: stamp.fr,
    redacteur: cleanText(opts.redacteur) || 'Collaborateur',
    expertComptable: [
      cleanText(client.expert_comptable_prenom),
      cleanText(client.expert_comptable_nom),
    ]
      .filter(Boolean)
      .join(' ') || cleanText(client.expert_comptable) || '',
  });

  const buffer = await renderFicheLcbftPdfBuffer(html);
  const filename =
    typeFiche === '2'
      ? `LAB_Fiche2_${code}_revue${idRevue}_${stamp.compact}.pdf`
      : `LAB_Fiche1_${code}_${stamp.compact}.pdf`;

  let pieceId = null;
  try {
    const saved = await savePieceKycFileLab(code, {
      buffer,
      originalname: filename,
      size: buffer.length,
      mimetype: 'application/pdf',
    });
    const created = await createPieceKycLab(
      {
        code_client: code,
        type_piece: typeFiche === '2' ? 'Fiche LCB-FT 2' : 'Fiche LCB-FT 1',
        statut: 'Recue',
        titulaire: 'Client',
        commentaire: `Générée automatiquement (Fiche ${typeFiche})`,
        nom_fichier: saved.nom_fichier,
        filepath: saved.filepath,
        reference: saved.nom_fichier,
        date_delivrance: `${stamp.yyyy}-${stamp.mm}-${stamp.dd}`,
      },
      opts.userId || null,
    );
    pieceId = created?.piece?.id ?? null;
  } catch (err) {
    console.error('Archivage pièce KYC fiche LCB-FT échoué:', err);
    throw new LabDossierError(
      err instanceof LabDossierError
        ? err.message
        : 'PDF généré mais archivage pièce KYC impossible',
      err instanceof LabDossierError ? err.statusCode : 500,
    );
  }

  try {
    const pool = await poolPromise;
    await writeLabAuditLog(pool, {
      userId: opts.userId || null,
      typeAction: 'GENERATION_FICHE_LCBFT',
      entite: 'lab_pieces_kyc',
      idEntite: pieceId,
      codeClient: code,
      detail: JSON.stringify({
        type_fiche: typeFiche,
        id_revue: idRevue,
        filename,
        piece_id: pieceId,
      }),
    });
  } catch (err) {
    console.warn('Audit GENERATION_FICHE_LCBFT non écrit:', err?.message || err);
  }

  return { buffer, filename, type_fiche: typeFiche, piece_id: pieceId };
}
