import fs from "fs/promises";
import path from "path";
import puppeteer from "puppeteer";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import axios from "axios";
import pdf from "pdf-parse-fork";
import { removePdfFromIndex, indexPdfFile } from "./chatbotRagService.js";

let idCounter = 1;

async function scanDirectory(directoryPath, parentId = null, currentRelativePath = '') {
    let items = [];
    try {
        const entries = await fs.readdir(directoryPath, { withFileTypes: true });

        for (const entry of entries) {
            const currentId = idCounter++;
            const fullPath = path.join(directoryPath, entry.name);
            const relativePath = path.join(currentRelativePath, entry.name);

            const url = entry.isFile() ? `/api/files/chatbot/${relativePath.replace(/\\/g, "/")}` : null;

            const stats = await fs.stat(fullPath);
            const importedAt = entry.isFile() ? stats.birthtime.toISOString() : stats.mtime.toISOString();

            const item = {
                id: currentId,
                name: entry.name,
                isFolder: entry.isDirectory(),
                parentId: parentId,
                isExpanded: false,
                url: url,
                filePath: fullPath,
                importedAt: importedAt
            };
            items.push(item);

            if (entry.isDirectory()) {
                const children = await scanDirectory(fullPath, currentId, relativePath);
                items = items.concat(children);
            }
        }
    } catch (error) {
        console.error(`Erreur lors du scan du dossier ${directoryPath}:`, error);
    }
    return items;
}

export async function getFileTree() {
    idCounter = 1;
    const rootPath = path.join(process.cwd(), "documents", "chatbot");
    return scanDirectory(rootPath);
}

export async function deleteItemFromIndexedItems(item, indexedItems) {
    if (!indexedItems.find(i => i.id === parseInt(item.id))) {
        throw new Error("Item not found");
    }

    if (!item.isFolder) {
        const relativePath = path
            .relative(path.join(process.cwd(), "documents", "chatbot"), item.filePath)
            .replace(/\\/g, "/");

        removePdfFromIndex(relativePath);
    }

    await fs.rm(item.filePath, { recursive: true, force: true });
}

export async function createFolderToIndexedItems(folderName, parentId, indexedItems) {
    let parentPath = path.join(process.cwd(), "documents", "chatbot");
    if (parentId !== null) {
        const parent = indexedItems.find(i => i.id === parentId);
        parentPath = parent.filePath;
    }
    const folderPath = path.join(parentPath, folderName);
    await fs.mkdir(folderPath);
}

export async function addFileToIndexedItems(items) {
    const indexerDir = path.join(process.cwd(), "documents", "a_indexer");
    const baseDest = path.join(process.cwd(), "documents", "chatbot");

    for (const it of items) {
        let fileName = it.nom;
        if (!fileName.toLowerCase().endsWith(".pdf")) fileName += ".pdf";

        const srcPdf = path.join(indexerDir, fileName);

        let destDir = baseDest;
        const folderObj = it.targetFolder ? JSON.parse(it.targetFolder) : null;
        if (folderObj?.filePath) destDir = folderObj.filePath;

        await fs.mkdir(destDir, { recursive: true });

        const dstPdf = path.join(destDir, fileName);

        await fs.rename(srcPdf, dstPdf);

        const relativePath = path
            .relative(baseDest, dstPdf)
            .replace(/\\/g, "/");

        await indexPdfFile(dstPdf, relativePath, fileName);
    }

    return { ok: true };
}

export async function creerPdfDepuisFichierPdfBuffer(fileBuffer, originalName, utilisateur, nomProcedure) {
    const texte = await extraireTexteDepuisPdfBuffer(fileBuffer);

    const MAX_CHARS = 12000;
    const texteTronque = (texte || "").slice(0, MAX_CHARS);

    return await creerProcedureEnAttente({
        titre: nomProcedure || originalName.replace(/\.pdf$/i, ""),
        source: `Fichier local : ${originalName}`,
        texte: texteTronque,
        utilisateur,
        nomProcedure: nomProcedure || originalName.replace(/\.pdf$/i, ""),
    });
}

async function extraireTexteDepuisPdfBuffer(buffer) {
    const data = await pdf(buffer, {
    });

    let text = (data?.text || "").trim();

    text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

    const MAX_CHARS = 12000;
    if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);

    return text;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export async function creerPdfDepuisUrl(url, utilisateur, nomProcedure) {
    const navigateur = await puppeteer.launch({
        headless: true,
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    });

    try {
        const page = await navigateur.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        const reponse = await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
        const status = reponse?.status?.() ?? 0;
        const ok = reponse?.ok?.() ?? true;
        if (!ok || status >= 400) throw new Error(`Page inaccessible (HTTP ${status}) : ${url}`);

        await dormir(700);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await dormir(400);

        const pageHtml = await page.content();
        const pageUrl = page.url();
        const { titre, source, text } = extraireTexteProcedureDepuisHtml(pageHtml, pageUrl);

        return await creerProcedureEnAttente({
            titre,
            source,
            texte: text,
            utilisateur,
            nomProcedure,
        });
    } finally {
        await navigateur.close();
    }
}

async function creerProcedureEnAttente({ titre, source, texte, utilisateur, nomProcedure }) {
    const dossierSortie = path.join(process.cwd(), "documents", "attente");
    await fs.mkdir(dossierSortie, { recursive: true });

    const navigateur = await puppeteer.launch({
        headless: true,
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    });

    try {
        const page = await navigateur.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        const procedure = await reconstruireProcedureAvecMistral({
            titre,
            source,
            texte,
        });

        const htmlProcedure = procedureJsonToHtml(procedure);

        const dossierFontsFrontend = path.join(process.cwd(), "frontend", "src", "assets", "fonts");
        const leagueSpartanBold = versFileUrl(
            path.join(dossierFontsFrontend, "league-spartan", "LeagueSpartan-Bold.ttf")
        );
        const quireSansLight = versFileUrl(
            path.join(dossierFontsFrontend, "quire-sans", "QuireSansLight.ttf")
        );

        const nomUtilisateur = utilisateur?.name || "Utilisateur inconnu";
        const emailUtilisateur = utilisateur?.unique_name || "email inconnu";
        const dateCreation = new Date().toLocaleString("fr-FR");

        await page.setContent(
            `<!doctype html>
      <html lang="fr">
        <head>
          <meta charset="utf-8" />
          <style>
            @font-face {
              font-family: 'League Spartan';
              src: url('${leagueSpartanBold}') format('truetype');
              font-weight: 700;
              font-style: normal;
            }
            @font-face {
              font-family: 'Quire Sans';
              src: url('${quireSansLight}') format('truetype');
              font-weight: 300;
              font-style: normal;
            }

            :root{
              --font-title: 'League Spartan', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
              --font-subtitle: 'Quire Sans', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
              --font-body: 'Trebuchet MS', 'Segoe UI', Arial, sans-serif;

              --marron-fonce: #51453d;
              --marron-clair: #786e54;
              --bleu-fonce: #447a87;
              --bleu-clair: #7cc0d0;
              --creme: #ebe3d5;
            }

            body {
              font-family: var(--font-body);
              font-size: 12px;
              color: var(--marron-fonce);
              padding: 24px;
              background: #fff;
            }

            h1 {
              font-family: var(--font-title);
              font-weight: 700;
              font-size: 22px;
              margin: 0 0 10px 0;
              color: var(--marron-fonce);
            }

            .meta {
              font-size: 11px;
              color: var(--marron-clair);
              border-left: 3px solid var(--bleu-clair);
              padding: 6px 10px;
              margin-bottom: 16px;
              background: #f8f6f2;
              overflow-wrap: anywhere;
            }

            .section-title {
              font-family: var(--font-title);
              font-weight: 700;
              color: var(--marron-fonce);
              margin: 16px 0 8px;
              font-size: 14px;
            }

            .bloc {
              border: 1px solid #e7e2d8;
              border-radius: 8px;
              padding: 10px 12px;
              margin: 10px 0;
              background: #fff;
            }

            .tag {
              display: inline-block;
              font-size: 10px;
              padding: 2px 8px;
              border-radius: 999px;
              background: #f0f7f9;
              color: var(--bleu-fonce);
              margin-right: 6px;
              margin-bottom: 6px;
            }

            ul, ol { margin: 6px 0 6px 18px; }
            li { line-height: 1.5; margin: 2px 0; }
            p { line-height: 1.5; margin: 6px 0; }

            .steps { counter-reset: step; }
            .step {
              margin: 10px 0;
              padding: 10px 12px;
              border-left: 4px solid var(--bleu-clair);
              background: #faf9f7;
              border-radius: 8px;
            }
            .step-title{
              font-family: var(--font-title);
              font-weight: 700;
              margin-bottom: 6px;
            }
            .step-title:before{
              counter-increment: step;
              content: "Étape " counter(step) " — ";
              color: var(--bleu-fonce);
            }

            code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
            pre { background: #f7f7f7; padding: 10px; border-radius: 6px; overflow: auto; }

            a { color: var(--bleu-fonce); text-decoration: none; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(procedure.titre || titre || "Procédure")}</h1>
          <div class="meta">
            Source : ${escapeHtml(source)}
          </div>
          ${htmlProcedure}
        </body>
      </html>`,
            { waitUntil: "domcontentloaded" }
        );

        const cheminPdf = await trouverNomPdfDisponible(dossierSortie, nomProcedure);

        const piedDePage = `
        <div style="font-size:12px;width:100%;padding:0 10mm;color:#786e54;">
            Créé par ${escapeHtml(nomUtilisateur)} (${escapeHtml(emailUtilisateur)}) le ${escapeHtml(dateCreation)}
            <span style="float:right;color:#786e54;">
                <span class="pageNumber"></span>/<span class="totalPages"></span>
            </span>
        </div>
        `;

        await page.pdf({
            path: cheminPdf,
            format: "A4",
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: "<div></div>",
            footerTemplate: piedDePage,
            margin: { top: "18mm", bottom: "22mm", left: "15mm", right: "15mm" },
        });

        const meta = {
            nom: path.basename(cheminPdf, ".pdf"),
            urlSource: source,
            dateCreation: new Date().toISOString(),
            creePar: utilisateur ? { nom: utilisateur.name ?? null, email: utilisateur.email ?? null } : null,
        };

        await ecrireJsonProcedure(cheminPdf, meta);

        return { ok: true, cheminPdf };
    } finally {
        await navigateur.close();
    }
}

function extraireTexteProcedureDepuisHtml(pageHtml, pageUrl) {
    const dom = new JSDOM(pageHtml, { url: pageUrl });
    const doc = dom.window.document;

    doc.querySelectorAll("script, style, noscript").forEach((n) => n.remove());

    const reader = new Readability(doc);
    const article = reader.parse();

    const titre =
        (article?.title || "").trim() ||
        doc.querySelector("h1")?.textContent?.trim() ||
        doc.title ||
        "Procédure";

    let text = (article?.textContent || doc.body.textContent || "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    const MAX_CHARS = 12000;
    if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);

    return { titre, source: pageUrl, text };
}

async function reconstruireProcedureAvecMistral({ titre, source, texte }) {
    const apiKey = process.env.MISTRAL_API_KEY;
    const baseUrl = process.env.MISTRAL_BASE_URL;
    const model = 'mistral-large-latest';

    if (!apiKey) throw new Error("MISTRAL_API_KEY manquant (env).");
    if (!baseUrl) throw new Error("MISTRAL_BASE_URL manquant (env).");
    if (!model) throw new Error("MISTRAL_MODEL manquant (env).");

    const MAX_CHARS = 12000;
    const texteTronque = (texte || "").slice(0, MAX_CHARS);

    const prompt = `
Tu dois répondre UNIQUEMENT avec un JSON valide (objet), sans texte autour.

Format attendu:
{
    "titre": string,
    "resume": string,
    "prerequis": string[],
    "etapes": [
        { "titre": string, "actions": string[], "resultat_attendu": string|null }
    ],
    "cas_particuliers": string[],
    "notes": string[],
    "source": string
}

Règles:
- Supprime TOUS les éléments parasites (menus, navigation, tabs, boutons, "copier", "ressources connexes", etc.)
- Ne garde que le contenu procédural utile.
- Actions = phrases courtes commençant par un verbe.
- Si info manquante : reste générique, n’invente pas de détails techniques précis.
- source doit être exactement: "${source}"

Titre détecté: ${titre}

Texte:
"""${texteTronque}"""
    `.trim();

    const resp = await axios.post(
        `${baseUrl}/chat/completions`,
        {
            model,
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: "Tu es un assistant qui rédige des procédures. JSON uniquement." },
                { role: "user", content: prompt },
            ],
        },
        { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    const content = resp.data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Réponse Mistral vide.");

    let obj;
    try {
        obj = JSON.parse(content);
    } catch {
        const extracted = extrairePremierJsonObject(content);
        if (!extracted) throw new Error("Réponse Mistral non JSON exploitable.");
        obj = JSON.parse(extracted);
    }

    if (!obj.titre) obj.titre = titre || "Procédure";
    obj.source = source;

    obj.prerequis = Array.isArray(obj.prerequis) ? obj.prerequis : [];
    obj.etapes = Array.isArray(obj.etapes) ? obj.etapes : [];
    obj.cas_particuliers = Array.isArray(obj.cas_particuliers) ? obj.cas_particuliers : [];
    obj.notes = Array.isArray(obj.notes) ? obj.notes : [];

    return obj;
}

function extrairePremierJsonObject(s) {
    const start = s.indexOf("{");
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < s.length; i++) {
        if (s[i] === "{") depth++;
        if (s[i] === "}") depth--;
        if (depth === 0) return s.slice(start, i + 1);
    }
    return null;
}

function procedureJsonToHtml(p) {
    const esc = escapeHtml;

    const tags = (p.prerequis || []).map(x => `<span class="tag">${esc(x)}</span>`).join("");

    const prerequisBloc = (p.prerequis?.length)
        ? `<div class="bloc">
            <div class="section-title">Pré-requis</div>
            <div>${tags}</div>
        </div>`
        : "";

    const resumeBloc = p.resume
        ? `<div class="bloc">
            <div class="section-title">Résumé</div>
            <p>${esc(p.resume)}</p>
        </div>`
        : "";

    const steps = (p.etapes || []).map(et => {
        const actions = (et.actions || []).map(a => `<li>${esc(a)}</li>`).join("");
        const resultat = et.resultat_attendu
            ? `<p><strong>Résultat attendu :</strong> ${esc(et.resultat_attendu)}</p>`
            : "";
        return `
        <div class="step">
            <div class="step-title">${esc(et.titre || "Action")}</div>
            ${actions ? `<ul>${actions}</ul>` : ""}
            ${resultat}
        </div>
    `;
    }).join("");

    const etapesBloc = (p.etapes?.length)
        ? `<div class="section-title">Étapes</div><div class="steps">${steps}</div>`
        : "";

    const casBloc = (p.cas_particuliers?.length)
        ? `<div class="bloc">
            <div class="section-title">Cas particuliers</div>
            <ul>${p.cas_particuliers.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
        </div>`
        : "";

    const notesBloc = (p.notes?.length)
        ? `<div class="bloc">
            <div class="section-title">Notes</div>
            <ul>${p.notes.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
        </div>`
        : "";

    return `${resumeBloc}${prerequisBloc}${etapesBloc}${casBloc}${notesBloc}`;
}

const versFileUrl = (cheminAbsolu) =>
    'file:///' + cheminAbsolu.replace(/\\/g, '/');

const escapeHtml = (texte = '') =>
    String(texte).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));

async function trouverNomPdfDisponible(dossier, nomBase) {
    let index = 0;
    let nomFichier;

    while (true) {
        nomFichier =
            index === 0
                ? `${nomBase}.pdf`
                : `${nomBase} (${index}).pdf`;

        const chemin = path.join(dossier, nomFichier);

        try {
            await fs.access(chemin);
            index++;
        } catch {
            return chemin;
        }
    }
}

async function ecrireJsonProcedure(cheminPdf, meta) {
    const cheminJson = cheminPdf.replace(/\.pdf$/i, ".json");
    await fs.writeFile(cheminJson, JSON.stringify(meta, null, 2), "utf-8");
    return cheminJson;
}

export async function getProced(folderName) {
    const dossier = path.join(process.cwd(), 'documents', folderName);
    const fichiers = await fs.readdir(dossier, { withFileTypes: true });

    const procedures = [];

    for (let fichier of fichiers) {
        if (!fichier.isFile()) continue;

        const extension = path.extname(fichier.name).toLowerCase();
        if (extension !== '.pdf') continue;

        const fullPath = path.join(dossier, fichier.name);
        const stats = await fs.stat(fullPath);

        const cheminJson = fullPath.replace(/\.pdf$/i, ".json");
        const json = await fs.readFile(cheminJson, "utf-8");
        const meta = JSON.parse(json);

        procedures.push({
            nom: meta.nom,
            tailleOctets: stats.size,
            dateCreation: stats.birthtime?.toISOString?.() ?? stats.ctime.toISOString(),
            pdfUrl: `/api/files/${folderName}/${encodeURIComponent(fichier.name)}`.replace(/\\/g, "/"),
            urlSource: meta.urlSource,
            targetFolder: null,
        });
    }
    procedures.sort((a, b) => Date.parse(b.dateCreation) - Date.parse(a.dateCreation));

    return procedures;
}

export async function accepterProcedure(fileName) {
    if (fileName) {
        fileName = fileName + ".pdf";
    }
    const attenteDir = path.join(process.cwd(), "documents/attente");
    const indexerDir = path.join(process.cwd(), "documents/a_indexer");

    await fs.mkdir(indexerDir, { recursive: true });

    const srcPdf = path.join(attenteDir, fileName);
    const srcJson = srcPdf.replace(/\.pdf$/i, ".json");

    const dstPdf = path.join(indexerDir, fileName);
    const dstJson = dstPdf.replace(/\.pdf$/i, ".json");

    if (!fileName.toLowerCase().endsWith(".pdf")) {
        throw new Error("Nom de fichier invalide");
    }

    await fs.rename(srcPdf, dstPdf);
    try {
        await fs.rename(srcJson, dstJson);
    } catch {
    }

    return { ok: true };
}

export async function getCompteurFichiers() {
    const attenteDir = path.join(process.cwd(), "documents", "attente");
    const indexerDir = path.join(process.cwd(), "documents", "a_indexer");

    const countPdf = async (dir) => {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            return entries.filter(e => e.isFile() && path.extname(e.name).toLowerCase() === '.pdf').length;
        } catch {
            return 0;
        }
    };

    return {
        verif: await countPdf(attenteDir),
        index: await countPdf(indexerDir),
    };
}