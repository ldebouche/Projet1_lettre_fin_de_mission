/**
 * Rendu PDF Fiche LCB-FT via Puppeteer (HTML → Buffer).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import puppeteer from 'puppeteer';
import { pathToFileURL } from 'url';
import { getChromeLaunchOptions } from '../config/paths.js';
import { LabDossierError } from './lab-utils.js';

/**
 * @param {string} html
 * @returns {Promise<Buffer>}
 */
export async function renderFicheLcbftPdfBuffer(html) {
  if (!html || typeof html !== 'string') {
    throw new LabDossierError('HTML fiche requis', 500);
  }

  const chromeOpts = getChromeLaunchOptions();
  if (!chromeOpts.executablePath) {
    throw new LabDossierError(
      'Chrome introuvable pour générer le PDF (vérifier CHROME_EXECUTABLE_PATH)',
      503,
    );
  }

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'lab-fiche-lcbft-'));
  const htmlPath = path.join(tmpDir, 'fiche.html');
  const pdfPath = path.join(tmpDir, 'fiche.pdf');

  let browser;
  try {
    await fs.promises.writeFile(htmlPath, html, 'utf8');

    browser = await puppeteer.launch({
      headless: true,
      executablePath: chromeOpts.executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--allow-file-access-from-files',
      ],
    });

    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
    });

    return await fs.promises.readFile(pdfPath);
  } catch (err) {
    if (err instanceof LabDossierError) throw err;
    console.error('Erreur rendu PDF fiche LCB-FT:', err);
    throw new LabDossierError('Impossible de générer le PDF fiche LCB-FT', 500);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
