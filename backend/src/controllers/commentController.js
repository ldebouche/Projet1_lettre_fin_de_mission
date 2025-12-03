import { generateAIComment } from "../services/aiService.js";

export const generateComment = async (req, res) => {
  try {
    const { type, contexte } = req.body;
    const { comment, json } = await generateAIComment(type, contexte);
    return res.json({ comment, json });
  } catch (e) {
    console.error("Erreur génération commentaire :", e);
    res.status(500).json({ error: e.message });
  }
};
