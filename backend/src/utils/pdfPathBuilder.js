import path from "path";
import fs from "fs";

export function buildPdfPath({ codeClient, type, dateFinEx }) {
    const annee = dateFinEx.substring(0, 4);

    const baseDir = path.join(
        "C:",
        "outils-avenia",
        codeClient.toUpperCase(),
        "LFM",
        annee.toString(),
        "DEPOT"
    );

    const fileName = `${codeClient}_${type}_${dateFinEx.replace(/-/g, "")}.pdf`;
    const fullPath = path.join(baseDir, fileName);

    if (!fs.existsSync(fullPath)) {
        throw new Error(`Fichier introuvable : ${fullPath}`);
    }

    return fullPath;
}
