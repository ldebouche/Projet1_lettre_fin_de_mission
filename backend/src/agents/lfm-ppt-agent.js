import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { PATHS, getAgentLogFile, getJobsDir } from "../config/paths.js";

const JOBS_DIR = getJobsDir();
const dataPath = path.join(PATHS.templatesRoot, "data.json");
const vbsPath = path.join(PATHS.templatesRoot, "launchPPT.vbs");
const templatePath = path.join(PATHS.templatesRoot, "modele_complet.pptm");

let isRunning = false;

function log(...args) {
    const line = `[${new Date().toISOString()}] ` + args.join(" ") + "\n";
    fs.mkdirSync(path.dirname(getAgentLogFile()), { recursive: true });
    fs.appendFileSync(getAgentLogFile(), line);
    console.log(...args);
}

function processJob(fullPath, jobFile) {
    isRunning = true;
    log("Traitement du job :", fullPath);

    try {
        const raw = fs.readFileSync(fullPath, "utf8");
        const job = JSON.parse(raw);

        const filePath = path.join(
            job.folderPath,
            `lfm_${job.variables.code_client}_${job.variables.anneeN}.pptm`
        );

        fs.writeFileSync(dataPath, JSON.stringify(job.variables), "utf8");

        const cmd = `cscript //nologo "${vbsPath}" "${filePath}" "${templatePath}"`;
        log("Commande VBS :", cmd);

        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                log("Erreur VBS:", error);
                try { fs.renameSync(fullPath, fullPath + ".error"); } catch(e) { log("Erreur renommage fichier:", e); }
            } else {
                if (stderr) log("VBS stderr:", stderr);
                log("PPT généré avec succès:", stdout);
                try { fs.renameSync(fullPath, fullPath + ".done"); } catch(e) { log("Erreur renommage fichier:", e); }
            }
            isRunning = false; 
        });

    } catch (err) {
        log("Erreur critique lors de la préparation du job (ex: JSON invalide):", err);
        
        try { fs.renameSync(fullPath, fullPath + ".error"); } catch(e) { log("Erreur renommage fichier corrompu:", e); }
        
        isRunning = false; 
    }
}

function scanJobs() {
    if (isRunning) return;

    try {
        const files = fs.readdirSync(JOBS_DIR)
            .filter(f => f.endsWith(".json"));

        if (files.length === 0) return;

        const jobFile = files[0];
        const fullPath = path.join(JOBS_DIR, jobFile);

        processJob(fullPath, jobFile);

    } catch (err) {
        log("Erreur scanJobs :", err);
    }
}

log("Agent LFM PPT démarré. Surveillance du dossier :", JOBS_DIR);

setInterval(scanJobs, 2000);
