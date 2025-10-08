import { genererWord } from "../services/wordService.js";
import { exec } from "child_process";
import path from "path";
import fs from "fs";

export const generateWord = (req, res) => {
  try {
    const variables = req.body.variables;
    const folderPath = req.body.folderPath;

    if (!folderPath || folderPath.trim() === "") {
      return res.status(400).json({ message: "Le dossier de destination est requis." });
    }

    const wordBuffer = genererWord(variables);

    const resolvedFolder = path.resolve(folderPath);
    if (!fs.existsSync(resolvedFolder)) {
      fs.mkdirSync(resolvedFolder, { recursive: true });
    }

    const fileName = `lfm_${variables.code_client}_${variables.anneeN}.docm`;
    const filePath = path.join(resolvedFolder, fileName);

    fs.writeFileSync(filePath, wordBuffer);

    exec(`cmd /c start "" "${filePath}"`, (error) => {
      if (error) {
        console.error("Erreur ouverture Word :", error);
      }
    });
  } catch (err) {
    console.error("Erreur génération Word :", err);
    res.status(500).json({ message: "Erreur génération Word" });
  }
};
