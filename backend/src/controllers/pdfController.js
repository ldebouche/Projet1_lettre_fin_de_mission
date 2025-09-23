import { extractCumuls, extractComments } from "../services/pdfService.js";

export async function getCumuls(req, res) {
  try {
    const filePath = "./Simul des amorts sur 3 ans.pdf";
    const cumuls = await extractCumuls(filePath);

    res.json(cumuls);
  } catch (err) {
    console.error("Erreur extraction PDF:", err);
    res.status(500).json({ error: "Impossible d'extraire les cumuls" });
  }
}

export async function getComments(req, res) {
  try {
    const { compte } = req.query;
    const filePath = "./note de synthèse 1.pdf";
    const comments = await extractComments(filePath, compte);

    res.json({ compte, comments });
  } catch (err) {
    console.error("Erreur extraction PDF:", err);
    res.status(500).json({ error: "Impossible d'extraire les commentaires" });
  }
}
