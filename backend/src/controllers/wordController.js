import { genererWord } from "../services/wordService.js";

export const generateWordFile = (req, res) => {
  try {
    const variables = req.body; 

    const fileBuffer = genererWord(variables);

    res.setHeader("Content-Disposition", "attachment; filename=resultat.docx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.send(fileBuffer);
  } catch (err) {
    console.error("Erreur génération Word:", err);
    res.status(500).send("Erreur lors de la génération du fichier Word");
  }
};
