import { callOllama, fillTemplate, pickCAPrompt } from '../services/aiService.js';

export const generateComment = async (req, res) => {
  try {
    const { anneeN, anneeN1, caN, caN1 } = req.body.contexte;
    const variation = (caN - caN1) / caN1;

    const template = pickCAPrompt(variation);
    const prompt = fillTemplate(template, { anneeN, anneeN1, caN, caN1, variation });

    const raw = await callOllama(prompt);

    let parsed ;
    try {
      parsed  = JSON.parse(raw);
    } catch (e) {
      return res.status(500).json({ error: "Réponse IA invalide", raw });
    }
    res.json({ text: parsed.resume ?? raw });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Erreur génération commentaire" });
  }
};
