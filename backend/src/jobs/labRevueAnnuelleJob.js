/**
 * Job LAB 5.3c — événement REVUE_ANNUELLE pour dossiers à échéance dépassée (CLI).
 * Pas de cron in-process : planificateur Windows 1×/jour (voir docs/ops/lab-jobs-5.3.md).
 * Pas de notification push (alerte visuelle seulement). Compte audit : JOB_LAB.
 *
 * Usage (depuis backend/) : npm run lab:revue-annuelle
 */
import { scanRevueAnnuelleLab } from '../services/lab-plan-service.js';
import { poolPromise } from '../config/db.js';

try {
  const data = await scanRevueAnnuelleLab('JOB_LAB');
  console.log(JSON.stringify(data, null, 2));
  process.exitCode = 0;
} catch (err) {
  console.error('lab:revue-annuelle failed:', err?.message || err);
  process.exitCode = 1;
} finally {
  try {
    const pool = await poolPromise;
    await pool.close();
  } catch {
    // pool déjà fermé ou jamais ouvert
  }
}
