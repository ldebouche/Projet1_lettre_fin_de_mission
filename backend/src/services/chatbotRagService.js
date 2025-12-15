import fs from "fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import axios from "axios";
import path from "path";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_BASE_URL = process.env.MISTRAL_BASE_URL;
const MISTRAL_MODEL = process.env.MISTRAL_MODEL;

// ---- Mini base vectorielle temporaire ----
let vectorDb = [];

function getAllPdfFiles(dir, baseDir = dir, files = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            getAllPdfFiles(fullPath, baseDir, files);
        }

        if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
            files.push({
                name: entry.name,
                absolutePath: fullPath,
                relativePath: path.relative(baseDir, fullPath)
            });
        }
    }

    return files;
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

/* ===============================
    1. Utilitaires
================================ */

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

/* ===============================
    2. Ingestion PDF (mini-RAG)
================================ */

export async function ingestPdfDirectory() {
    vectorDb = [];

    const baseDir = "documents_chatbot";
    const files = getAllPdfFiles(baseDir);

    for (const file of files) {
        console.log(`📄 Ingestion du fichier : ${file.relativePath}`);
        const text = await extractPdfText(file.absolutePath);
        const chunks = chunkText(text);

        for (const chunk of chunks) {
            const vector = await embed(chunk);

            vectorDb.push({
                vector,
                text: chunk,
                fileName: file.name,
                sourceUrl: `/api/files/${file.relativePath.replace(/\\/g, "/")}`
            });
        }
    }

    console.log(`📚 RAG prêt : ${vectorDb.length} chunks indexés`);
}


/* ===============================
    3. Chatbot RAG
================================ */

export async function askChatbotRag(message) {
    const questionVector = await embed(message);

    const scored = vectorDb.map(item => ({
        ...item,
        score: cosineSimilarity(questionVector, item.vector)
    }));

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 3);

    const context = top.map(t => t.text).join("\n\n");

    const resp = await axios.post(
        `${process.env.MISTRAL_BASE_URL}/chat/completions`,
        {
            model: process.env.MISTRAL_MODEL,
            messages: [
                {
                    role: "system",
                    content: `
                        Tu es un assistant professionnel.
                        Tu réponds uniquement à partir du contexte fourni.
                        Tu n’inventes rien.
                        Tu écris en texte brut, sans mise en forme.
                        `
                },
                { role: "system", content: "Contexte :\n" + context },
                { role: "user", content: message }
            ],
            temperature: 0.3
        },
        {
            headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` }
        }
    );

    const uniqueSources = Array.from(
        new Map(
            top.map(t => [
                t.fileName,
                {
                    fileName: t.fileName,
                    url: t.sourceUrl
                }
            ])
        ).values()
    );

    return {
        reply: resp.data.choices[0].message.content,
        sources: uniqueSources
    };
}
