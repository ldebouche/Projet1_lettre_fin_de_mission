import axios from 'axios';
import axiosRetry from 'axios-retry';
import fs from 'fs';

axiosRetry(axios, {
  retries: 3,
  retryDelay: retryCount => retryCount * 2000,
  retryCondition: error => error.response?.status === 429
});

const prompts = JSON.parse(fs.readFileSync('./config/prompts.json', 'utf-8'));

export function fillTemplate(template, variables) {
  if (typeof template === "string") {
    return template.replace(/{{(.*?)}}/g, (_, key) => {
      return variables[key.trim()] ?? `{{${key}}}`;
    });
  } else if (Array.isArray(template)) {
    return template.map(item => fillTemplate(item, variables));
  } else if (template && typeof template === "object") {
    const result = {};
    for (const key in template) {
      if (Object.prototype.hasOwnProperty.call(template, key)) {
        result[key] = fillTemplate(template[key], variables);
      }
    }
    return result;
  }
  return template;
}

export function formatTranches(obj) {
  if (!obj) return { globale: "", details: "" };

  return {
    globale: `${obj.globale} EUR`,
    details: `
      - Tranche 1 : ${obj.tranche_1} EUR
      - Tranche 2 : ${obj.tranche_2} EUR
      - Tranche 3 : ${obj.tranche_3} EUR
      - Tranche 4 : ${obj.tranche_4} EUR
      - Tranche 5 : ${obj.tranche_5} EUR`
  };
}

export async function generateAIComment(type, contexte) {
  let template, prompt;

  if (type === "CA_marge") {
    const { anneeN, anneeN1, millesimeSecteur, maTranche, CA, MARGE, produitsFinanciers } = contexte;

    if (CA.caN === 0 && produitsFinanciers) {
      return "L’absence de chiffre d’affaires et la présence exclusive de produits financiers indiquent que la société exerce une activité de type holding non animatrice. Elle ne réalise pas d’activité opérationnelle propre, mais tire ses revenus de placements financiers, de dividendes ou d’intérêts perçus sur ses participations.";
    }
    console.log(anneeN1);
    if (millesimeSecteur && maTranche && CA.caSecteur && MARGE.margeSecteur) {
      if (!anneeN1) {
      template = prompts.generateComment.CA_marge_n_as;
      } else {
        template = prompts.generateComment.CA_marge_n1_as;
      }    
    }
    else {
      template = prompts.generateComment.CA_marge;
    }

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
      caSecteurGlobale: caSecteurStr.globale,
      caSecteurDetails: caSecteurStr.details,
      FDC: "",
      margeN: MARGE.margeN,
      margeN1: MARGE.margeN1,
      margeNPrcCA: MARGE.margeNPrcCA,
      margeN1PrcCA: MARGE.margeN1PrcCA,
      variationMarge: MARGE.variationMarge,
      variationPrcMarge: MARGE.variationPrcMarge,
      margeSecteurGlobale: margeSecteurStr.globale,
      margeSecteurDetails: margeSecteurStr.details,
    };

    if (CA.variationPrcCA > 15) {
      payload.FDC = CA.FDC;
    }

    prompt = fillTemplate(template, payload);
  }

  if (type === "investissement") {
    let { total_entrees, entrees, total_sorties, sorties } = contexte;
    
    if (!total_entrees && !entrees && !total_sorties && !sorties) {
      console.log("aucunes informations");
      return "L’absence d'immobilisations d'entrées et de sorties ne permet pas de générer de commentaire.";
    }

    template = prompts.generateComment.investissement;
    
    if (typeof entrees !== "string") {
      entrees = (entrees || [])
        .map(e => `${e.libelle} [${(e.designations || []).join(", ")}] (${e.cumul} EUR)`)
        .join("; ");
    }

    if (typeof sorties !== "string") {
      sorties = (sorties || [])
        .map(s => `${s.libelle} [${(s.designations || []).join(", ")}] (${s.cumul} EUR)`)
        .join("; ");
    }

    prompt = fillTemplate(template, { total_entrees, entrees, total_sorties, sorties });
  }

  if (type === "reformuler") {
    const { texte } = contexte;
    template = prompts.generateComment.reformuler;
    prompt = fillTemplate(template, { texte });
  }

  if (type === "emprunts") {
    const { emprunts } = contexte;
    template = prompts.generateComment.emprunts;
    prompt = fillTemplate(template, { emprunts });
    console.log(prompt);
  }
  const raw = await callMistral(prompt);
  return raw;
}


export async function callOllama(message) {
  const resp = await axios.post(
    `${process.env.OLLAMA_BASE_URL}/api/chat`,
    {
      model: process.env.OLLAMA_MODEL,
      messages: [
        { role: 'system', content: 'Tu rédiges des commentaires cohérents et professionnels sous la forme d\'un texte (jamais de liste) pour un client. Ecris avec un ton simple et humaine. Tu n’effectues aucun calcul et n\'ajoute aucune autres données supplémentaires. Ne mélange pas l’intensité de la variation et la comparaison sectorielle. Réponds uniquement en JSON strict et valide, sans texte autour.' },
        { role: 'user', content: JSON.stringify(message) }
      ],
      stream: false,
      options: { temperature: 0.2 }
    }
  );

  if (resp.data?.message?.content) return resp.data.message.content;
  if (Array.isArray(resp.data?.messages)) {
    return resp.data.messages.map(m => m.content).join("\n");
  }
  if (resp.data?.error) {
    return `Erreur Ollama: ${resp.data.error}`;
  }
  return JSON.stringify(resp.data);
}

export async function callMistral(message) {
  const resp = await axios.post(
    `${process.env.MISTRAL_BASE_URL}/chat/completions`,
    {
      model: process.env.MISTRAL_MODEL,
      messages: [
        {
          role: 'system',
          content: `
Tu es un expert-comptable qui rédige des commentaires cohérents et professionnels pour un client professionnel. 

Contraintes strictes :
- Chaque paragraphe doit contenir 3 ou 4 phrases (sauf pour la reformulation).
- Fais des commentaires sur les données fournies.
- Tu n’ajoutes AUCUNE donnée ni calcul supplémentaire.
- Tu n’utilises AUCUNE mise en forme (pas de Markdown, pas de gras, pas de listes).
`       },
        { role: 'user', content: JSON.stringify(message) }
      ],
      temperature: 0.5
    },
    { headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` } }
  );

  let raw = resp.data?.choices?.[0]?.message?.content ?? '';
  return raw;
}



export { prompts };
