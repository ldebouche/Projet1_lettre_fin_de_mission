import fs from "fs/promises";
import path from "path";
import { PATHS } from "../../config/paths.js";

export function getDocumentsRoot() {
    return PATHS.documentsRoot;
}

export function getChatbotRoot() {
    return path.join(getDocumentsRoot(), "chatbot");
}

export function getAttenteRoot(typeDoc = "") {
    return path.join(getDocumentsRoot(), typeDoc, "attente");
}

export function getIndexerRoot() {
    return path.join(getDocumentsRoot(), "a_indexer");
}

export async function trouverNomDossierDisponible(parentDir, baseName) {
    let index = 0;

    while (true) {
        const folderName = index === 0 ? baseName : `${baseName} (${index})`;
        const folderPath = path.join(parentDir, folderName);

        try {
            await fs.access(folderPath);
            index++;
        } catch {
            return { folderName, folderPath };
        }
    }
}

export async function resolveProcedureFiles(rootFolder, procName) {
    const procDir = path.join(rootFolder, procName);

    let pdfPath = path.join(procDir, `${procName}.pdf`);
    try {
        await fs.access(pdfPath);
    } catch {
        const entries = await fs.readdir(procDir, { withFileTypes: true });
        const firstPdf = entries.find(
            (e) => e.isFile() && path.extname(e.name).toLowerCase() === ".pdf"
        );
        if (!firstPdf) throw new Error(`Aucun PDF trouvé dans ${procDir}`);
        pdfPath = path.join(procDir, firstPdf.name);
    }

    const jsonPath = pdfPath.replace(/\.pdf$/i, ".json");
    return { procDir, pdfPath, jsonPath };
}

export function safeFileName(name = "") {
    return String(name).replace(/[^\w.\-]/g, "_");
}

export async function trouverPremierPdfDansDossier(procDir, fallbackName) {
    let pdfName = `${fallbackName}.pdf`;
    let pdfPath = path.join(procDir, pdfName);

    try {
        await fs.access(pdfPath);
        return { pdfName, pdfPath };
    } catch {
        const files = await fs.readdir(procDir, { withFileTypes: true });
        const firstPdf = files.find((f) => f.isFile() && path.extname(f.name).toLowerCase() === ".pdf");
        if (!firstPdf) return null;
        pdfName = firstPdf.name;
        pdfPath = path.join(procDir, pdfName);
        return { pdfName, pdfPath };
    }
}
