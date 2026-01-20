import axios from "axios";
import { extrairePremierJsonObject } from "../../utils/procedureUtils.js";

export async function corrigerHtmlAvecMistral(html) {
    const apiKey = process.env.MISTRAL_API_KEY;
    const baseUrl = process.env.MISTRAL_BASE_URL;
    const model = "mistral-large-latest";
    if (!apiKey || !baseUrl) return html;

    const prompt = `
Tu dois répondre UNIQUEMENT avec un JSON valide : { "html": "..." }.

Contraintes ABSOLUES :
- Conserve STRICTEMENT la structure HTML : mêmes balises, même ordre, mêmes attributs.
- Ne modifie que le texte visible (orthographe, grammaire, accords, ponctuation légère si nécessaire).
- Ne reformule pas, ne résume pas, ne réorganise pas.
- Ne touche pas aux balises <img>, ni aux attributs src, alt, data-asset, href.
- Ne touche jamais aux tokens [[IMG:...]] s'ils apparaissent dans le texte.
- N'ajoute aucune balise, n'en supprime aucune.

HTML à corriger :
"""${html}"""
`.trim();

    const resp = await axios.post(
        `${baseUrl}/chat/completions`,
        {
            model,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: "Tu corriges uniquement orthographe/grammaire en conservant strictement le HTML." },
                { role: "user", content: prompt },
            ],
        },
        { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    const content = resp.data?.choices?.[0]?.message?.content;
    if (!content) return html;

    let obj;
    try {
        obj = JSON.parse(content);
    } catch {
        const extracted = extrairePremierJsonObject(content);
        obj = extracted ? JSON.parse(extracted) : null;
    }

    const out = (obj?.html || "").trim();
    return out || html;
}

export async function reconstruireProcedureAvecMistral({ titre, source, texte, imageNames = [], maxChars = 12000 }) {
    const apiKey = process.env.MISTRAL_API_KEY;
    const baseUrl = process.env.MISTRAL_BASE_URL;
    const model = "mistral-large-latest";
    if (!apiKey) throw new Error("MISTRAL_API_KEY manquant (env).");
    if (!baseUrl) throw new Error("MISTRAL_BASE_URL manquant (env).");

    const texteTronque = (texte || "").slice(0, maxChars);

    const prompt = `
Tu dois répondre UNIQUEMENT avec un JSON valide : { "html": "..." }.

Objectif:
- Produire un HTML SIMPLE et proche du markdown, en conservant la structure (titres, sections, listes, paragraphes).
- Supprimer seulement ce qui est clairement inutile (pages de garde vides, répétitions, mentions légales, pagination, en-têtes/pieds de page répétés, navigation).
- NE PAS "refaire une procédure standard", NE PAS imposer Résumé/Étapes/etc.
- Ne pas reformuler lourdement : garde les phrases utiles telles quelles, corrige légèrement si besoin.

Contraintes ABSOLUES:
1) Interdiction de déplacer, modifier, renommer ou supprimer les marqueurs d’image [[IMG:...]].
    Ils doivent rester exactement au même endroit relatif dans le contenu.
2) Interdiction d'inventer du contenu.
3) Interdiction d'ajouter des styles inline ou des classes.
4) N'utiliser QUE ces balises: h1,h2,h3,p,ul,ol,li,blockquote,pre,code,hr,table,thead,tbody,tr,th,td
    (si tu ne peux pas rendre un tableau propre, convertis en liste, mais sans perdre l'info).
5) Respecte l'ordre du document.

Infos:
- source doit rester: "${source}"
- Titre détecté: "${titre}"
- Images disponibles: ${imageNames.join(", ")}

Texte (proche markdown) :
"""${texteTronque}"""
`.trim();

    const resp = await axios.post(
        `${baseUrl}/chat/completions`,
        {
            model,
            temperature: 0.1,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: "Tu convertis un contenu markdown OCR en HTML simple en conservant structure/ordre. JSON uniquement." },
                { role: "user", content: prompt },
            ],
        },
        { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    const content = resp.data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Réponse Mistral vide.");

    let obj;
    try {
        obj = JSON.parse(content);
    } catch {
        const extracted = extrairePremierJsonObject(content);
        if (!extracted) throw new Error("Réponse Mistral non JSON exploitable.");
        obj = JSON.parse(extracted);
    }

    let html = String(obj?.html || "").trim();
    if (!html) throw new Error("HTML vide renvoyé par Mistral.");

    if (!/<h1[\s>]/i.test(html)) {
        html = `<h1>${escapeHtml(titre || "Procédure")}</h1>\n` + html;
    }

    return html;
}
