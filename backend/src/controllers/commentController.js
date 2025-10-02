import { fillTemplate, prompts, formatTranches, checkIntensiteVariation, callMistral } from '../services/aiService.js';

export const generateComment = async (req, res) => {
  try {
    const { type, contexte } = req.body;

    let template, prompt;

    if (type === 'CA_marge') {
      const { anneeN, anneeN1, millesimeSecteur, maTranche, CA, MARGE, produitsFinanciers } = contexte;

      if (CA.caN === 0 && produitsFinanciers) {
        return res.json({ text: "L’absence de chiffre d’affaires et la présence exclusive de produits financiers indiquent que la société exerce une activité de type holding non animatrice. Elle ne réalise pas d’activité opérationnelle propre, mais tire ses revenus de placements financiers, de dividendes ou d’intérêts perçus sur ses participations. Ce modèle économique repose sur la gestion d’un portefeuille d’actifs, sans intervention directe dans la gestion des filiales."});
      }

      template = prompts.generateComment.CA_marge;

      const { intensite: intensiteVariationCA, sens: sensVariationCA } = checkIntensiteVariation(CA.variationPrcCA);
      const { intensite: intensiteVariationMarge, sens: sensVariationMarge } = checkIntensiteVariation(MARGE.variationPrcMarge);

      const caSecteurStr = formatTranches(CA.caSecteur);

      const margeSecteurStr = formatTranches(MARGE.margeSecteur);
      
      const payload = {  
        anneeN,
        anneeN1,
        millesimeSecteur,
        maTranche,

        caN: CA.caN,
        caN1: CA.caN1,
        variationCA: CA.variationCA,
        variationPrcCA: CA.variationPrcCA,
        intensiteVariationCA: intensiteVariationCA,
        sensVariationCA: sensVariationCA,
        caSecteurGlobale: caSecteurStr.globale,
        caSecteurDetails: caSecteurStr.details,
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
      }

      if (intensiteVariationCA === 'fort') {
        payload.FDC = CA.FDC;
      }
      prompt = fillTemplate(template, payload);
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

    if (type === 'reformuler') {
      const { texte } = contexte;
      template = prompts.generateComment.reformuler;
      prompt = fillTemplate(template, { texte });
    }
    
    console.log(prompt);
    const raw = await callMistral(prompt);
    console.log("======> ", raw);
    return res.json({ text: raw });

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
