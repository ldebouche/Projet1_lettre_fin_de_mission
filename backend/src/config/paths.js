import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcRoot = path.resolve(__dirname, "..");
const backendRoot = path.resolve(srcRoot, "..");
const repoRoot = path.resolve(backendRoot, "..");

function envOrDefault(name, fallback) {
    const value = process.env[name];
    return value && String(value).trim() ? String(value).trim() : fallback;
}

export const PATHS = {
    repoRoot,
    backendRoot,
    srcRoot,

    documentsRoot: envOrDefault("DOCUMENTS_ROOT", path.join(repoRoot, "documents")),
    dataRoot: envOrDefault("DATA_DIR", path.join(repoRoot, "data")),
    clientFilesRoot: envOrDefault("CLIENT_FILES_ROOT", path.join(repoRoot, "data", "clients")),

    /** Racine fichiers clients type LFM : C:\outils-avenia\{CODE}\… */
    outilsAveniaRoot: envOrDefault("OUTILS_AVENIA_ROOT", path.join("C:", "outils-avenia")),

    templatesRoot: path.join(srcRoot, "templates"),
    utilsRoot: path.join(srcRoot, "utils"),
    fontsRoot: path.join(repoRoot, "frontend", "src", "assets", "fonts"),

    chromeExecutablePath: envOrDefault(
        "CHROME_EXECUTABLE_PATH",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    ),
    libreOfficeExecutablePath: envOrDefault(
        "LIBREOFFICE_EXECUTABLE_PATH",
        "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    ),
    pythonExecutablePath: envOrDefault("PYTHON_EXECUTABLE_PATH", "python"),
};

/** Dossier pièces LAB : C:\outils-avenia\{CODE}\pieces_lab (comme LFM sous le même root). */
export function getLabPiecesDir(codeClient) {
    const code = codeClient != null ? String(codeClient).trim().toUpperCase() : '';
    return path.join(PATHS.outilsAveniaRoot, code, 'pieces_lab');
}

export function getJobsDir() {
    return path.join(PATHS.dataRoot, "jobs_ppt");
}

export function getAgentLogFile() {
    return path.join(PATHS.dataRoot, "log_agent", "lfm-ppt-agent.log");
}

export function getChromeLaunchOptions() {
    const executablePath = PATHS.chromeExecutablePath;
    if (!executablePath || !fs.existsSync(executablePath)) {
        return {};
    }

    return { executablePath };
}
