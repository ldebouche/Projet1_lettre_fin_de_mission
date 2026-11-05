/**
 * Orchestration détection opérations atypiques J-14 (avant revue périodique).
 * Pas de second score dossier : criticité événement dérivée des alertes (LCB → Elevee).
 *
 * Modules COH / LCB / STAT : import dynamiques si présents ; sinon stubs [] (TODO).
 */

import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { poolPromise, sql } from '../config/db.js';
import { getMaxDateFinex, loadFecLinesBatched } from './lab-detection-fec.js';
import { getDetectionParams } from './lab-detection-params.js';
import {
  AUTO_EVENT_OPEN_STATUTS_SQL,
  LabDossierError,
  cleanText,
  ensureEvenementAutoLab,
  todayUtcDate,
} from './lab-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const JOB_SOURCE = 'job_detection_j14';
const TX_STATUT_OUVERT = 'Ouvert';

const MODULE_SPECS = [
  {
    famille: 'COH',
    file: 'lab-detection-coh.js',
    exports: ['runCohControls', 'runCohDetection', 'runDetectionCoh', 'runDetection'],
  },
  {
    famille: 'LCB',
    file: 'lab-detection-lcb.js',
    exports: ['runLcbControls', 'runLcbDetection', 'runDetectionLcb', 'runDetection'],
  },
  {
    famille: 'STAT',
    file: 'lab-detection-stat.js',
    exports: ['runStatControls', 'runStatDetection', 'runDetectionStat', 'runDetection'],
  },
];

/**
 * @param {unknown} value
 * @returns {Date}
 */
function toDateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const raw = String(value ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }
  return todayUtcDate();
}

/**
 * Dossiers dont la revue tombe dans exactement 14 jours (J-14).
 *
 * @param {Date|string|null} [asOfDate]
 * @returns {Promise<Array<{ code_client: string, date_prochaine_revue: Date|null, niveau_risque: string|null }>>}
 */
export async function selectEligibleDossiersJ14(asOfDate = null) {
  const asOf = toDateOnly(asOfDate ?? todayUtcDate());
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input('as_of', sql.Date, asOf)
    .query(`
      SELECT
        RTRIM(LTRIM(d.code_client)) AS code_client,
        d.date_prochaine_revue,
        RTRIM(LTRIM(d.niveau_risque)) AS niveau_risque
      FROM lab_dossier d
      WHERE d.date_prochaine_revue IS NOT NULL
        AND d.date_prochaine_revue = DATEADD(day, 14, CAST(@as_of AS DATE))
        AND RTRIM(LTRIM(ISNULL(d.statut_dossier, N''))) NOT IN (
          N'Cloture', N'Clôturé', N'Cloturee', N'Refuse'
        )
      ORDER BY d.code_client ASC
    `);

  return (result.recordset || []).map((row) => ({
    code_client: cleanText(row.code_client),
    date_prochaine_revue: row.date_prochaine_revue ?? null,
    niveau_risque: cleanText(row.niveau_risque),
  })).filter((row) => row.code_client);
}

/**
 * Adapte run*Controls(rows, opts) → runner(ctx).
 * @param {Function} fn
 * @param {string} exportName
 * @returns {(ctx: object) => Promise<object[]>}
 */
function adaptModuleRunner(fn, exportName) {
  const isControlsApi = /Controls$/i.test(exportName);
  return async (ctx) => {
    if (isControlsApi) {
      const rows = ctx?.fecLines || ctx?.lines || [];
      const opts = {
        seuilEur: ctx?.seuilEur,
        k: ctx?.k,
        niveauRisque: ctx?.niveauRisque ?? ctx?.niveau_risque,
        classifyJournal: ctx?.classifyJournal,
      };
      return fn(rows, opts);
    }
    return fn(ctx);
  };
}

/**
 * @param {string} fileName
 * @param {string[]} exportNames
 * @returns {Promise<((ctx: object) => Promise<object[]>)|null>}
 */
async function resolveModuleRunner(fileName, exportNames) {
  const filePath = path.join(__dirname, fileName);
  if (!existsSync(filePath)) {
    return null;
  }
  const mod = await import(`./${fileName}`);
  for (const name of exportNames) {
    if (typeof mod[name] === 'function') {
      return adaptModuleRunner(mod[name].bind(mod), name);
    }
  }
  return null;
}

/**
 * Normalise une alerte module → shape persistable.
 * @param {object} alert
 * @param {string} familleFallback
 * @param {Date|null} datefinex
 * @returns {object}
 */
function normalizeAlert(alert, familleFallback, datefinex) {
  const famille = cleanText(alert?.famille) || familleFallback;
  const yearFromFec = datefinex instanceof Date && !Number.isNaN(datefinex.getTime())
    ? datefinex.getUTCFullYear()
    : null;
  const code = cleanText(alert?.code_controle) || cleanText(alert?.code) || null;
  const baseMotif =
    cleanText(alert?.motif_atypique)
    || cleanText(alert?.motif)
    || cleanText(alert?.libelle)
    || code
    || `${famille} — alerte détection`;
  // Préfixe [FAMILLE|CODE] pour classement UI (accordéon COH / LCB / STAT).
  const tagged = code
    ? `[${famille}|${code}] ${baseMotif.replace(new RegExp(`^\\[${code}\\]\\s*`), '')}`
    : `[${famille}] ${baseMotif}`;
  const motif = tagged;

  const fecMontant = alert?.fec_montant != null
    ? Number(alert.fec_montant)
    : (alert?.montant != null ? Number(alert.montant) : null);

  return {
    famille,
    code_controle: code,
    motif_atypique: motif.slice(0, 500),
    fec_annee: alert?.fec_annee != null ? Number(alert.fec_annee) : yearFromFec,
    fec_ecriture_num: cleanText(alert?.fec_ecriture_num) || cleanText(alert?.EcritureNum),
    fec_ecriture_date: alert?.fec_ecriture_date ?? alert?.EcritureDate ?? null,
    fec_montant: Number.isFinite(fecMontant) ? fecMontant : null,
    fec_libelle: cleanText(alert?.fec_libelle) || cleanText(alert?.EcritureLib),
    fec_journal_code: cleanText(alert?.fec_journal_code) || cleanText(alert?.JournalCode),
  };
}

/**
 * Aplatit les alertes modules ({ lines: [...] }) en lignes persistables.
 * @param {object[]} rawAlerts
 * @param {string} famille
 * @param {Date|null} datefinex
 * @returns {object[]}
 */
function expandModuleAlerts(rawAlerts, famille, datefinex) {
  /** @type {object[]} */
  const out = [];
  for (const alert of rawAlerts || []) {
    const lines = Array.isArray(alert?.lines) ? alert.lines : null;
    if (lines && lines.length > 0) {
      for (const line of lines) {
        out.push(normalizeAlert({
          ...alert,
          EcritureNum: line?.EcritureNum ?? line?.fec_ecriture_num,
          EcritureDate: line?.EcritureDate ?? line?.fec_ecriture_date,
          JournalCode: line?.JournalCode ?? line?.fec_journal_code,
          EcritureLib: line?.EcritureLib ?? line?.fec_libelle,
          montant: line?.montant ?? line?.fec_montant,
          Debit: line?.Debit,
          Credit: line?.Credit,
        }, famille, datefinex));
      }
    } else {
      out.push(normalizeAlert(alert, famille, datefinex));
    }
  }
  return out;
}

/**
 * Charge FEC N + niveau_risque, exécute COH/LCB/STAT (stubs si modules absents).
 *
 * @param {string} codeClient
 * @param {{ niveauRisque?: string|null, datefinex?: Date|string|null }} [options]
 * @returns {Promise<{
 *   code_client: string,
 *   datefinex: Date|null,
 *   niveau_risque: string|null,
 *   k: number,
 *   fec_lines: number,
 *   alerts: object[],
 *   modules: { COH: string, LCB: string, STAT: string },
 * }>}
 */
export async function runDetectionForDossier(codeClient, options = {}) {
  const code = cleanText(codeClient);
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }

  const params = await getDetectionParams(code, {
    niveauRisque: options.niveauRisque,
  });

  const datefinex = options.datefinex != null
    ? (toDateOnly(options.datefinex))
    : await getMaxDateFinex(code);
  /** @type {object[]} */
  let fecLines = [];
  if (datefinex) {
    fecLines = await loadFecLinesBatched(code, datefinex, { batchSize: 5000 });
  }

  const ctx = {
    codeClient: code,
    code_client: code,
    datefinex,
    fecLines,
    lines: fecLines,
    niveauRisque: params.niveauRisque,
    niveau_risque: params.niveauRisque,
    k: params.k,
    seuilEur: params.seuilEur,
    seuilKeur: params.seuilKeur,
    params,
  };

  /** @type {object[]} */
  const alerts = [];
  /** @type {{ COH: string, LCB: string, STAT: string }} */
  const modules = { COH: 'stub', LCB: 'stub', STAT: 'stub' };

  for (const spec of MODULE_SPECS) {
    const runner = await resolveModuleRunner(spec.file, spec.exports);
    if (!runner) {
      // TODO: brancher ${spec.file} (export ${spec.exports[0]}) quand le module lot 1 est livré
      modules[spec.famille] = 'missing';
      continue;
    }
    modules[spec.famille] = 'ok';
    const raw = await runner(ctx);
    const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.alerts) ? raw.alerts : []);
    alerts.push(...expandModuleAlerts(list, spec.famille, datefinex));
  }

  // Pas de plafond : toutes les alertes sont conservées (UI = regroupement COH/LCB/STAT + accordéon).
  return {
    code_client: code,
    datefinex,
    niveau_risque: params.niveauRisque,
    k: params.k,
    fec_lines: fecLines.length,
    alerts,
    alerts_uncapped: alerts.length,
    modules,
  };
}

/**
 * @param {object[]} alerts
 * @returns {'Elevee'|'Moyenne'}
 */
function criticiteFromAlerts(alerts) {
  const hasLcb = (alerts || []).some((a) => {
    const f = cleanText(a?.famille) || '';
    return f.toUpperCase() === 'LCB' || f.toUpperCase().startsWith('LCB');
  });
  return hasLcb ? 'Elevee' : 'Moyenne';
}

/**
 * Persiste un événement TRANSACTION_ATYPIQUE + lignes lab_transactions_atypiques.
 * Idempotent : si un TRANSACTION_ATYPIQUE ouvert existe déjà → skip (pas de doublon job).
 *
 * @param {string} codeClient
 * @param {object[]} alerts
 * @param {{ userId?: string|null, dryRun?: boolean, extraDetail?: object }} [options]
 * @returns {Promise<{
 *   skipped: boolean,
 *   event_id: number|null,
 *   event_created: boolean,
 *   transactions_inserted: number,
 *   criticite: string|null,
 * }>}
 */
export async function persistResults(codeClient, alerts, options = {}) {
  const code = cleanText(codeClient);
  if (!code) {
    throw new LabDossierError('code_client requis', 400);
  }

  const actor = cleanText(options.userId) || 'JOB_LAB';
  const dryRun = Boolean(options.dryRun);
  const list = Array.isArray(alerts) ? alerts : [];

  if (list.length === 0) {
    return {
      skipped: true,
      event_id: null,
      event_created: false,
      transactions_inserted: 0,
      criticite: null,
    };
  }

  const criticite = criticiteFromAlerts(list);

  if (dryRun) {
    return {
      skipped: false,
      event_id: null,
      event_created: true,
      transactions_inserted: list.length,
      criticite,
      dry_run: true,
    };
  }

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const existing = await new sql.Request(transaction)
      .input('code_client', sql.NVarChar(10), code)
      .query(`
        SELECT TOP 1 id
        FROM lab_evenements
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND RTRIM(LTRIM(type_evenement)) = N'TRANSACTION_ATYPIQUE'
          AND RTRIM(LTRIM(statut)) IN (${AUTO_EVENT_OPEN_STATUTS_SQL})
        ORDER BY id DESC
      `);

    if (existing.recordset?.[0]?.id != null) {
      await transaction.commit();
      return {
        skipped: true,
        event_id: existing.recordset[0].id,
        event_created: false,
        transactions_inserted: 0,
        criticite,
      };
    }

    const evenement = await ensureEvenementAutoLab(transaction, {
      codeClient: code,
      typeEvenement: 'TRANSACTION_ATYPIQUE',
      criticite,
      libelle: 'Transaction atypique',
      userId: actor,
      source: JOB_SOURCE,
      extraDetail: {
        alerts_total: list.length,
        familles: [...new Set(list.map((a) => a.famille).filter(Boolean))],
        ...(options.extraDetail && typeof options.extraDetail === 'object'
          ? options.extraDetail
          : {}),
      },
    });

    if (!evenement) {
      await transaction.commit();
      return {
        skipped: true,
        event_id: null,
        event_created: false,
        transactions_inserted: 0,
        criticite,
      };
    }

    if (!evenement.created) {
      await transaction.commit();
      return {
        skipped: true,
        event_id: evenement.id,
        event_created: false,
        transactions_inserted: 0,
        criticite,
      };
    }

    let inserted = 0;
    for (const alert of list) {
      await new sql.Request(transaction)
        .input('code_client', sql.NVarChar(10), code)
        .input('id_evenement', sql.Int, evenement.id)
        .input('fec_annee', sql.Int, alert.fec_annee != null && Number.isFinite(Number(alert.fec_annee))
          ? Number(alert.fec_annee)
          : null)
        .input('fec_ecriture_num', sql.NVarChar(50), alert.fec_ecriture_num)
        .input('fec_ecriture_date', sql.Date, alert.fec_ecriture_date ?? null)
        .input('fec_montant', sql.Decimal(18, 2), alert.fec_montant)
        .input('fec_libelle', sql.NVarChar(200), alert.fec_libelle)
        .input('fec_journal_code', sql.NVarChar(20), alert.fec_journal_code)
        .input('motif_atypique', sql.NVarChar(500), alert.motif_atypique)
        .input('statut', sql.NChar(20), TX_STATUT_OUVERT)
        .input('signale_par', sql.NChar(20), actor)
        .query(`
          INSERT INTO lab_transactions_atypiques (
            code_client, id_evenement,
            fec_annee, fec_ecriture_num, fec_ecriture_date,
            fec_montant, fec_libelle, fec_journal_code,
            motif_atypique, statut, signale_par, date_signalement
          )
          VALUES (
            @code_client, @id_evenement,
            @fec_annee, @fec_ecriture_num, @fec_ecriture_date,
            @fec_montant, @fec_libelle, @fec_journal_code,
            @motif_atypique, @statut, @signale_par, SYSUTCDATETIME()
          )
        `);
      inserted += 1;
    }

    await transaction.commit();

    return {
      skipped: false,
      event_id: evenement.id,
      event_created: true,
      transactions_inserted: inserted,
      criticite,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/**
 * Job cabinet J-14 : sélection → détection → persistance.
 * Si `codeClients` est fourni → ignore le filtre J-14 (test / dry-run ciblé).
 *
 * @param {{
 *   dryRun?: boolean,
 *   userId?: string|null,
 *   asOfDate?: Date|string|null,
 *   codeClients?: string|string[]|null,
 *   datefinex?: Date|string|null,
 * }} [options]
 * @returns {Promise<{
 *   scanned: number,
 *   events_created: number,
 *   alerts_total: number,
 *   skipped: number,
 *   errors: Array<{ code_client: string, message: string }>,
 *   dry_run: boolean,
 *   mode: 'j14'|'code_client',
 *   ids: number[],
 *   details?: object[],
 * }>}
 */
export async function runDetectionJ14Job(options = {}) {
  const actor = cleanText(options.userId) || 'JOB_LAB';
  const dryRun = Boolean(options.dryRun);
  const asOf = options.asOfDate != null ? toDateOnly(options.asOfDate) : todayUtcDate();
  const datefinexOverride = options.datefinex != null ? toDateOnly(options.datefinex) : null;

  const forcedCodes = (Array.isArray(options.codeClients)
    ? options.codeClients
    : (options.codeClients != null ? [options.codeClients] : []))
    .map((c) => cleanText(c))
    .filter(Boolean);

  /** @type {Array<{ code_client: string, date_prochaine_revue: Date|null, niveau_risque: string|null }>} */
  let dossiers;
  let mode = 'j14';
  if (forcedCodes.length > 0) {
    mode = 'code_client';
    dossiers = forcedCodes.map((code_client) => ({
      code_client,
      date_prochaine_revue: null,
      niveau_risque: null,
    }));
  } else {
    dossiers = await selectEligibleDossiersJ14(asOf);
  }
  const scanned = dossiers.length;

  let eventsCreated = 0;
  let alertsTotal = 0;
  let skipped = 0;
  /** @type {number[]} */
  const ids = [];
  /** @type {Array<{ code_client: string, message: string }>} */
  const errors = [];
  /** @type {object[]} */
  const details = [];

  for (const dossier of dossiers) {
    const code = dossier.code_client;
    try {
      const detection = await runDetectionForDossier(code, {
        niveauRisque: dossier.niveau_risque,
        datefinex: datefinexOverride,
      });
      const alerts = detection.alerts || [];
      alertsTotal += alerts.length;
      if (dryRun || forcedCodes.length > 0) {
        const byCode = {};
        for (const a of alerts) {
          const k = a.code_controle || '?';
          byCode[k] = (byCode[k] || 0) + 1;
        }
        details.push({
          code_client: code,
          datefinex: detection.datefinex,
          fec_lines: detection.fec_lines,
          alerts_total: alerts.length,
          alerts_uncapped: detection.alerts_uncapped,
          modules: detection.modules,
          alerts_by_code: byCode,
        });
      }

      if (alerts.length === 0) {
        skipped += 1;
        continue;
      }

      const persisted = await persistResults(code, alerts, {
        userId: actor,
        dryRun,
        extraDetail: {
          date_prochaine_revue: dossier.date_prochaine_revue,
          datefinex: detection.datefinex,
          fec_lines: detection.fec_lines,
          modules: detection.modules,
        },
      });

      if (persisted.skipped) {
        skipped += 1;
        continue;
      }

      if (persisted.event_created) {
        eventsCreated += 1;
        if (persisted.event_id != null) ids.push(persisted.event_id);
      } else {
        skipped += 1;
      }
    } catch (err) {
      errors.push({
        code_client: code,
        message: err?.message || String(err),
      });
    }
  }

  return {
    scanned,
    events_created: eventsCreated,
    alerts_total: alertsTotal,
    skipped,
    errors,
    dry_run: dryRun,
    mode,
    ids,
    ...(details.length ? { details } : {}),
  };
}
