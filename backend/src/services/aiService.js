import axios from 'axios';
import fs from 'fs';

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


export function pickPrompt(variation, type) {
  const seuil = 50;
  if (variation >= 0) {
    return variation < seuil
      ? prompts.generateComment[type].petite_variation_positive
      : prompts.generateComment[type].grosse_variation_positive;
  } else {
    return Math.abs(variation) < seuil
      ? prompts.generateComment[type].petite_variation_negative
      : prompts.generateComment[type].grosse_variation_negative;
  }
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

export async function callOllama(message) {
  const resp = await axios.post(
    `${process.env.OLLAMA_BASE_URL}/api/chat`,
    {
      model: process.env.OLLAMA_MODEL,
      messages: [
        { role: 'system', content: 'Tu rédiges des commentaires cohérents et professionnels sous la forme d\'un texte (jamais de liste) pour un client. Tu n’effectues aucun calcul et n\'ajoute aucune autres données supplémentaires. Mentionne toutes les données transmises (montants, pourcentages, moyenne sectorielle, tranches, intensité, explications éventuelles). Ne mélange pas l’intensité de la variation et la comparaison sectorielle. Réponds uniquement en JSON strict et valide, sans texte autour. Format attendu : { \"resume\": \"string\" }' },
        { role: 'user', content: JSON.stringify(message) }
      ],
      stream: false,
      options: { temperature: 0.5, num_predict: 500 }
    }
  );

  console.log("OLLAMA RAW ===>", JSON.stringify(resp.data, null, 2));

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
        { role: 'system', content: 'Tu es concis et professionnel.' },
        { role: 'user', content: message }
      ],
      temperature: 0.7
    },
    {
      headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` }
    }
  );
  return resp.data?.choices?.[0]?.message?.content ?? '';
}

export { prompts };
