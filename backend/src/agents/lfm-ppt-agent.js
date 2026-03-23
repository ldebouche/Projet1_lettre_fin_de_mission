import fs from "fs";
import path from "path";
import { exec } from "child_process";

const DATA_DIR = "C:\\code_outils-avenia\\DATA\\PROD";
const JOBS_DIR = path.join(DATA_DIR, "jobs_ppt");
const BackendPath = "C:\\code_outils-avenia\\PROD\\code\\backend\\src\\templates";
const dataPath = path.join(BackendPath, "data.json");
const vbsPath = path.join(BackendPath, "launchPPT.vbs");

let isRunning = false;

function log(...args) {
    const line = `[${new Date().toISOString()}] ` + args.join(" ") + "\n";
    fs.appendFileSync(path.join(DATA_DIR, "log_agent", "lfm-ppt-agent.log"), line);
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

        const cmd = `cscript //nologo "${vbsPath}" "${filePath}"`;
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
