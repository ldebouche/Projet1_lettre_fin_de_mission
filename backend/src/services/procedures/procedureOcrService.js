import fs from "fs/promises";
import path from "path";
import { normalizeOcrMarkdownForProcedure } from "../../utils/procedureUtils.js";

async function uploadToMistralFilesForOcr(buffer, filename) {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) throw new Error("MISTRAL_API_KEY manquant (env).");

    const form = new FormData();
    form.append("purpose", "ocr");
    form.append("file", new Blob([buffer], { type: "application/pdf" }), filename);

    const res = await fetch("https://api.mistral.ai/v1/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
    });

    if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Upload Mistral /v1/files échoué (${res.status}) ${t}`);
    }

    const json = await res.json();
    return json.id;
}

export async function ocrPdfBufferAvecMistral(buffer, filename) {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) throw new Error("MISTRAL_API_KEY manquant (env).");

    const fileId = await uploadToMistralFilesForOcr(buffer, filename);

    const res = await fetch("https://api.mistral.ai/v1/ocr", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "mistral-ocr-latest",
            document: { file_id: fileId },
            include_image_base64: true,
            table_format: "markdown",
        }),
    });

    if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`OCR Mistral /v1/ocr échoué (${res.status}) ${t}`);
    }

    const json = await res.json();
    const pages = (json.pages || []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const markdown = pages.map((p) => p.markdown || "").join("\n\n");

    const images = [];
    for (const p of pages) {
        const arr = Array.isArray(p.images) ? p.images : [];
        for (const img of arr) {
            const id = img?.id || img?.name || img?.filename;
            const b64 = img?.image_base64 || img?.base64;
            if (!id || !b64) continue;

            images.push({
                name: String(id),
                base64: String(b64),
                mime: img?.mime || img?.content_type || "image/jpeg",
            });
        }
    }

    const seen = new Set();
    const unique = [];
    for (const img of images) {
        const n = String(img.name);
        if (seen.has(n)) continue;
        seen.add(n);
        unique.push(img);
    }

    return { markdown, images: unique };
}

export async function saveOcrImages(outputDir, images = []) {
    await fs.mkdir(outputDir, { recursive: true });

    const saved = [];
    for (const img of images) {
        if (!img?.name || !img?.base64) continue;

        const safeName = String(img.name).replace(/[^\w.\-]/g, "_");
        const dst = path.join(outputDir, safeName);

        const pureBase64 = String(img.base64).replace(/^data:[^;]+;base64,/, "");
        const buf = Buffer.from(pureBase64, "base64");

        await fs.writeFile(dst, buf);
        saved.push(safeName);
    }
    return saved;
}

export async function extraireTexteDepuisPdfBuffer(buffer, originalName, maxChars) {
    const { markdown, images } = await ocrPdfBufferAvecMistral(buffer, originalName);
    const texte = normalizeOcrMarkdownForProcedure(markdown || "", maxChars);
    return { texte, images: images || [] };
}
