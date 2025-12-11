import { genererWord } from "../services/wordService.js";
import path from "path";
import fs from "fs";

const JOBS_DIR = "C:\\Users\\admin.lcd\\projet_lfm\\jobs_ppt";

export const generatedocuments = (req, res) => {
  try {
    const variables = req.body.variables;
    const folderPath = req.body.folderPath;

    if (!folderPath || folderPath.trim() === "") {
      return res.status(400).json({ message: "Le dossier de destination est requis." });
    }

    const wordBuffer = genererWord(variables, folderPath);

    const resolvedFolder = path.resolve(folderPath);
    console.log(resolvedFolder);
    fs.mkdirSync(resolvedFolder, { recursive: true });

    const fileName = `lfm_${variables.code_client}_${variables.anneeN}.docm`;
    const filePath = path.join(resolvedFolder, fileName);

    fs.writeFileSync(filePath, wordBuffer);

    let jobId = null;

    if (variables.anneeN1Existe) {
      fs.mkdirSync(JOBS_DIR, { recursive: true });

      jobId = `${Date.now()}_${variables.code_client}_${variables.anneeN}`;
      const jobPath = path.join(JOBS_DIR, jobId + ".json");

      const job = {
        variables,
        folderPath: resolvedFolder
      };

      fs.writeFileSync(jobPath, JSON.stringify(job, null, 2), "utf8");
      console.log("Job PPT créé :", jobPath);
    }

    res.json({ folder: resolvedFolder, jobId });
  } catch (err) {
    console.error("Erreur génération Word :", err);
    res.status(500).json({ message: "Erreur génération Word" });
  }
};

export const jobStatus = (req, res) => {
  const id = req.query.jobId;
  const jobDir = JOBS_DIR;

  const doneFile = path.join(jobDir, id + ".json.done");
  const errorFile = path.join(jobDir, id + ".json.error");
  const runningFile = path.join(jobDir, id + ".json");

  if (fs.existsSync(doneFile)) return res.json({ status: "done" });
  if (fs.existsSync(errorFile)) return res.json({ status: "error" });
  if (fs.existsSync(runningFile)) return res.json({ status: "running" });

  return res.json({ status: "unknown" });
};