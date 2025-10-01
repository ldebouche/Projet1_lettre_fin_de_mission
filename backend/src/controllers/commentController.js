import { callOllama, fillTemplate, pickPrompt, prompts, formatTranches, checkIntensiteVariation } from '../services/aiService.js';

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

    if (type === 'CA_marge') {
      const { anneeN, anneeN1, millesimeSecteur, CA, MARGE } = contexte;

      template = pickPrompt(CA.variationPrcCA, 'CA_marge');

      const { intensite: intensiteVariationCA, sens: sensVariationCA } = checkIntensiteVariation(CA.variationPrcCA);
      const { intensite: intensiteVariationMarge, sens: sensVariationMarge } = checkIntensiteVariation(MARGE.variationPrcMarge);

      const caSecteurStr = formatTranches(CA.caSecteur);

      const margeSecteurStr = formatTranches(MARGE.margeSecteur);
      
      const payload = {  
        anneeN,
        anneeN1,
        millesimeSecteur,

        caN: CA.caN,
        caN1: CA.caN1,
        variationCA: CA.variationCA,
        variationPrcCA: CA.variationPrcCA,
        intensiteVariationCA: intensiteVariationCA,
        sensVariationCA: sensVariationCA,
        caSecteurGlobale: caSecteurStr.globale,
        caSecteurDetails: caSecteurStr.details,
        maTrancheCA: CA.maTrancheCA,
        FDC: "",

        margeN: MARGE.margeN,
        margeN1: MARGE.margeN1,
        margeNPrcCA: MARGE.margeNPrcCA,
        margeN1PrcCA: MARGE.margeN1PrcCA,
        variationMarge: MARGE.variationMarge,
        variationPrcMarge: MARGE.variationPrcMarge,
        intensiteVariationMarge: intensiteVariationMarge,
        sensVariationMarge: sensVariationMarge,
        margeSecteurGlobale: margeSecteurStr.globale,
        margeSecteurDetails: margeSecteurStr.details,
        maTrancheMarge: MARGE.maTrancheMarge
      }

      if (intensiteVariationCA === 'fort') {
        payload.FDC = CA.FDC;
      }
      prompt = fillTemplate(template, payload);
      console.log(prompt);
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
