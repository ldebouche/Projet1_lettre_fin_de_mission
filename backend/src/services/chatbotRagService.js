import fs from "fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import axios, { all } from "axios";
import { db, logDbStatus } from "../config/vectorStore.js";
import { extraireTexteDepuisPdfBuffer } from "./procedures/procedureOcrService.js";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_BASE_URL = process.env.MISTRAL_BASE_URL;
const MISTRAL_MODEL = process.env.MISTRAL_MODEL;

const embeddingCache = new Map();
const MAX_CACHE = 1500;

function cacheGet(k) {
    const v = embeddingCache.get(k);
    if (!v) return null;
    embeddingCache.delete(k);
    embeddingCache.set(k, v);
    return v;
}

function cacheSet(k, v) {
    if (embeddingCache.has(k)) embeddingCache.delete(k);
    embeddingCache.set(k, v);
    if (embeddingCache.size > MAX_CACHE) {
        const firstKey = embeddingCache.keys().next().value;
        embeddingCache.delete(firstKey);
    }
}

async function embedCached(text) {
    const key = text.trim().toLowerCase();
    const cached = cacheGet(key);
    if (cached) return cached;

    const v = await embed(text);
    cacheSet(key, v);
    return v;
}

export async function indexPdfFile(absolutePath, relativePath, fileName, roles = ["general"]) {
    const text = await extractPdfText(absolutePath);
    const chunks = chunkText(text, 1200, 200);

    const insert = db.prepare(`
        INSERT INTO embeddings (file_path, file_name, content, vector, roles)
        VALUES (?, ?, ?, ?, ?)
    `);

    let chunkIndex = 0;
    for (const chunk of chunks) {
        const vector = await embedCached(chunk);
        insert.run(
            relativePath,
            fileName,
            `[CHUNKIDX:${chunkIndex++}]\n${chunk}`,
            JSON.stringify(vector),
            JSON.stringify(Array.from(new Set((roles?.length ? roles : ["general"]).map(r => String(r).toLowerCase()))))
        );
    }
}

export function removePdfFromIndex(relativePath) {
    db.prepare(`
        DELETE FROM embeddings WHERE file_path = ?
    `).run(relativePath);
}

async function extractPdfText(filePath) {
    const buffer = fs.readFileSync(filePath);

    let fullText = "";
    try {
        const data = new Uint8Array(buffer);
        const pdf = await pdfjsLib.getDocument({ data }).promise;

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str).join(" ");
            fullText += pageText + "\n";
        }

        fullText = cleanupExtractedText(fullText);
    } catch {
        fullText = "";
    }

    if ((fullText || "").trim().length < 3000) {
        const ocr = await extraireTexteDepuisPdfBuffer(
            buffer,
            filePath.split(/[\\/]/).pop() || "document.pdf",
            20000
        );
        fullText = cleanupExtractedText(ocr?.texte || "");
    }

    return fullText;
}

function cleanupExtractedText(text) {
    return (text || "")
        .replace(/\r/g, "")
        .replace(/Créé par .*? \d+\/\d+\s*/gi, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}


function chunkText(text, targetSize = 1200, overlap = 200) {
    const cleaned = (text || "")
        .replace(/\r/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    const paragraphs = cleaned.split("\n\n").map(p => p.trim()).filter(Boolean);

    const merged = [];
    let buf = "";

    for (const p of paragraphs) {
        if (!buf) {
            buf = p;
            continue;
        }
        if ((buf.length + 2 + p.length) <= targetSize) {
            buf += "\n\n" + p;
        } else {
            merged.push(buf);
            buf = p;
        }
    }
    if (buf) merged.push(buf);

    const chunks = [];
    let prev = "";

    for (const current of merged) {
        const head = prev ? prev.slice(-overlap) + "\n" : "";
        chunks.push((head + current).trim());
        prev = current;
    }

    return chunks.filter(c => c.length >= 200);
}

async function embed(text) {
    const res = await axios.post(
        `${process.env.MISTRAL_BASE_URL}/embeddings`,
        {
            model: "mistral-embed",
            input: text
        },
        {
            headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` }
        }
    );
    return res.data.data[0].embedding;
}

function computeAllowedRoles(userRoles) {
    let roles = [];

    if (Array.isArray(userRoles)) {
        roles = userRoles;
    } else if (typeof userRoles === "string") {
        // support si jamais ça arrive sous forme "admin,comptable"
        roles = userRoles.split(",").map(s => s.trim());
    } else {
        roles = [];
    }

    const allowed = new Set(["general"]);

    for (const r of roles) {
        const role = String(r || "").trim().toLowerCase();
        if (role) allowed.add(role);
    }

    const result = Array.from(allowed);
    return result;
}

function buildRolesWhere(allowedRoles) {
    const clauses = allowedRoles.map(() => `roles LIKE ?`);
    const params = allowedRoles.map(r => `%\"${r}\"%`);
    return { where: `(${clauses.join(" OR ")})`, params };
}

function buildKeywordWhere(message) {
    const words = String(message)
        .toLowerCase()
        .split(/\W+/)
        .filter(w => w.length >= 4)
        .slice(0, 8);

    if (!words.length) return { where: "1=1", params: [] };

    const clauses = words.map(() => `content LIKE ?`);
    const params = words.map(w => `%${w}%`);
    return { where: `(${clauses.join(" OR ")})`, params };
}

function cosineSimilarity(a, b) {
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
    return dot / (magA * magB);
}

export async function askChatbotRag(message, userRole) {
    logDbStatus();

    const allowedRoles = computeAllowedRoles(userRole);
    const questionVector = await embedCached(message);

    const kw = buildKeywordWhere(message);
    const roles = buildRolesWhere(allowedRoles);

    const rows = db.prepare(`
        SELECT file_path, file_name, content, vector
        FROM embeddings
        WHERE ${roles.where} AND ${kw.where}
    `).all(...roles.params, ...kw.params);
    
    const scored = rows.map(r => {
        const v = JSON.parse(r.vector);
        return {
            ...r,
            score: cosineSimilarity(questionVector, v)
        };
    });

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0]?.score ?? 0;

    if (best < 0.72) {
        return {
            reply: "Je n’ai pas trouvé d’information suffisamment pertinente dans les documents pour répondre.",
            sources: []
        };
    }

    const topK = scored.slice(0, 10);
    const filtered = topK.filter(s => s.score >= Math.max(0.72, best * 0.92)).slice(0, 8);

    const top = filtered.length ? filtered : topK.slice(0, 6);

    const context = top
        .map((t, idx) => `[CHUNK_${idx}] (fichier: ${t.file_name})\n${t.content.slice(0, 1400)}`)
        .join("\n\n---\n\n");

    const resp = await axios.post(
        `${MISTRAL_BASE_URL}/chat/completions`,
        {
            model: MISTRAL_MODEL,
            messages: [
                {
                    role: "system", content: [
                        "Tu es un assistant RAG.",
                        "Tu dois répondre UNIQUEMENT à partir du CONTEXTE fourni.",
                        "Si une information nécessaire manque, réponds exactement : Je ne peux pas répondre à partir des documents fournis.",
                        "Interdiction d'inventer, déduire, compléter, reformuler avec des ajouts.",
                        "Réponds sous forme de liste à puces courtes.",
                        "Chaque puce DOIT se terminer par une ou plusieurs références [CHUNK_X]."
                    ].join("\n")
                },
                { role: "system", content: "Contexte :\n" + context },
                { role: "user", content: message }
            ],
            temperature: 0,
            max_tokens: 650
        },
        { headers: { Authorization: `Bearer ${MISTRAL_API_KEY}` } }
    );

    const sources = Array.from(
        new Map(
            top.map(t => [
                t.file_path,
                {
                    fileName: t.file_name,
                    url: `/api/files/chatbot/${encodeURIComponent(t.file_path)}`
                }
            ])
        ).values()
    );

    let answer = resp.data.choices[0].message.content || "";

    if (!/\[CHUNK_\d+\]/.test(answer)) {
        return {
            reply: "Je ne peux pas répondre à partir des documents fournis.",
            sources: []
        };
    }

    const maxChunk = top.length - 1;
    const cited = [...answer.matchAll(/\[CHUNK_(\d+)\]/g)].map(m => Number(m[1]));
    if (cited.some(n => Number.isNaN(n) || n < 0 || n > maxChunk)) {
        return {
            reply: "Je ne peux pas répondre à partir des documents fournis.",
            sources: []
        };
    }

    answer = (answer || "")
        .replace(/\s*\[CHUNK_\d+\]\s*/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .trim();

    return {
        reply: answer,
        sources
    };
}
