/**
 * Job LAB 5.3b — scan des pièces KYC périmées (CLI).
 * Pas de cron in-process : planificateur Windows 1×/jour (voir docs/ops/lab-jobs-5.3.md).
 * Compte audit : JOB_LAB.
 *
 * Usage (depuis backend/) : npm run lab:pieces-perimees
 */
import { scanPiecesPerimeesLab } from '../services/lab-pieces-service.js';
import { poolPromise } from '../config/db.js';

try {
  const data = await scanPiecesPerimeesLab('JOB_LAB');
  console.log(JSON.stringify(data, null, 2));
  process.exitCode = 0;
} catch (err) {
  console.error('lab:pieces-perimees failed:', err?.message || err);
  process.exitCode = 1;
} finally {
  try {
    const pool = await poolPromise;
    await pool.close();
  } catch {
    // pool déjà fermé ou jamais ouvert
  }
}
