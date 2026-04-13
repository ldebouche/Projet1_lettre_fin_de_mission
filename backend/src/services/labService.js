import { poolPromise, sql } from '../config/db.js';

/**
 * Agrégats risque / KYC / événements pour une liste de codes clients (accès par code).
 * @param {string[]} codesClients
 * @returns {Promise<Map<string, object>>}
 */
export async function getDossiersRisque(codesClients) {
  try {
    if (!Array.isArray(codesClients) || codesClients.length === 0) {
      return new Map();
    }

    const codesCsv = codesClients.map((c) => String(c).trim()).filter(Boolean).join(',');
    if (!codesCsv) {
      return new Map();
    }

    const pool = await poolPromise;
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
    `;

    const result = await pool
      .request()
      .input('codesClients', sql.NVarChar(sql.MAX), codesCsv)
      .query(query);

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
