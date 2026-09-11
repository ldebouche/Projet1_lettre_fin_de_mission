/**
 * LAB — Extraction IA du commentaire libre étape 1 (Fiche LCB-FT).
 * Usage interne uniquement (génération PDF). Pas de route HTTP pour l’instant.
 * Ne reformule pas : extrait seulement les infos présentes dans le texte.
 * Dirigeant hors scope.
 */
import axios from 'axios';
import { extrairePremierJsonObject } from '../utils/procedureUtils.js';

export const LAB_EXTRACTION_ETAPE1_KEYS = Object.freeze([
  'origine_contact',
  'honoraires',
  'clients_fournisseurs',
  'banques',
  'date_controles',
  'source_controles',
]);

/**
 * @typedef {Object} LabExtractionEtape1
 * @property {string|null} origine_contact
 * @property {string|null} honoraires
 * @property {string|null} clients_fournisseurs
 * @property {string|null} banques
 * @property {string|null} date_controles
 * @property {string|null} source_controles
 */

/**
 * @returns {LabExtractionEtape1}
 */
export function emptyExtractionEtape1() {
  return {
    origine_contact: null,
    honoraires: null,
    clients_fournisseurs: null,
    banques: null,
    date_controles: null,
    source_controles: null,
  };
}

/**
 * Normalise un objet partiel vers le schéma Fiche (clés manquantes → null).
 * @param {unknown} raw
 * @returns {LabExtractionEtape1}
 */
export function normalizeExtractionEtape1(raw) {
  const out = emptyExtractionEtape1();
  if (!raw || typeof raw !== 'object') return out;
  for (const key of LAB_EXTRACTION_ETAPE1_KEYS) {
    const v = raw[key];
    if (v == null) {
      out[key] = null;
      continue;
    }
    const s = String(v).trim();
    out[key] = s || null;
  }
  return out;
}

/**
 * Extrait les infos structurées d’un commentaire libre étape 1.
 * N’invente rien, ne reformule pas, ignore le dirigeant.
 *
 * @param {string} commentaire
 * @returns {Promise<LabExtractionEtape1>}
 */
export async function extraireInfosCommentaireEtape1(commentaire) {
  const texte = commentaire != null ? String(commentaire).trim() : '';
  if (!texte) {
    return emptyExtractionEtape1();
  }

  const apiKey = process.env.MISTRAL_API_KEY;
  const baseUrl = process.env.MISTRAL_BASE_URL;
  const model = process.env.MISTRAL_MODEL || 'mistral-large-latest';
  if (!apiKey) throw new Error('MISTRAL_API_KEY manquant (env).');
  if (!baseUrl) throw new Error('MISTRAL_BASE_URL manquant (env).');

  const prompt = `
Tu dois répondre UNIQUEMENT avec un JSON valide, sans markdown, de la forme :
{
  "origine_contact": string|null,
  "honoraires": string|null,
  "clients_fournisseurs": string|null,
  "banques": string|null,
  "date_controles": string|null,
  "source_controles": string|null
}

Objectif :
- Extraire depuis le commentaire collaborateur les informations utiles aux fiches LCB-FT.
- Si une info est absente, mets null.
- Interdiction d'inventer, déduire ou compléter.
- Interdiction de reformuler : reprends les formulations du texte (légère normalisation d'espaces OK).
- N'extrais JAMAIS l'identité ou les infos du dirigeant (hors scope).
- date_controles = date(s) des contrôles mentionnés ; source_controles = source / liste / organisme.

Commentaire :
"""${texte.slice(0, 12000)}"""
`.trim();

  const resp = await axios.post(
    `${baseUrl}/chat/completions`,
    {
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Tu extrais des champs structurés depuis un commentaire LAB. JSON uniquement. Pas de reformulation, pas d’invention, pas de dirigeant.',
        },
        { role: 'user', content: prompt },
      ],
    },
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );

  const content = resp.data?.choices?.[0]?.message?.content;
  if (!content) {
    return emptyExtractionEtape1();
  }

  let obj;
  try {
    obj = JSON.parse(content);
  } catch {
    const extracted = extrairePremierJsonObject(content);
    obj = extracted ? JSON.parse(extracted) : null;
  }

  return normalizeExtractionEtape1(obj);
}
