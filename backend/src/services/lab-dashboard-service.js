/**
 * Dashboard, portefeuille, prospects, export data.
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
      const c = [sqlIsClient(cAlias)];
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
    // diligences) : le dossier correspondant doit être un client (hors prospect)
    // dans le périmètre de l'appelant.
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

    where.push(sqlIsClient('c'));

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

/**
 * Prospects (clients.prospect) visibles par l'EC lié ou par isFull (équipe LAB).
 * Source = table clients, pas lab_dossier (un prospect peut ne pas encore avoir de dossier LAB).
 *
 * @param {object} filters  query : search, page, pageSize
 * @param {{ isFull: boolean, idSellsy: string|null }} scope
 * @returns {Promise<{ data: object[], total: number, page: number, pageSize: number }>}
 */
export async function getDossiersAttenteLab(filters = {}, scope = { isFull: true, idSellsy: null }) {
  try {
    const pool = await poolPromise;
    const where = [sqlIsProspect('c')];
    const inputs = [];

    if (!scope?.isFull) {
      const scopeId = scope?.idSellsy != null ? String(scope.idSellsy).trim() : '';
      inputs.push({ name: 'scope_id', type: sql.NVarChar(20), value: scopeId });
      where.push(`RTRIM(LTRIM(c.expert_comptable)) = @scope_id`);
    }

    const search = cleanText(filters.search);
    if (search) {
      inputs.push({ name: 'search', type: sql.NVarChar(200), value: `%${search}%` });
      where.push(`(
        c.raison_sociale LIKE @search
        OR c.code_client LIKE @search
        OR c.siret LIKE @search
        OR c.nom LIKE @search
        OR c.prenom LIKE @search
      )`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const fromJoin = `
      FROM clients c
      LEFT JOIN lab_dossier d ON RTRIM(LTRIM(d.code_client)) = RTRIM(LTRIM(c.code_client))
    `;

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

    const countResult = await applyInputs(pool.request()).query(`
      SELECT COUNT(*) AS total
      ${fromJoin}
      ${whereSql}
    `);
    const total = countResult.recordset?.[0]?.total ?? 0;

    const pageRequest = applyInputs(pool.request());
    pageRequest.input('offset', sql.Int, offset);
    pageRequest.input('pageSize', sql.Int, pageSize);
    const result = await pageRequest.query(`
      SELECT
        RTRIM(LTRIM(c.code_client)) AS code_client,
        c.raison_sociale,
        c.forme_societe,
        c.civilite,
        c.nom,
        c.prenom,
        c.siret,
        c.expert_comptable,
        COALESCE(d.date_creation, c.date_entree_cabinet) AS date_creation,
        d.statut_dossier,
        CASE WHEN d.id IS NULL THEN 0 ELSE 1 END AS has_lab_dossier
      ${fromJoin}
      ${whereSql}
      ORDER BY COALESCE(d.date_creation, c.date_entree_cabinet) DESC, c.raison_sociale ASC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);

    const data = (result.recordset || []).map((row) => ({
      code_client: cleanText(row.code_client),
      raison_sociale: cleanText(row.raison_sociale),
      forme_societe: cleanText(row.forme_societe),
      civilite: cleanText(row.civilite),
      nom: cleanText(row.nom),
      prenom: cleanText(row.prenom),
      siret: cleanText(row.siret),
      expert_comptable: cleanText(row.expert_comptable),
      date_creation: row.date_creation ?? null,
      statut_dossier: cleanText(row.statut_dossier),
      has_lab_dossier: Boolean(row.has_lab_dossier),
      statut: 'EN_ATTENTE',
    }));

    return { data, total, page, pageSize };
  } catch (err) {
    console.error('Erreur getDossiersAttenteLab:', err);
    throw err;
  }
}

/**
 * Export portefeuille : 1 requête (pas de pagination), agrégats en JOIN
 * au lieu de sous-requêtes corrélées (sinon ~3700 dossiers restent bloqués des minutes).
 * @returns {Promise<{ data: object[], total: number, exported: number, truncated: boolean }>}
 */
export async function getDossiersLabForExport(
  filters = {},
  scope = { isFull: true, idSellsy: null },
  maxRows = 5000,
) {
  try {
    const pool = await poolPromise;
    const where = [];
    const inputs = [];

    if (!scope?.isFull) {
      const scopeId = scope?.idSellsy != null ? String(scope.idSellsy).trim() : '';
      inputs.push({ name: 'scope_id', type: sql.NVarChar(20), value: scopeId });
      where.push(`(
        RTRIM(LTRIM(c.expert_comptable)) = @scope_id
        OR RTRIM(LTRIM(c.chef_de_mission)) = @scope_id
        OR RTRIM(LTRIM(d.id_responsable_lab)) = @scope_id
      )`);
    }

    where.push(sqlIsClient('c'));

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
    let limit = Number.parseInt(maxRows, 10);
    if (!Number.isInteger(limit) || limit < 1) limit = 5000;
    if (limit > 5000) limit = 5000;

    const request = pool.request();
    request.timeout = 120000;
    for (const input of inputs) request.input(input.name, input.type, input.value);
    request.input('maxRows', sql.Int, limit);

    const result = await request.query(`
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
        ISNULL(ev.nb_evenements_ouverts, 0) AS nb_evenements_ouverts,
        ISNULL(dil.nb_diligences_retard, 0) AS nb_diligences_retard,
        COUNT(*) OVER() AS total_count
      FROM lab_dossier d
      LEFT JOIN clients c ON RTRIM(LTRIM(c.code_client)) = RTRIM(LTRIM(d.code_client))
      LEFT JOIN lab_kyc k ON RTRIM(LTRIM(k.code_client)) = RTRIM(LTRIM(d.code_client))
      LEFT JOIN collaborateurs responsable
        ON RTRIM(LTRIM(responsable.id_sellsy)) = RTRIM(LTRIM(d.id_responsable_lab))
      LEFT JOIN (
        SELECT RTRIM(LTRIM(e.code_client)) AS code_client, COUNT(*) AS nb_evenements_ouverts
        FROM lab_evenements e
        WHERE RTRIM(LTRIM(e.statut)) != 'Cloture'
        GROUP BY RTRIM(LTRIM(e.code_client))
      ) ev ON ev.code_client = RTRIM(LTRIM(d.code_client))
      LEFT JOIN (
        SELECT RTRIM(LTRIM(di.code_client)) AS code_client, COUNT(*) AS nb_diligences_retard
        FROM lab_diligences di
        WHERE di.date_echeance IS NOT NULL
          AND di.date_echeance < CAST(GETDATE() AS DATE)
          AND RTRIM(LTRIM(di.statut)) NOT IN ('Realisee', 'Abandonnee')
        GROUP BY RTRIM(LTRIM(di.code_client))
      ) dil ON dil.code_client = RTRIM(LTRIM(d.code_client))
      ${whereSql}
      ORDER BY
        CASE RTRIM(LTRIM(d.niveau_risque)) WHEN 'Eleve' THEN 0 WHEN 'Élevé' THEN 0 WHEN 'Moyen' THEN 1 ELSE 2 END,
        d.date_prochaine_revue ASC,
        d.id DESC
      OFFSET 0 ROWS FETCH NEXT @maxRows ROWS ONLY
    `);

    const rows = result.recordset || [];
    const total = rows.length > 0 ? Number(rows[0].total_count) || rows.length : 0;
    const data = rows.map((row) => ({
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

    return {
      data,
      total,
      exported: data.length,
      truncated: total > data.length,
    };
  } catch (err) {
    console.error('Erreur getDossiersLabForExport:', err);
    throw err;
  }
}
