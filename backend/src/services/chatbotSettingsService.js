import fs from "fs/promises";
import path from "path";
import puppeteer from "puppeteer";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

import { removePdfFromIndex, indexPdfFile } from "./chatbotRagService.js";

import {
    injectImagePlaceholdersToHtml,
    injectImageAssetsBaseUrl, escapeHtml,
    localiserImagesExternes
} from "../utils/procedureUtils.js";

import {
    getDocumentsRoot,
    getChatbotRoot,
    getAttenteRoot,
    getIndexerRoot,
    trouverNomDossierDisponible,
    resolveProcedureFiles,
    trouverPremierPdfDansDossier,
    safeFileName,
} from "./procedures/procedureFilesService.js";
import { getChromeLaunchOptions } from "../config/paths.js";

import { extraireTexteDepuisPdfBuffer, saveOcrImages } from "./procedures/procedureOcrService.js";
import { corrigerHtmlAvecMistral, reconstruireProcedureAvecMistral } from "./procedures/procedureIaService.js";
import { genererPdfBrandedDepuisQuill } from "./procedures/procedureRenderService.js";

let idCounter = 1;
const MAX_CHARS = 12000;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function scanDirectory(directoryPath, parentId = null, currentRelativePath = "") {
    let items = [];

    try {
        const entries = await fs.readdir(directoryPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(directoryPath, entry.name);
            const relativePath = path.join(currentRelativePath, entry.name);

            if (entry.isDirectory()) {
                const procPdf = path.join(fullPath, `${entry.name}.pdf`);
                const procJson = path.join(fullPath, `${entry.name}.json`);
                const procAssets = path.join(fullPath, "assets");

                const isProcedureFolder = await Promise.all([
                    fs.stat(procPdf).then((s) => s.isFile()).catch(() => false),
                    fs.stat(procJson).then((s) => s.isFile()).catch(() => false),
                    fs.stat(procAssets).then((s) => s.isDirectory()).catch(() => false),
                ]).then(([a, b, c]) => a && b && c);

                if (isProcedureFolder) {
                    const stats = await fs.stat(procPdf);
                    const url = `/api/files/chatbot/${path
                        .join(relativePath, `${entry.name}.pdf`)
                        .replace(/\\/g, "/")}`;

                    items.push({
                        id: idCounter++,
                        name: `${entry.name}.pdf`,
                        isFolder: false,
                        parentId,
                        isExpanded: false,
                        url,
                        filePath: procPdf,
                        importedAt: stats.birthtime.toISOString(),
                    });
                    continue;
                }

                const folderId = idCounter++;
                const stats = await fs.stat(fullPath);

                items.push({
                    id: folderId,
                    name: entry.name,
                    isFolder: true,
                    parentId,
                    isExpanded: false,
                    url: null,
                    filePath: fullPath,
                    importedAt: stats.mtime.toISOString(),
                });

                const children = await scanDirectory(fullPath, folderId, relativePath);
                items = items.concat(children);
            } else if (entry.isFile()) {
            }
        }
    } catch (error) {
        console.error(`Erreur lors du scan du dossier ${directoryPath}:`, error);
    }

    return items;
}

export async function getFileTree() {
    idCounter = 1;
    const rootPath = getChatbotRoot();
    return scanDirectory(rootPath);
}

export async function deleteItemFromIndexedItems(item, indexedItems) {
    if (!indexedItems.find((i) => i.id === parseInt(item.id))) {
        throw new Error("Item not found");
    }

    if (!item.isFolder) {
        const chatbotRoot = getChatbotRoot();
        const relativePath = path.relative(chatbotRoot, item.filePath).replace(/\\/g, "/");
        removePdfFromIndex(relativePath);

        const procDir = path.dirname(item.filePath);
        await fs.rm(procDir, { recursive: true, force: true });
        return;
    }

    await fs.rm(item.filePath, { recursive: true, force: true });
}

export async function createFolderToIndexedItems(folderName, parentId, indexedItems) {
    let parentPath = getChatbotRoot();
    if (parentId !== null) {
        const parent = indexedItems.find((i) => i.id === parentId);
        parentPath = parent.filePath;
    }
    const folderPath = path.join(parentPath, folderName);
    await fs.mkdir(folderPath);
}

const AVAILABLE_ROLES = new Set(["general", "rh", "comptable"]);

function normalizeRoles(inputRoles) {
    const roles = Array.isArray(inputRoles) ? inputRoles : [];
    const clean = roles
        .map(r => String(r).trim().toLowerCase())
        .filter(r => AVAILABLE_ROLES.has(r));

    // si aucun rôle coché : tu choisis la règle
    // Ici: si vide => ["general"]
    return clean.length ? Array.from(new Set(clean)) : ["general"];
}

export async function addFileToIndexedItems(items) {
    const indexerDir = getIndexerRoot();
    const chatbotRoot = getChatbotRoot();

    for (const it of items) {
        const procName = (it.nom || "").trim();
        if (!procName) continue;

        const srcProcDir = path.join(indexerDir, procName);

        let destParent = chatbotRoot;
        const folderObj = it.targetFolder ? JSON.parse(it.targetFolder) : null;
        if (folderObj?.filePath) destParent = folderObj.filePath;

        await fs.mkdir(destParent, { recursive: true });

        const { folderName: finalProcName, folderPath: destProcDir } =
            await trouverNomDossierDisponible(destParent, procName);

        await fs.rename(srcProcDir, destProcDir);

        const pdfPath = path.join(destProcDir, `${finalProcName}.pdf`);
        const relativePath = path.relative(chatbotRoot, pdfPath).replace(/\\/g, "/");

        const roles = normalizeRoles(it.roles);

        await indexPdfFile(pdfPath, relativePath, path.basename(pdfPath), roles);
    }

    return { ok: true };
}

export async function mettreProcedureChatbotEnEdition(pdfItem) {
    if (!pdfItem?.filePath) throw new Error("PDF introuvable");

    const chatbotRoot = getChatbotRoot();
    const attenteRoot = getAttenteRoot();

    const procDir = path.dirname(pdfItem.filePath);
    const procName = path.basename(procDir);

    const rel = path.relative(chatbotRoot, pdfItem.filePath).replace(/\\/g, "/");
    removePdfFromIndex(rel);

    await fs.mkdir(attenteRoot, { recursive: true });

    const { folderPath: destProcDir } = await trouverNomDossierDisponible(attenteRoot, procName);
    await fs.rename(procDir, destProcDir);

    return { ok: true, nom: path.basename(destProcDir) };
}

export async function creerPdfDepuisFichierPdfBuffer(fileBuffer, originalName, utilisateur, nomProcedure) {
    const { texte, images } = await extraireTexteDepuisPdfBuffer(fileBuffer, originalName, MAX_CHARS);
    const texteTronque = (texte || "").slice(0, MAX_CHARS);

    return await creerProcedureEnAttente({
        titre: nomProcedure || originalName.replace(/\.pdf$/i, ""),
        source: `Fichier local : ${originalName}`,
        texte: texteTronque,
        images,
        utilisateur,
        nomProcedure: nomProcedure || originalName.replace(/\.pdf$/i, ""),
    });
}

export async function creerPdfDepuisUrl(url, utilisateur, nomProcedure) {
    const navigateur = await puppeteer.launch({
        headless: true,
        ...getChromeLaunchOptions(),
    });

    try {
        const page = await navigateur.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        const reponse = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
        const status = reponse?.status?.() ?? 0;
        const ok = reponse?.ok?.() ?? true;
        if (!ok || status >= 400) throw new Error(`Page inaccessible (HTTP ${status}) : ${url}`);

        await dormir(300);

        const pageHtml = await page.content();
        const pageUrl = page.url();

        const { titre, source, text: contentHtml } = extraireTexteProcedureDepuisHtml(pageHtml, pageUrl);

        return await creerProcedureEnAttente({
            titre,
            source,
            texte: contentHtml,
            utilisateur,
            nomProcedure,
            images: [],
            pageUrl,
            isExternalHtml: true,
        });
    } finally {
        await navigateur.close();
    }
}

async function creerProcedureEnAttente({ titre, source, texte, utilisateur, nomProcedure, images = [], pageUrl = null, isExternalHtml = false }) {
    const attentePath = getAttenteRoot();
    await fs.mkdir(attentePath, { recursive: true });

    const { folderName, folderPath: procDir } = await trouverNomDossierDisponible(attentePath, nomProcedure);
    await fs.mkdir(procDir, { recursive: true });

    const assetsDir = path.join(procDir, "assets");
    const savedImages = await saveOcrImages(assetsDir, images);

    const assets = {
        images: savedImages,
        assetsDir,
        imagesBaseUrl: `/api/files/attente/${encodeURIComponent(folderName)}/assets/`,
    };

    const isHtmlInput = /<\w+[\s>]/.test(texte || "");

    let quillHtml = "";

    if (isHtmlInput) {
        quillHtml = `<h1>${escapeHtml(titre || "Procédure")}</h1>\n` + String(texte || "");

        if (isExternalHtml && pageUrl) {
            const { html: localizedHtml, images: downloaded } = await localiserImagesExternes(
                quillHtml,
                assetsDir,
                pageUrl
            );

            savedImages.splice(0, savedImages.length, ...downloaded);

            quillHtml = injectImageAssetsBaseUrl(localizedHtml, { baseUrl: assets.imagesBaseUrl });
        }
    } else {
        quillHtml = await reconstruireProcedureAvecMistral({
            titre,
            source,
            texte,
            imageNames: savedImages,
        });

        quillHtml = injectImagePlaceholdersToHtml(quillHtml, { baseUrl: assets.imagesBaseUrl });
    }

    const pdfPath = path.join(procDir, `${folderName}.pdf`);
    await genererPdfBrandedDepuisQuill({
        pdfPath,
        htmlQuill: quillHtml,
        source,
        creePar: utilisateur ? { nom: utilisateur.name ?? null, email: utilisateur.unique_name ?? null } : null,
        assetsDir,
    });

    const meta = {
        nom: folderName,
        urlSource: source,
        dateCreation: new Date().toISOString(),
        creePar: utilisateur ? { nom: utilisateur.name ?? null, email: utilisateur.unique_name ?? null } : null,
        procedureHtml: quillHtml,
        assets: {
            images: savedImages,
            assetsDir,
            imagesBaseUrl: assets.imagesBaseUrl,
        },

        lastEditedAt: null,
    };

    const jsonPath = pdfPath.replace(/\.pdf$/i, ".json");
    await fs.writeFile(jsonPath, JSON.stringify(meta, null, 2), "utf-8");

    console.log(meta);

    return { ok: true, cheminPdf: pdfPath, dossierProcedure: procDir, nom: folderName };
}

export async function getProced(folderName) {
    const root = path.join(getDocumentsRoot(), folderName);
    const entries = await fs.readdir(root, { withFileTypes: true });

    const procedures = [];

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const procDir = path.join(root, entry.name);
        const found = await trouverPremierPdfDansDossier(procDir, entry.name);
        if (!found) continue;

        const { pdfPath } = found;
        const jsonPath = pdfPath.replace(/\.pdf$/i, ".json");

        let meta = null;
        try {
            meta = JSON.parse(await fs.readFile(jsonPath, "utf-8"));
        } catch {
            meta = { nom: entry.name, urlSource: null };
        }

        const stats = await fs.stat(pdfPath);

        procedures.push({
            nom: meta.nom || entry.name,
            tailleOctets: stats.size,
            dateCreation: stats.birthtime?.toISOString?.() ?? stats.ctime.toISOString(),
            pdfUrl: `/api/files/${folderName}/${encodeURIComponent(entry.name)}/${encodeURIComponent(
                path.basename(pdfPath)
            )}`.replace(/\\/g, "/"),
            urlSource: meta.urlSource,
            targetFolder: null,
        });
    }

    procedures.sort((a, b) => Date.parse(b.dateCreation) - Date.parse(a.dateCreation));
    return procedures;
}

export async function getProcedureEditable(folderName, nomSansExt) {
    const root = path.join(getDocumentsRoot(), folderName);
    const { jsonPath } = await resolveProcedureFiles(root, nomSansExt);

    const meta = JSON.parse(await fs.readFile(jsonPath, "utf-8"));
    let html = meta.procedureHtml || "";

    if (/\[\[IMG:/i.test(html) && meta?.assets?.imagesBaseUrl) {
        html = injectImagePlaceholdersToHtml(html, { baseUrl: meta.assets.imagesBaseUrl });
    }

    return {
        nom: meta.nom,
        urlSource: meta.urlSource,
        procedureHtml: html,
        procedure: meta.procedure || null,
    };
}

export async function updateProcedureFromEdit(folderName, nomSansExt, editedHtml) {
    if (!editedHtml || !editedHtml.trim()) throw new Error("Texte édité vide.");

    const root = path.join(getDocumentsRoot(), folderName);
    const { pdfPath, jsonPath, procDir } = await resolveProcedureFiles(root, nomSansExt);

    const meta = JSON.parse(await fs.readFile(jsonPath, "utf-8"));

    meta.assets = meta.assets || {};
    meta.assets.assetsDir = meta.assets.assetsDir || path.join(procDir, "assets");
    meta.assets.imagesBaseUrl =
        meta.assets.imagesBaseUrl ||
        `/api/files/${encodeURIComponent(folderName)}/${encodeURIComponent(meta.nom || nomSansExt)}/assets/`;

    const correctedHtml = await corrigerHtmlAvecMistral(editedHtml);

    meta.procedureHtml = correctedHtml;
    meta.lastEditedAt = new Date().toISOString();

    await genererPdfBrandedDepuisQuill({
        pdfPath,
        htmlQuill: correctedHtml,
        source: meta?.urlSource || "",
        creePar: meta?.creePar || null,
        assetsDir: meta.assets.assetsDir,
    });

    await fs.writeFile(jsonPath, JSON.stringify(meta, null, 2), "utf-8");
    return { ok: true, procedureHtml: meta.procedureHtml };
}

export async function accepterProcedure(nomProcedure) {
    if (!nomProcedure || !nomProcedure.trim()) throw new Error("Nom de procédure invalide");

    const attenteDir = getAttenteRoot();
    const indexerDir = getIndexerRoot();
    await fs.mkdir(indexerDir, { recursive: true });

    const srcDir = path.join(attenteDir, nomProcedure);
    const st = await fs.stat(srcDir).catch(() => null);
    if (!st?.isDirectory()) throw new Error(`Dossier procédure introuvable: ${srcDir}`);

    const { folderName, folderPath } = await trouverNomDossierDisponible(indexerDir, nomProcedure);
    await fs.rename(srcDir, folderPath);

    return { ok: true, nom: folderName };
}

export async function rejeterProcedure(nomProcedure) {
    if (!nomProcedure || !nomProcedure.trim()) throw new Error("Nom de procédure invalide");

    const attenteDir = getAttenteRoot();
    const procDir = path.join(attenteDir, nomProcedure);

    await fs.rm(procDir, { recursive: true, force: true });
    return { ok: true };
}

export async function getCompteurFichiers() {
    const attenteDir = getAttenteRoot();
    const indexerDir = getIndexerRoot();

    const countProcFolders = async (dir) => {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            return entries.filter((e) => e.isDirectory()).length;
        } catch {
            return 0;
        }
    };

    return {
        verif: await countProcFolders(attenteDir),
        index: await countProcFolders(indexerDir),
    };
}

export async function uploadProcedureImage(folderName, procedureName, file) {
    const procDir = path.join(getDocumentsRoot(), folderName, procedureName);
    const assetsDir = path.join(procDir, "assets");
    await fs.mkdir(assetsDir, { recursive: true });

    const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
    const base = safeFileName(path.basename(file.originalname || "image", ext));
    const finalName = `${base}-${Date.now()}${ext}`;
    const dst = path.join(assetsDir, finalName);

    await fs.writeFile(dst, file.buffer);

    const url = `/api/files/${encodeURIComponent(folderName)}/${encodeURIComponent(
        procedureName
    )}/assets/${encodeURIComponent(finalName)}`;

    return { ok: true, name: finalName, url };
}

function extraireTexteProcedureDepuisHtml(pageHtml, pageUrl) {
    const dom = new JSDOM(pageHtml, { url: pageUrl });
    const doc = dom.window.document;

    doc.querySelectorAll("script, style, noscript").forEach((n) => n.remove());

    const reader = new Readability(doc);
    const article = reader.parse();

    const titre =
        normalizeUtf8String(
            (article?.title || "").trim() ||
            doc.querySelector("h1")?.textContent?.trim() ||
            doc.title ||
            "Procédure"
        );

    let contentHtml = String(article?.content || "").trim();

    return { titre, source: pageUrl, text: contentHtml };
}

export async function remettreProcedureEnAttenteDepuisIndexer(nomProcedure) {
    if (!nomProcedure || !nomProcedure.trim()) throw new Error("Nom de procédure invalide");

    const indexerDir = getIndexerRoot();
    const attenteDir = getAttenteRoot();

    await fs.mkdir(attenteDir, { recursive: true });

    const srcDir = path.join(indexerDir, nomProcedure);
    const st = await fs.stat(srcDir).catch(() => null);
    if (!st?.isDirectory()) throw new Error(`Dossier indexer introuvable: ${srcDir}`);

    const { folderPath: destDir } = await trouverNomDossierDisponible(attenteDir, nomProcedure);
    await fs.rename(srcDir, destDir);

    return { ok: true, nom: path.basename(destDir) };
}