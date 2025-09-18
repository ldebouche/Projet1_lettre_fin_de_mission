import { extractCumuls } from "../services/pdfService.js";

export async function getCumuls(req, res) {
  try {
    const filePath = "./Simul des amorts sur 3 ans.pdf"; // ⚠️ chemin fixe pour l'instant
    const cumuls = await extractCumuls(filePath);

    console.log("Cumuls extrait:", cumuls);
    res.json(cumuls);
  } catch (err) {
    console.error("Erreur extraction PDF:", err);
    res.status(500).json({ error: "Impossible d'extraire les cumuls" });
  }
}
