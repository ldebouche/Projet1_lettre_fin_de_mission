import { generateAIComment } from "../services/aiService.js";
import { askChatbotRag } from "../services/chatbotRagService.js";

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

export const chatbotController = async (req, res) => {
  try {
    const { message } = req.body;
    
    const userRoles = req.user?.roles || ["general"];

    const result = await askChatbotRag(message, userRoles);
    res.json(result);
  } catch (e) {
    console.error("Erreur chatbot RAG :", e);
    res.status(500).json({ error: e.message });
  }
};