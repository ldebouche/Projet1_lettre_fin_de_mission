/**
 * Job LAB — détection opérations atypiques J-14 (CLI).
 * Par défaut : dossiers avec date_prochaine_revue = aujourd'hui + 14 jours.
 * Override test : --code-client XXX [--datefinex YYYY-MM-DD] (ignore le filtre J-14).
 * Pas de cron in-process : planificateur Windows 1×/jour (comme revue annuelle).
 * Compte audit : JOB_LAB. Source audit : job_detection_j14.
 *
 * Usage (depuis backend/) :
 *   npm run lab:detection-j14
 *   npm run lab:detection-j14 -- --dry-run
 *   npm run lab:detection-j14 -- --dry-run --code-client 00542
 *   npm run lab:detection-j14 -- --dry-run --code-client 02186 --datefinex 2025-12-31
 */
import { runDetectionJ14Job } from '../services/lab-detection-service.js';
import { poolPromise } from '../config/db.js';

/**
 * @param {string[]} argv
 * @returns {{ dryRun: boolean, codeClients: string[], datefinex: string|null }}
 */
function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  /** @type {string[]} */
  const codeClients = [];
  /** @type {string|null} */
  let datefinex = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--code-client' || arg === '--codeClient') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        codeClients.push(next.trim());
        i += 1;
      }
      continue;
    }
    const eqCode = /^--code-client=(.+)$/i.exec(arg);
    if (eqCode) {
      codeClients.push(eqCode[1].trim());
      continue;
    }
    if (arg === '--datefinex' || arg === '--dateFinex') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        datefinex = next.trim();
        i += 1;
      }
      continue;
    }
    const eqDate = /^--datefinex=(.+)$/i.exec(arg);
    if (eqDate) datefinex = eqDate[1].trim();
  }

  return { dryRun, codeClients: codeClients.filter(Boolean), datefinex };
}

const { dryRun, codeClients, datefinex } = parseArgs(process.argv.slice(2));

try {
  const data = await runDetectionJ14Job({
    userId: 'JOB_LAB',
    dryRun,
    codeClients: codeClients.length ? codeClients : null,
    datefinex,
  });
  console.log(JSON.stringify(data, null, 2));
  process.exitCode = data.errors?.length ? 1 : 0;
} catch (err) {
  console.error('lab:detection-j14 failed:', err?.message || err);
  process.exitCode = 1;
} finally {
  try {
    const pool = await poolPromise;
    await pool.close();
  } catch {
    // pool déjà fermé ou jamais ouvert
  }
}
