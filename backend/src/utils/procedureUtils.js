import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { JSDOM } from "jsdom";

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

export function decodeHtmlEntities(s = "") {
    const dom = new JSDOM(`<!doctype html><body>${s}</body>`);
    return dom.window.document.body.textContent || "";
}

export function replaceOcrMarkdownImagesWithPlaceholders(s = "") {
    return String(s).replace(
        /!\[[^\]]*]\((img-\d+\.(?:jpe?g|png|webp))\)/gi,
        "[[IMG:$1]]"
    );
}

export function normalizeOcrMarkdownForProcedure(md = "", maxChars = 12000) {
    let t = String(md || "");
    t = decodeHtmlEntities(t);
    t = replaceOcrMarkdownImagesWithPlaceholders(t);
    t = t.replace(/^\s*>\s?/gm, "");
    t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (maxChars && t.length > maxChars) t = t.slice(0, maxChars);
    return t;
}

export function stripMarkdown(s = "") {
    return String(s)
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/^\s{0,3}#{1,6}\s+/gm, "")
        .trim();
}

export function injectImagePlaceholdersToHtml(html, { baseUrl }) {
    if (!baseUrl) return String(html);
    const base = String(baseUrl).trim().replace(/\/?$/, "/");

    return String(html).replace(
        /\[\[IMG:(img-\d+\.(?:jpe?g|jpg|png|webp|gif))\]\]/gi,
        (_, name) => {
            const src = base + encodeURIComponent(name);
            return `<img src="${src}" data-asset="${escapeHtml(name)}" alt="${escapeHtml(name)}" />`;
        }
    );
}

export function injectImageAssetsBaseUrl(html, { baseUrl }) {
    if (!baseUrl) return String(html);
    const base = String(baseUrl).trim().replace(/\/?$/, "/");

    const dom = new JSDOM(html);
    const doc = dom.window.document;

    doc.querySelectorAll("img").forEach((img) => {
        const asset = (img.getAttribute("data-asset") || "").trim();
        if (!asset) return;

        img.setAttribute("src", base + encodeURIComponent(asset));
    });

    return doc.body.innerHTML;
}

function extractAssetNameFromImg(img) {
    let asset = (img.getAttribute("data-asset") || "").trim();
    if (asset) return asset;

    const alt = (img.getAttribute("alt") || "").trim();
    if (/^img-\d+\.(?:jpe?g|png|webp)$/i.test(alt)) return alt;

    const src = (img.getAttribute("src") || "").trim();
    const m = src.match(/\/assets\/(img-\d+\.(?:jpe?g|png|webp))/i);
    if (m) return m[1];

    const last = src.split("?")[0].split("/").pop();
    if (last && /\.(jpe?g|png|webp)$/i.test(last)) return last;

    return "";
}

export function quillHtmlToPdfHtml(html = "") {
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    doc.querySelectorAll("span.ql-ui").forEach((n) => n.remove());

    doc.querySelectorAll("ol").forEach((ol) => {
        const hasBullet = Array.from(ol.querySelectorAll("li")).some(
            (li) => li.getAttribute("data-list") === "bullet"
        );
        if (!hasBullet) return;

        const ul = doc.createElement("ul");
        ul.innerHTML = ol.innerHTML;
        ul.querySelectorAll("li[data-list]").forEach((li) => li.removeAttribute("data-list"));
        ol.replaceWith(ul);
    });

    doc.querySelectorAll("img").forEach((img) => {
        const asset = extractAssetNameFromImg(img);
        if (asset) {
            img.setAttribute("data-asset", asset);
            img.setAttribute("src", `assets/${asset}`);
            if (!img.getAttribute("alt")) img.setAttribute("alt", asset);
        }

        img.removeAttribute("srcset");
        img.removeAttribute("sizes");
        img.removeAttribute("width");
        img.removeAttribute("height");
        img.removeAttribute("style");
    });

    return doc.body.innerHTML;
}

export async function localiserImagesExternes(html, assetsDir, pageUrl) {
    const dom = new JSDOM(html, { url: pageUrl });
    const doc = dom.window.document;

    normaliserHtmlPourProcedure(doc);

    await fs.mkdir(assetsDir, { recursive: true });

    const imgs = Array.from(doc.querySelectorAll("img"));
    const savedImages = [];

    let index = 0;

    for (const img of imgs) {
        let src = (img.getAttribute("src") || "").trim();
        if (!src) {
            img.remove();
            continue;
        }

        if (src.startsWith("data:")) {
            img.remove();
            continue;
        }

        try {
            src = new URL(src, pageUrl).toString();
        } catch {
            img.remove();
            continue;
        }

        const filename = `img-${index++}.jpg`;
        const dst = path.join(assetsDir, filename);

        try {
            const res = await axios.get(src, {
                responseType: "arraybuffer",
                timeout: 12000,
                headers: { "User-Agent": "Mozilla/5.0" },
                maxContentLength: 20 * 1024 * 1024,
            });

            if (!res.data || res.data.byteLength < 3000) {
                img.remove();
                continue;
            }

            await fs.writeFile(dst, res.data);
            savedImages.push(filename);

            img.setAttribute("data-asset", filename);
            img.setAttribute("alt", filename);

            img.setAttribute("src", filename);

            img.removeAttribute("srcset");
            img.removeAttribute("sizes");
            img.removeAttribute("loading");
            img.removeAttribute("decoding");
            img.removeAttribute("fetchpriority");
            img.removeAttribute("width");
            img.removeAttribute("height");
            img.removeAttribute("style");
            img.removeAttribute("onload");
            img.removeAttribute("onclick");
        } catch {
            img.remove();
        }
    }

    return { html: doc.body.innerHTML, images: savedImages };
}

function normaliserHtmlPourProcedure(doc) {
    doc.querySelectorAll("picture").forEach(pic => {
        const img = pic.querySelector("img");
        if (img) pic.replaceWith(img);
        else pic.remove();
    });

    doc.querySelectorAll("source").forEach(s => s.remove());

    doc.querySelectorAll("*").forEach(el => {
        [...el.attributes].forEach(attr => {
            if (!["href", "src", "alt", "data-asset"].includes(attr.name)) {
                el.removeAttribute(attr.name);
            }
        });
    });
}
