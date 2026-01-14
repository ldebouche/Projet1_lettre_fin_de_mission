import { JSDOM } from "jsdom";

/**
 * Extrait le premier objet JSON {...} dans une string
 * (fallback quand le modèle renvoie du texte autour).
 */
export function extrairePremierJsonObject(s = "") {
    const start = s.indexOf("{");
    if (start === -1) return null;
    let depth = 0;

    for (let i = start; i < s.length; i++) {
        if (s[i] === "{") depth++;
        if (s[i] === "}") depth--;
        if (depth === 0) return s.slice(start, i + 1);
    }
    return null;
}

/**
 * Escape HTML (sécurité + rendu PDF stable)
 */
export function escapeHtml(texte = "") {
    return String(texte).replace(/[&<>"']/g, (c) =>
    ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[c])
    );
}

/**
 * Retire les artefacts markdown qui polluent ton PDF (**gras**, # titres, etc.)
 * Objectif: le PDF ne doit jamais afficher des caractères markdown bruts.
 */
export function stripMarkdown(s = "") {
    return String(s)
        .replace(/\*\*(.+?)\*\*/g, "$1") // **gras**
        .replace(/\*(.+?)\*/g, "$1") // *italique*
        .replace(/`([^`]+)`/g, "$1") // `code`
        .replace(/^\s{0,3}#{1,6}\s+/gm, "") // # titres
        .trim();
}

/**
 * Nettoie tout l'objet "procedure" après Mistral
 * => plus de markdown brut dans le JSON, donc plus dans le PDF.
 */
export function sanitizeProcedure(p) {
    if (!p || typeof p !== "object") return p;

    p.titre = stripMarkdown(p.titre || "");
    p.resume = stripMarkdown(p.resume || "");

    p.prerequis = Array.isArray(p.prerequis) ? p.prerequis.map(stripMarkdown) : [];
    p.cas_particuliers = Array.isArray(p.cas_particuliers) ? p.cas_particuliers.map(stripMarkdown) : [];
    p.notes = Array.isArray(p.notes) ? p.notes.map(stripMarkdown) : [];

    p.etapes = Array.isArray(p.etapes)
        ? p.etapes.map((e) => ({
            ...e,
            titre: stripMarkdown(e?.titre || ""),
            actions: Array.isArray(e?.actions) ? e.actions.map(stripMarkdown) : [],
            resultat_attendu: e?.resultat_attendu ? stripMarkdown(e.resultat_attendu) : null,
        }))
        : [];

    return p;
}

/**
 * HTML stylé pour le PDF (tes .bloc, .step, etc.)
 */
export function procedureJsonToHtml(p) {
    const esc = escapeHtml;

    const tags = (p.prerequis || []).map((x) => `<span class="tag">${esc(x)}</span>`).join("");

    const prerequisBloc = p.prerequis?.length
        ? `<div class="bloc">
         <div class="section-title">Pré-requis</div>
         <div>${tags}</div>
       </div>`
        : "";

    const resumeBloc = p.resume
        ? `<div class="bloc">
         <div class="section-title">Résumé</div>
         <p>${esc(p.resume)}</p>
       </div>`
        : "";

    const steps = (p.etapes || [])
        .map((et) => {
            const actions = (et.actions || []).map((a) => `<li>${esc(a)}</li>`).join("");
            const resultat = et.resultat_attendu
                ? `<p><strong>Résultat attendu :</strong> ${esc(et.resultat_attendu)}</p>`
                : "";
            return `
        <div class="step">
          <div class="step-title">${esc(et.titre || "Action")}</div>
          ${actions ? `<ul>${actions}</ul>` : ""}
          ${resultat}
        </div>
      `;
        })
        .join("");

    const etapesBloc = p.etapes?.length
        ? `<div class="section-title">Étapes</div><div class="steps">${steps}</div>`
        : "";

    const casBloc = p.cas_particuliers?.length
        ? `<div class="bloc">
         <div class="section-title">Cas particuliers</div>
         <ul>${p.cas_particuliers.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
       </div>`
        : "";

    const notesBloc = p.notes?.length
        ? `<div class="bloc">
         <div class="section-title">Notes</div>
         <ul>${p.notes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
       </div>`
        : "";

    return `${resumeBloc}${prerequisBloc}${etapesBloc}${casBloc}${notesBloc}`;
}

/**
 * HTML "Quill-friendly" (simple, tags standards)
 * => Quill garde bien la structure, pas besoin de classes custom.
 */
export function procedureJsonToQuillHtml(p) {
    const esc = escapeHtml;

    const h1 = (t) => `<h1>${esc(t)}</h1>`;
    const h2 = (t) => `<h2>${esc(t)}</h2>`;
    const h3 = (t) => `<h3>${esc(t)}</h3>`;
    const para = (t) => `<p>${esc(t)}</p>`;

    const list = (items = []) =>
        items.length ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";

    const prerequis = p.prerequis?.length ? list(p.prerequis) : "";

    const etapes = (p.etapes || [])
        .map((et) => {
            const actions = (et.actions || []).map((a) => `<li>${esc(a)}</li>`).join("");
            const resultat = et.resultat_attendu
                ? `<p><strong>Résultat attendu :</strong> ${esc(et.resultat_attendu)}</p>`
                : "";
            return `
        ${h3(et.titre || "Étape")}
        ${actions ? `<ul>${actions}</ul>` : ""}
        ${resultat}
      `;
        })
        .join("");

    return `
    ${h1(p.titre || "Procédure")}
    ${p.resume ? `${h2("Résumé")}${para(p.resume)}` : ""}
    ${p.prerequis?.length ? `${h2("Pré-requis")}${prerequis}` : ""}
    ${p.etapes?.length ? `${h2("Étapes")}${etapes}` : ""}
    ${p.cas_particuliers?.length ? `${h2("Cas particuliers")}${list(p.cas_particuliers)}` : ""}
    ${p.notes?.length ? `${h2("Notes")}${list(p.notes)}` : ""}
  `.trim();
}

/**
 * Convertit le HTML (sorti de Quill) en texte pour renvoyer à Mistral
 */
export function htmlToPlainText(html = "", maxChars = 12000) {
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    doc.querySelectorAll("script, style, noscript").forEach((n) => n.remove());

    let text = (doc.body?.textContent || "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    if (maxChars && text.length > maxChars) text = text.slice(0, maxChars);
    return text;
}
