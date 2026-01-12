import fs from "fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import axios from "axios";
import path from "path";
import { db, logDbStatus } from "../config/vectorStore.js";
import { log } from "console";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_BASE_URL = process.env.MISTRAL_BASE_URL;
const MISTRAL_MODEL = process.env.MISTRAL_MODEL;

const embeddingCache = new Map();

async function embedCached(text) {
    const key = text.trim().toLowerCase();
    const cached = embeddingCache.get(key);
    if (cached) return cached;

    const v = await embed(text);
    embeddingCache.set(key, v);
    return v;
}

export async function indexPdfFile(absolutePath, relativePath, fileName) {
    const text = await extractPdfText(absolutePath);
    const chunks = chunkText(text, 800);

    const insert = db.prepare(`
        INSERT INTO embeddings (file_path, file_name, content, vector)
        VALUES (?, ?, ?, ?)
    `);

    for (const chunk of chunks) {
        const vector = await embed(chunk);
        insert.run(
            relativePath,
            fileName,
            chunk,
            JSON.stringify(vector)
        );
    }
}

export function removePdfFromIndex(relativePath) {
    db.prepare(`
        DELETE FROM embeddings WHERE file_path = ?
    `).run(relativePath);
}

async function extractPdfText(filePath) {
    const data = new Uint8Array(fs.readFileSync(filePath));
    const pdf = await pdfjsLib.getDocument({ data }).promise;

    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(" ");
        fullText += pageText + "\n";
    }

    return fullText;
}

function chunkText(text, size = 400) {
    const chunks = [];
    for (let i = 0; i < text.length; i += size) {
        chunks.push(text.slice(i, i + size));
    }
    return chunks;
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

function cosineSimilarity(a, b) {
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
    return dot / (magA * magB);
}

export async function askChatbotRag(message) {
    logDbStatus();

    const questionVector = await embedCached(message);

    const rows = db.prepare(`
        SELECT file_path, file_name, content, vector
        FROM embeddings
    `).all();

    const scored = rows.map(r => {
        const v = JSON.parse(r.vector);
        return {
            ...r,
            score: cosineSimilarity(questionVector, v)
        };
    });

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0]?.score ?? 0;

    if (best < 0.75) {
        return {
            reply: "Je n’ai pas trouvé d’information suffisamment pertinente dans les documents pour répondre.",
            sources: []
        };
    }

    const top = scored
        .filter(s => s.score >= 0.75 && (best - s.score) <= 0.06)
        .slice(0, 4);

    const context = top
        .map(t => t.content.slice(0, 900))
        .join("\n\n---\n\n");

    const resp = await axios.post(
        `${MISTRAL_BASE_URL}/chat/completions`,
        {
            model: MISTRAL_MODEL,
            messages: [
                {
                    role: "system", content: [
                        "Tu es un assistant de procédures.",
                        "Tu réponds UNIQUEMENT à partir du contexte fourni.",
                        "Interdictions strictes : ne jamais mentionner l’auteur, l’entreprise, la date, ni le contexte interne.",
                        "Ne pas écrire de section 'Sources'. Les sources sont ajoutées automatiquement par le système.",
                        "Réponds sous forme d’étapes claires et structurées."
                    ].join("\n")
                },
                { role: "system", content: "Contexte :\n" + context },
                { role: "user", content: message }
            ],
            temperature: 0.3,
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

    return {
        reply: resp.data.choices[0].message.content,
        sources
    };
}
