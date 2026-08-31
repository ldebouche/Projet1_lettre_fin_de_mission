/**
 * Questionnaire / évaluation ARPEC, historique de risque, hook plan de vigilance.
 * Extrait de labService.js — Phase 7.4 Vague 2 (DEV/code). Comportement inchangé.
 */

import { poolPromise, sql } from '../config/db.js';

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

import { genererPlanVigilanceLab } from './lab-plan-service.js';

import { getRevueEnCours } from './lab-revues-service.js';

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
      q.type_affichage,
      q.ape_prefixes,
      q.forme_filtre,
      q.test_pep,
      q.test_pays_liste,
      q.seuil_rm_keur,
      q.seuil_re_keur,
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

function normalizeApeCode(value) {
  return String(value ?? '')
    .trim()
    .replace(/\./g, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

function apeMatchesPrefixes(clientApe, prefixesStr) {
  const ape = normalizeApeCode(clientApe);
  if (!ape || !prefixesStr) return false;
  const prefixes = String(prefixesStr)
    .split(';')
    .map((p) => normalizeApeCode(p))
    .filter(Boolean);
  return prefixes.some((prefix) => ape.startsWith(prefix));
}

function formeMatchesFiltre(formeSociete, formeFiltre) {
  if (!formeFiltre) return false;
  const forme = String(formeSociete ?? '').trim().toLowerCase();
  const filtre = String(formeFiltre).trim().toLowerCase();
  if (!forme || !filtre) return false;
  return forme.includes(filtre);
}

function normalizePaysLabel(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Contexte dossier pour filtrage ARPEC 2026 (APE, forme, PEP, pays BE, CA FEC).
 */
async function loadArpecClientContexte(pool, codeClient) {
  const clientResult = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1
        c.ape,
        c.forme_societe,
        k.est_pep AS kyc_est_pep
      FROM clients c
      LEFT JOIN lab_kyc k ON RTRIM(LTRIM(k.code_client)) = RTRIM(LTRIM(c.code_client))
      WHERE RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(@code_client))
    `);
  const clientRow = clientResult.recordset?.[0];
  if (!clientRow) {
    throw new LabDossierError('Client introuvable', 404);
  }

  const beResult = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT
        pays_residence,
        nationalite,
        est_pep
      FROM lab_beneficiaires_effectifs
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);
  const beRows = beResult.recordset || [];
  const paysBe = [];
  let bePep = false;
  for (const row of beRows) {
    if (yesNoUnknown(row.est_pep) === 'Oui') bePep = true;
    for (const field of [row.pays_residence, row.nationalite]) {
      const pays = cleanText(field);
      if (pays && !paysBe.includes(pays)) paysBe.push(pays);
    }
  }

  const kycPep = yesNoUnknown(clientRow.kyc_est_pep) === 'Oui';
  const estPep = kycPep || bePep;

  let ca = null;
  let datefinex = null;
  let hasFec = false;

  try {
    const aggResult = await pool
      .request()
      .input('code_client', sql.NVarChar(10), codeClient)
      .query(`
        SELECT TOP 1 ca, datefinex
        FROM Aggregats_FEC
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
        ORDER BY datefinex DESC
      `);
    const agg = aggResult.recordset?.[0];
    if (agg && agg.ca != null && !Number.isNaN(Number(agg.ca))) {
      ca = Number(agg.ca);
      datefinex = agg.datefinex ?? null;
      hasFec = true;
    }
  } catch (err) {
    if (err?.number !== 208) throw err;
  }

  if (!hasFec) {
    try {
      const fecResult = await pool
        .request()
        .input('code_client', sql.NVarChar(10), codeClient)
        .query(`
          SELECT TOP 1
            v.datefinex,
            (
              SELECT SUM(ISNULL(TRY_CAST(f2.credit AS FLOAT), 0) - ISNULL(TRY_CAST(f2.debit AS FLOAT), 0))
              FROM dbo.vue_fec f2
              WHERE RTRIM(LTRIM(f2.code_client)) = RTRIM(LTRIM(v.code_client))
                AND f2.datefinex = v.datefinex
                AND LEFT(RTRIM(LTRIM(CAST(f2.compte_num AS NVARCHAR(20)))), 2) = N'70'
            ) AS ca_70
          FROM (
            SELECT DISTINCT code_client, datefinex
            FROM dbo.vue_fec
            WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          ) v
          ORDER BY v.datefinex DESC
        `);
      const fec = fecResult.recordset?.[0];
      if (fec?.datefinex) {
        datefinex = fec.datefinex;
        hasFec = true;
        const ca70 = fec.ca_70 != null && !Number.isNaN(Number(fec.ca_70)) ? Number(fec.ca_70) : 0;
        ca = Math.abs(ca70);
      }
    } catch (err) {
      if (err?.number !== 208 && err?.number !== 207) throw err;
    }
  }

  const caKeur = ca == null ? null : ca / 1000;

  let paysListes = { 'PAYS_D3-1': new Set(), 'PAYS_D3-2': new Set() };
  try {
    const paysResult = await pool.request().query(`
      SELECT liste, libelle_pays
      FROM lab_arpec_pays
    `);
    paysListes = { 'PAYS_D3-1': new Set(), 'PAYS_D3-2': new Set() };
    for (const row of paysResult.recordset || []) {
      const liste = cleanText(row.liste);
      const lib = normalizePaysLabel(row.libelle_pays);
      if (liste && lib && paysListes[liste]) {
        paysListes[liste].add(lib);
      }
    }
  } catch (err) {
    if (err?.number !== 208) throw err;
  }

  return {
    ape: cleanText(clientRow.ape),
    forme_societe: cleanText(clientRow.forme_societe),
    est_pep: estPep,
    pays_be: paysBe,
    has_fec: hasFec,
    ca,
    ca_keur: caKeur,
    datefinex,
    paysListes,
  };
}

function resolveCaNiveau(contexte, seuilRm, seuilRe) {
  const hasRm = seuilRm != null && !Number.isNaN(Number(seuilRm));
  const hasRe = seuilRe != null && !Number.isNaN(Number(seuilRe));
  if (!hasRm && !hasRe) {
    return { niveauSiOui: 'Élevé', estDeclencheur: true, band: 'tous' };
  }
  if (!contexte.has_fec || contexte.ca_keur == null) {
    return { niveauSiOui: 'Moyen', estDeclencheur: false, band: 'sans_fec' };
  }
  const caKeur = Number(contexte.ca_keur);
  const rm = hasRm ? Number(seuilRm) : 0;
  const re = hasRe ? Number(seuilRe) : null;
  // Borne exacte du seuil RE incluse dans RM (convention Excel).
  if (re != null && caKeur > re) {
    return { niveauSiOui: 'Élevé', estDeclencheur: true, band: 're' };
  }
  if (caKeur >= rm) {
    return { niveauSiOui: 'Moyen', estDeclencheur: false, band: 'rm' };
  }
  return { niveauSiOui: 'Moyen', estDeclencheur: false, band: 'sous_seuil' };
}

function evaluateArpecQuestionVisibility(row, contexte, visibilityByCode) {
  const code = cleanText(row.code_question);
  const typeAffichage = cleanText(row.type_affichage) || 'qualitatif';

  if (typeAffichage === 'cabinet') {
    return { visible: false, motif: 'cabinet', skipPayload: true };
  }
  if (typeAffichage === 'qualitatif') {
    return { visible: true, motif: null };
  }

  // test_bdd
  if (cleanText(row.forme_filtre)) {
    const ok = formeMatchesFiltre(contexte.forme_societe, row.forme_filtre);
    return { visible: ok, motif: ok ? null : 'forme' };
  }
  if (yesNoUnknown(row.test_pep) === 'Oui') {
    return { visible: !!contexte.est_pep, motif: contexte.est_pep ? null : 'pep' };
  }
  const paysListe = cleanText(row.test_pays_liste);
  if (paysListe) {
    const set = contexte.paysListes?.[paysListe] || new Set();
    const hit = (contexte.pays_be || []).some((p) => set.has(normalizePaysLabel(p)));
    return { visible: hit, motif: hit ? null : 'pays' };
  }

  const prefixes = cleanText(row.ape_prefixes);
  if (prefixes) {
    // D2-10 exclut si D2-8 ou D2-9 déjà visible
    if (code === 'D2-10' && (visibilityByCode.get('D2-8') || visibilityByCode.get('D2-9'))) {
      return { visible: false, motif: 'exclu_par_d2_8_9' };
    }
    // D2-18 résiduel : APE 47 et aucun D2-6…17 visible
    if (code === 'D2-18') {
      const exclus = [
        'D2-6', 'D2-7', 'D2-8', 'D2-9', 'D2-10', 'D2-11', 'D2-12',
        'D2-14', 'D2-15', 'D2-16', 'D2-17',
      ];
      if (exclus.some((c) => visibilityByCode.get(c))) {
        return { visible: false, motif: 'residuel_d2_18' };
      }
    }

    const apeOk = apeMatchesPrefixes(contexte.ape, prefixes);
    if (!apeOk) {
      return { visible: false, motif: 'ape' };
    }

    const seuilRm = row.seuil_rm_keur;
    const seuilRe = row.seuil_re_keur;
    const hasSeuil = seuilRm != null || seuilRe != null;
    if (!hasSeuil) {
      // RE « tous les dossiers » : APE suffit
      return { visible: true, motif: null };
    }
    if (!contexte.has_fec) {
      // D5.1c-E : sans FEC, afficher si APE matche
      return { visible: true, motif: null };
    }
    const caKeur = contexte.ca_keur == null ? 0 : Number(contexte.ca_keur);
    const plancher = seuilRm != null ? Number(seuilRm) : 0;
    if (caKeur < plancher) {
      return { visible: false, motif: 'ca_sous_seuil' };
    }
    return { visible: true, motif: null };
  }

  // test_bdd sans critère reconnu → cachée
  return { visible: false, motif: 'test_incomplet' };
}

function buildArpecVisibilityMap(rows, contexte) {
  const dossierRows = rows.filter((r) => cleanText(r.type_affichage) !== 'cabinet');
  const visibilityByCode = new Map();
  // Deux passes pour exclusions D2-10 / D2-18
  for (const row of dossierRows) {
    const code = cleanText(row.code_question);
    if (!code) continue;
    if (code === 'D2-10' || code === 'D2-18') continue;
    const evalResult = evaluateArpecQuestionVisibility(row, contexte, visibilityByCode);
    visibilityByCode.set(code, !!evalResult.visible);
  }
  for (const row of dossierRows) {
    const code = cleanText(row.code_question);
    if (code !== 'D2-10' && code !== 'D2-18') continue;
    const evalResult = evaluateArpecQuestionVisibility(row, contexte, visibilityByCode);
    visibilityByCode.set(code, !!evalResult.visible);
  }

  const details = new Map();
  for (const row of dossierRows) {
    const code = cleanText(row.code_question);
    const evalResult = evaluateArpecQuestionVisibility(row, contexte, visibilityByCode);
    const resolved = resolveCaNiveau(contexte, row.seuil_rm_keur, row.seuil_re_keur);
    const typeAffichage = cleanText(row.type_affichage) || 'qualitatif';
    let niveauSiOui = cleanText(row.niveau_risque_si_oui)?.includes('lev') ? 'Élevé' : 'Moyen';
    let estDeclencheur = yesNoUnknown(row.est_declencheur) === 'Oui';
    if (typeAffichage === 'test_bdd' && cleanText(row.ape_prefixes)) {
      if (row.seuil_rm_keur != null || row.seuil_re_keur != null) {
        niveauSiOui = resolved.niveauSiOui;
        estDeclencheur = resolved.estDeclencheur;
      } else {
        niveauSiOui = 'Élevé';
        estDeclencheur = true;
      }
    }
    details.set(code, {
      visible: !!evalResult.visible,
      motif_masquage: evalResult.visible ? null : evalResult.motif,
      niveauSiOui,
      estDeclencheur,
      skipPayload: !!evalResult.skipPayload,
    });
  }
  return details;
}

/**
 * Retourne le référentiel ARPEC 2026 filtré pour un dossier (questions visibles).
 * @param {string} codeClient
 */
export async function getArpecQuestionnaire(codeClient) {
  const code = codeClient != null ? String(codeClient).trim() : '';
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }
  if (code.length > 10) {
    throw new LabDossierError('code_client invalide (max 10 caractères)', 400);
  }

  const pool = await poolPromise;

  let rows;
  try {
    rows = await loadArpecQuestionnaire(pool);
  } catch (err) {
    if (err?.number === 208 || err?.number === 207) {
      throw new LabDossierError('Module ARPEC non disponible en base (tables lab_arpec_*)', 503);
    }
    throw err;
  }

  if (!rows.length) {
    throw new LabDossierError('Référentiel ARPEC vide ou indisponible', 503);
  }

  let contexte;
  try {
    contexte = await loadArpecClientContexte(pool, code);
  } catch (err) {
    if (err instanceof LabDossierError) throw err;
    if (err?.number === 208 || err?.number === 207) {
      throw new LabDossierError('Tables clients / FEC indisponibles pour le filtrage ARPEC', 503);
    }
    throw err;
  }

  const visibility = buildArpecVisibilityMap(rows, contexte);
  const axesMap = new Map();

  for (const row of rows) {
    const typeAffichage = cleanText(row.type_affichage) || 'qualitatif';
    if (typeAffichage === 'cabinet') continue;

    const qCode = cleanText(row.code_question);
    const detail = visibility.get(qCode);
    if (!detail?.visible) continue;

    const axeCode = cleanText(row.axe_code) || 'D?';
    if (!axesMap.has(axeCode)) {
      axesMap.set(axeCode, {
        code: axeCode,
        libelle: cleanText(row.axe_libelle) || axeCode,
        questions: [],
      });
    }

    axesMap.get(axeCode).questions.push({
      code: qCode,
      libelle: cleanText(row.libelle) || '',
      sousAxe: cleanText(row.sous_axe) || undefined,
      visible: true,
      estDeclencheur: detail.estDeclencheur,
      niveauSiOui: detail.niveauSiOui,
    });
  }

  return {
    version: 'ARPEC-2026',
    contexte: {
      ape: contexte.ape,
      forme_societe: contexte.forme_societe,
      est_pep: contexte.est_pep,
      pays_be: contexte.pays_be,
      has_fec: contexte.has_fec,
      ca: contexte.ca,
      ca_keur: contexte.ca_keur,
      datefinex: contexte.datefinex,
    },
    axes: Array.from(axesMap.values()),
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

  // Ignorer les questions cabinet éventuellement envoyées dans le body
  for (const q of questions) {
    if (cleanText(q.type_affichage) === 'cabinet') {
      reponsesByCode.delete(cleanText(q.code_question));
    }
  }

  const contexte = await loadArpecClientContexte(pool, codeSafe);
  const visibility = buildArpecVisibilityMap(questions, contexte);

  // Appliquer niveauSiOui / estDeclencheur dynamiques (bande RM/RE) pour le calcul NPLAB
  const questionsDossier = [];
  for (const q of questions) {
    if (cleanText(q.type_affichage) === 'cabinet') continue;
    const qCode = cleanText(q.code_question);
    const detail = visibility.get(qCode);
    const enriched = {
      ...q,
      niveau_risque_si_oui: detail?.niveauSiOui || q.niveau_risque_si_oui,
      est_declencheur: detail?.estDeclencheur ? 'O' : 'N',
      _visible: !!detail?.visible,
    };
    questionsDossier.push(enriched);
    // Questions cachées = NON (pas de saisie) — écrase tout OUI injecté dans le body
    if (!enriched._visible) {
      reponsesByCode.set(qCode, 'N');
    }
  }

  const unanswered = questionsDossier.filter((q) => {
    if (!q._visible) return false;
    const qCode = cleanText(q.code_question);
    return qCode && !reponsesByCode.has(qCode);
  });
  if (unanswered.length > 0) {
    throw new LabDossierError(
      `Questionnaire ARPEC incomplet : ${unanswered.length} question(s) visible(s) sans réponse OUI/NON`,
      400,
    );
  }

  const axesMap = new Map();
  for (const q of questionsDossier) {
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

    for (const q of questionsDossier) {
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

export async function getRisqueHistoriqueDossierLab(pool, codeClient) {
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
