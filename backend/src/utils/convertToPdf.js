import fs from "fs/promises";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { PATHS } from "../config/paths.js";

const execFileAsync = promisify(execFile);

const LIBREOFFICE_PATH = PATHS.libreOfficeExecutablePath;

function isPdf(name = "") {
    return name.toLowerCase().endsWith(".pdf");
}

export async function convertToPdfBuffer(inputBuffer, originalName) {
    if (isPdf(originalName)) return inputBuffer;

    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "convert-"));
    const inputPath = path.join(tmpRoot, originalName);
    await fs.writeFile(inputPath, inputBuffer);

    const outDir = tmpRoot;

    try {
        await execFileAsync(
            LIBREOFFICE_PATH,
            [
                "--headless",
                "--nologo",
                "--nolockcheck",
                "--norestore",
                "--invisible",
                "--convert-to",
                "pdf",
                "--outdir",
                outDir,
                inputPath,
            ],
            { windowsHide: true, timeout: 120000 }
        );

        const base = path.parse(originalName).name;
        const pdfPath = path.join(outDir, `${base}.pdf`);

        let finalPdfPath = pdfPath;
        try {
            await fs.access(finalPdfPath);
        } catch {
            const entries = await fs.readdir(outDir);
            const firstPdf = entries.find((f) => f.toLowerCase().endsWith(".pdf"));
            if (!firstPdf) throw new Error("Conversion OK mais aucun PDF produit.");
            finalPdfPath = path.join(outDir, firstPdf);
        }

        const pdfBuffer = await fs.readFile(finalPdfPath);
        return pdfBuffer;
    } finally {
        await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => { });
    }
}
