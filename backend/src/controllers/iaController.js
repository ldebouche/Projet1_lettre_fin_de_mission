import { generateAIComment } from "../services/aiService.js";
import { callMistral } from "../services/aiService.js";

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

export const ChatbotController = async (req, res) => {
  try {
    const { message, conversation } = req.body;
    const reply = await callMistral(message, conversation);
    console.log("Réponse du chatbot :", reply);
    return res.json({ reply });
  } catch (e) {
    console.error("Erreur chatbot :", e);
    res.status(500).json({ error: e.message });
  }
};