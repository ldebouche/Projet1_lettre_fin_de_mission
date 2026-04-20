import fs from "fs/promises";
import path from "path";
import puppeteer from "puppeteer";
import { pathToFileURL } from "url";
import { JSDOM } from "jsdom";
import { escapeHtml, quillHtmlToPdfHtml } from "../../utils/procedureUtils.js";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function versFileUrl(cheminAbsolu) {
    return pathToFileURL(cheminAbsolu).toString();
}

function buildBrandedCss({ leagueSpartanBoldUrl, quireSansLightUrl }) {
    return `
@font-face {
  font-family: 'League Spartan';
  src: url('${leagueSpartanBoldUrl}') format('truetype');
  font-weight: 700;
  font-style: normal;
}
@font-face {
  font-family: 'Quire Sans';
  src: url('${quireSansLightUrl}') format('truetype');
  font-weight: 300;
  font-style: normal;
}

:root{
  --font-title: 'League Spartan', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
  --font-body: 'Trebuchet MS','Segoe UI',Arial,sans-serif;

  --marron-fonce: #51453d;
  --marron-clair: #786e54;
  --bleu-fonce: #447a87;
  --bleu-clair: #7cc0d0;

  --border: #e7e2d8;
  --paper: #ffffff;
  --soft: #f8f6f2;
}

*{ box-sizing:border-box; }
html,body{ margin:0; padding:0; }
body{
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--marron-fonce);
  padding: 24px;
  background: var(--paper);
}

h1{
  font-family: var(--font-title);
  font-weight: 700;
  font-size: 22px;
  margin: 0 0 10px 0;
  color: var(--marron-fonce);
}
h2{
  font-family: var(--font-title);
  font-weight: 700;
  font-size: 14px;
  margin: 16px 0 8px;
  color: var(--marron-fonce);
}
h3{
  font-family: var(--font-title);
  font-weight: 700;
  font-size: 13px;
  margin: 12px 0 6px;
  color: var(--marron-fonce);
}

.meta{
  font-size: 11px;
  color: var(--marron-clair);
  border-left: 3px solid var(--bleu-clair);
  padding: 6px 10px;
  margin-bottom: 16px;
  background: var(--soft);
  overflow-wrap: anywhere;
}

p{ line-height:1.55; margin: 6px 0; }
ul,ol{ margin: 6px 0 6px 18px; padding:0; }
li{ line-height:1.55; margin: 2px 0; }

li[data-list="bullet"]{ list-style-type: disc; }

.ql-align-center{ text-align:center; }
.ql-align-right{ text-align:right; }
.ql-align-justify{ text-align:justify; }

img{
  display:block;
  max-width:100%;
  height:auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  margin: 8px 0;
}

.card{
  border:1px solid var(--border);
  border-radius:8px;
  padding: 10px 12px;
  margin: 10px 0;
  background: #fff;
}

blockquote{
  margin: 10px 0;
  padding: 8px 12px;
  border-left: 3px solid var(--bleu-clair);
  background: var(--soft);
  color: var(--marron-fonce);
}

pre{
  margin: 10px 0;
  padding: 10px 12px;
  background: var(--soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 11px;
}

code{
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 11px;
}

hr{
  border: none;
  border-top: 1px solid var(--border);
  margin: 14px 0;
}
  `.trim();
}

export async function genererPdfBrandedDepuisQuill({ pdfPath, htmlQuill, source, creePar, assetsDir }) {
    const navigateur = await puppeteer.launch({
        headless: true,
        executablePath: CHROME_PATH,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--allow-file-access-from-files",
            "--disable-web-security",
        ],
    });

    try {
        const page = await navigateur.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        const fontsDir = path.join(process.cwd(), "frontend", "src", "assets", "fonts");
        const leagueSpartanBoldUrl = versFileUrl(
            path.join(fontsDir, "league-spartan", "LeagueSpartan-Bold.ttf")
        );
        const quireSansLightUrl = versFileUrl(path.join(fontsDir, "quire-sans", "QuireSansLight.ttf"));

        const dom = new JSDOM(htmlQuill || "");
        const doc = dom.window.document;

        let titleForPdf = "Procédure";
        const h1 = doc.querySelector("h1");
        const h1Text = (h1?.textContent || "").trim();
        if (h1Text) titleForPdf = h1Text;
        if (h1) h1.remove();

        const bodyHtml = quillHtmlToPdfHtml(doc.body.innerHTML || "");

        const nomUtilisateur = creePar?.nom || "Utilisateur inconnu";
        const emailUtilisateur = creePar?.email || "email inconnu";
        const dateCreation = new Date().toLocaleString("fr-FR");

        const css = buildBrandedCss({ leagueSpartanBoldUrl, quireSansLightUrl });

        const fullHtml = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <style>${css}</style>
</head>
<body>
  <h1>${escapeHtml(titleForPdf)}</h1>
  <div class="meta">Source : ${escapeHtml(source || "")}</div>
  ${bodyHtml}
</body>
</html>`;

        const procDir = assetsDir ? path.dirname(assetsDir) : path.dirname(pdfPath);
        await fs.mkdir(procDir, { recursive: true });

        const tmpHtmlPath = path.join(procDir, "__render__.html");
        await fs.writeFile(tmpHtmlPath, fullHtml, "utf-8");

        await page.goto(pathToFileURL(tmpHtmlPath).toString(), { waitUntil: "domcontentloaded", timeout: 15000 });

        const tmpPdf = pdfPath.replace(/\.pdf$/i, ".tmp.pdf");

        const footerTemplate = `
<div style="font-size:12px;width:100%;padding:0 10mm;color:#786e54;">
  Créé par ${escapeHtml(nomUtilisateur)} (${escapeHtml(emailUtilisateur)}) le ${escapeHtml(dateCreation)}
  <span style="float:right;color:#786e54;">
    <span class="pageNumber"></span>/<span class="totalPages"></span>
  </span>
</div>`;

        await page.evaluate(() => {
            document.querySelectorAll("img").forEach((img) => {
                if (img.loading === "lazy") {
                    img.loading = "eager";
                }

                if (!img.src && img.dataset?.src) {
                    img.src = img.dataset.src;
                }
                if (!img.src && img.dataset?.lazy) {
                    img.src = img.dataset.lazy;
                }
            });
        });

        await page.pdf({
            path: tmpPdf,
            format: "A4",
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: "<div></div>",
            footerTemplate,
            margin: { top: "18mm", bottom: "22mm", left: "15mm", right: "15mm" },
        });

        await fs.rm(pdfPath, { force: true });
        await fs.rename(tmpPdf, pdfPath);
        await fs.rm(tmpHtmlPath, { force: true });

        return { ok: true, pdfPath };
    } finally {
        await navigateur.close();
    }
}
