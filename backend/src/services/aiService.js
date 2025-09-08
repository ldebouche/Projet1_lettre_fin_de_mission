import axios from 'axios';
import fs from 'fs';

const prompts = JSON.parse(fs.readFileSync('./config/prompts.json', 'utf-8'));

export function fillTemplate(template, variables) {
  return template.replace(/{{(.*?)}}/g, (_, key) => {
    return variables[key.trim()] ?? `{{${key}}}`;
  });
}

export function pickCAPrompt(variation) {
  const seuil = 0.05;
  if (variation >= 0) {
    return variation < seuil
      ? prompts.generateComment.CA.petite_variation_positive
      : prompts.generateComment.CA.grosse_variation_positive;
  } else {
    return Math.abs(variation) < seuil
      ? prompts.generateComment.CA.petite_variation_negative
      : prompts.generateComment.CA.grosse_variation_negative;
  }
}

export async function callOllama(message) {
  const resp = await axios.post(
    `${process.env.OLLAMA_BASE_URL}/api/chat`,
    {
      model: process.env.OLLAMA_MODEL,
      messages: [
        { role: 'system', content: 'Tu es concis et professionnel.' },
        { role: 'user', content: message }
      ],
      stream: false,
      options: { temperature: 0.3 }
    }
  );
  return resp.data?.message?.content ?? '';
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
