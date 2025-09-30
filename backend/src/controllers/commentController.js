import { callOllama, fillTemplate, pickPrompt, prompts, formatTranches } from '../services/aiService.js';

export const generateComment = async (req, res) => {
  try {
    const { type, contexte } = req.body;

    let template, prompt;

    if (type === 'CA') {
      const { anneeN, anneeN1, caN, caN1, variationCA, variationPrcCA, produitsFinanciers, FDC, millesimeSecteur, caSecteur, maTranche } = contexte;

      template = pickPrompt(variationPrcCA, 'CA');

      const caSecteurStr = formatTranches(caSecteur);

      prompt = fillTemplate(template, { anneeN, anneeN1, caN, caN1, variationCA, variationPrcCA, produitsFinanciers, FDC, millesimeSecteur, caSecteurGlobale: caSecteurStr.globale, caSecteurDetails: caSecteurStr.details, maTranche });
      console.log(prompt);
    }

    if (type === 'margeBrute') {
      const { anneeN, anneeN1, margeN, margeN1, variationMarge, millesimeSecteur, margeSecteur } = contexte;
      const variation = (caN - caN1) / caN1;

      template = pickPrompt(variation, 'margeBrute');
      prompt = fillTemplate(template, { anneeN, anneeN1, margeN, margeN1, variationMarge, millesimeSecteur, margeSecteur });
    }

    if (type === 'investissement') {
      const { total_entrees, entrees, total_sorties, sorties } = contexte;

      template = prompts.generateComment.investissement;

      const entreesStr = (entrees || [])
        .map(e => {
          const desigs = (e.designations || []).join(", ");
          return `${e.libelle} [${desigs}] (${e.cumul} EUR)`;
        })
        .join("; ");

      const sortiesStr = (sorties || [])
        .map(s => {
          const desigs = (s.designations || []).join(", ");
          return `${s.libelle} [${desigs}] (${s.cumul} EUR)`;
        })
        .join("; ");

      prompt = fillTemplate(template, {
        total_entrees,
        entrees: entreesStr,
        total_sorties,
        sorties: sortiesStr
      });
    }
    
    const raw = await callOllama(prompt);

    if (!raw || typeof raw !== "string") {
      return res.json({ text: "Réponse vide ou invalide d’Ollama" });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
      return res.json({ text: parsed.resume ?? raw });
    } catch (e) {
      console.warn("Réponse IA invalide, fallback brut ===>", raw);

      // Essayer d'extraire un JSON partiel
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
          return res.json({ text: parsed.resume ?? raw });
        } catch {}
      }

      // Fallback texte brut
      return res.json({ text: raw });
    }
  } catch (e) {
    console.error("ERREUR GENERATE COMMENT ===>");
    console.error("Message :", e.message);
    console.error("Stack   :", e.stack);
    console.error("Objet   :", e);
    res.status(500).json({
      error: "Erreur génération commentaire",
      details: e.message
    });
  }
};
