/**
 * Paramètres / seuils détection opérations atypiques (COH / STAT / LCB).
 */

import { poolPromise, sql } from '../config/db.js';

/** Seuil montant par défaut (k€) → 6 000 EUR. */
export const SEUIL_KEUR_DEFAULT = 6;

/** Seuil en euros dérivé. */
export const SEUIL_EUR_DEFAULT = SEUIL_KEUR_DEFAULT * 1000;

/**
 * Facteur k (z-score / écart) selon niveau de risque LAB.
 * Faible → 3 ; Moyen / Standard → 2.5 ; Élevé → 2
 *
 * @param {unknown} niveauRisque
 * @returns {number}
 */
export function kFromNiveauRisque(niveauRisque) {
  const raw = String(niveauRisque ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (!raw) return 2.5;

  if (raw.includes('eleve') || raw === 'e' || raw === 'high') return 2;
  if (raw.includes('faible') || raw === 'f' || raw === 'low') return 3;
  if (raw.includes('moy') || raw.includes('standard') || raw === 'm') return 2.5;

  return 2.5;
}

/**
 * Seuil COH en euros à partir d'un k€ (défaut 6).
 * @param {unknown} [seuilKeur]
 * @returns {number}
 */
export function seuilEurFromKeur(seuilKeur = SEUIL_KEUR_DEFAULT) {
  const k = Number(seuilKeur);
  if (!Number.isFinite(k) || k < 0) return SEUIL_EUR_DEFAULT;
  return k * 1000;
}

/**
 * Lit lab_dossier.niveau_risque pour un code_client.
 * @param {string} codeClient
 * @returns {Promise<string|null>}
 */
export async function getNiveauRisqueDossier(codeClient) {
  const code = String(codeClient ?? '').trim();
  if (!code) return null;

  const pool = await poolPromise;
  const result = await pool
    .request()
    .input('code_client', sql.NVarChar(10), code)
    .query(`
      SELECT TOP (1) RTRIM(LTRIM(niveau_risque)) AS niveau_risque
      FROM dbo.lab_dossier WITH (NOLOCK)
      WHERE RTRIM(LTRIM(code_client)) = @code_client
    `);

  const niveau = result.recordset?.[0]?.niveau_risque;
  if (niveau == null || String(niveau).trim() === '') return null;
  return String(niveau).trim();
}

/**
 * Bundle params détection pour un dossier.
 * @param {string} codeClient
 * @param {{ seuilKeur?: number, niveauRisque?: string|null }} [overrides]
 * @returns {Promise<{ seuilKeur: number, seuilEur: number, niveauRisque: string|null, k: number }>}
 */
export async function getDetectionParams(codeClient, overrides = {}) {
  const seuilKeur = overrides.seuilKeur != null
    ? Number(overrides.seuilKeur)
    : SEUIL_KEUR_DEFAULT;

  let niveauRisque = overrides.niveauRisque != null
    ? overrides.niveauRisque
    : null;

  if (niveauRisque == null && codeClient) {
    niveauRisque = await getNiveauRisqueDossier(codeClient);
  }

  return {
    seuilKeur: Number.isFinite(seuilKeur) ? seuilKeur : SEUIL_KEUR_DEFAULT,
    seuilEur: seuilEurFromKeur(seuilKeur),
    niveauRisque,
    k: kFromNiveauRisque(niveauRisque),
  };
}

/** Alias explicite demandé par la spec atelier. */
export const seuilKeur = SEUIL_KEUR_DEFAULT;
