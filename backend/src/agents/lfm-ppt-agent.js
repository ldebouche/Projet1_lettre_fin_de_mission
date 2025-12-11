import fs from "fs";
import path from "path";
import { exec } from "child_process";

const JOBS_DIR = "C:\\Users\\admin.lcd\\projet_lfm\\jobs_ppt";
const BackendPath = "C:\\Users\\admin.lcd\\projet_lfm\\Projet1_lettre_fin_de_mission\\backend\\src\\templates";
const dataPath = path.join(BackendPath, "data.json");
const vbsPath = path.join(BackendPath, "launchPPT.vbs");

let isRunning = false;

function log(...args) {
    const line = `[${new Date().toISOString()}] ` + args.join(" ") + "\n";
    fs.appendFileSync("C:\\Users\\admin.lcd\\projet_lfm\\log_agent\\lfm-ppt-agent.log", line);
    console.log(...args);
}

function processJob(fullPath, jobFile) {
    isRunning = true;

    log("Traitement du job :", fullPath);

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
            fs.renameSync(fullPath, fullPath + ".error");
            isRunning = false;
            return;
        }

        if (stderr) log("VBS stderr:", stderr);
        log("PPT généré avec succès:", stdout);

        fs.renameSync(fullPath, fullPath + ".done");

        isRunning = false;
    });
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
