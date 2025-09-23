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

export async function extractComments(filePath, numComptes) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);
  const text = data.text;

  const sectionD = text.match(/Cycle D[\s\S]*?(?=Cycle E|$)/);

  const regex = /(\d{6,8})\s*-\s*(.+?)\n([\s\S]*?)(?=\n\d{6,8}\s*-|\nChapitre|\nEdition|\Z)/g;
  const matches = [...sectionD[0].matchAll(regex)];

  const comptes = matches.map(m => ({
    compte: m[1],
    libelle: m[2],
    commentaire: m[3].trim()
  }));

  const result = [];

  const matchesPrefix = (compte, prefixes) =>
    prefixes.some(pref => compte.startsWith(pref));

  for (let i = 0; i < comptes.length; i++) {
    if (Array.isArray(numComptes)) {
      if (matchesPrefix(comptes[i].compte, numComptes)) {
        result.push(comptes[i]);
      }
    } else {
      if (comptes[i].compte.startsWith(numComptes)) {
          result.push(comptes[i]);
        }
    }
  }
  return result;
}

export async function extractImmobEntree(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);
  const text = data.text;

  const regex = /(\d{8})([^\n]+)\n([\s\S]*?)(?:Cumul du compte\s*([\d\s,.]+))(?:\s|$)/g;

  const comptes = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const numero = match[1].trim();
    const libelle = match[2].trim();
    const bloc = match[3];
    const cumul = match[4].trim().replace(/(\d+,\d{2})\d*,\d*/g, "$1");

    const designations = [...bloc.matchAll(
      /^\d+\s*([A-Za-z0-9éèêàâçëïôùû\- ]+?)(?=\d{2}\/\d{2}\/\d{2})/gm
    )].map(d => d[1].trim());

    comptes.push({
      compte: numero,
      libelle,
      designations,
      cumul
    });
  }

  const totalGeneralMatch = text.match(/Total des entrées\s*([\d\s]+,\d{2})/);
  const totalGeneral = totalGeneralMatch ? totalGeneralMatch[1].trim() : null;

  return { comptes, totalGeneral };
}

export async function extractImmobSortie(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);
  const text = data.text;

  const regex = /(\d{8})\s*([^\n]+)\n([\s\S]*?)(\d[\d\s,.]+)Cumul sorties du compte/g;

  const comptes = [];
  let totalGeneral = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const numero = match[1].trim();
    const libelle = match[2].trim();
    const bloc = match[3];
    const cumul = match[4].trim().replace(/(\d+,\d{2})[\d\s,]*/g, "$1");
    let cumulNum = parseFloat(cumul.replace(/\s/g, "").replace(",", "."));

    const designations = [...bloc.matchAll(
      /^\d+\s*([A-Za-z0-9éèêàâçëïôùû\- ]+?)(?=\d{2}\/\d{2}\/\d{2})/gm
    )].map(d => d[1].trim());

    comptes.push({
      compte: numero,
      libelle,
      designations,
      cumul
    });
    totalGeneral += cumulNum;
  }

  totalGeneral = totalGeneral.toLocaleString('fr-FR');
  return { comptes, totalGeneral };
}