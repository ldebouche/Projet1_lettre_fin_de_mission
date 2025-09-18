import fs from "fs";
import pdf from "pdf-parse-fork";

export async function extractCumuls(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);
  const text = data.text;

  // regex qui cible les 3 colonnes "calculé"
  const regex =
    /Cumul tous comptes[\s\S]*?(?:\d[\d\s,.]+E?\s+){1}(\d[\d\s,.]+)\s+(?:\d[\d\s,.]+E?\s+){1}(\d[\d\s,.]+)\s+(?:\d[\d\s,.]+E?\s+){1}(\d[\d\s,.]+)/;

  const match = text.match(regex);

  if (!match) {
    throw new Error("Impossible de trouver les cumuls dans le PDF");
  }

  const cumul2025 = parseFloat(match[1].replace(/\s/g, "").replace(",", "."));
  const cumul2026 = parseFloat(match[2].replace(/\s/g, "").replace(",", "."));
  const cumul2027 = parseFloat(match[3].replace(/\s/g, "").replace(",", "."));

  return { cumul2025, cumul2026, cumul2027 };
}
