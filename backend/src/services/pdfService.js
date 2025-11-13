import fs from "fs";
import pdf from "pdf-parse-fork";
import path from "path";
import { exec } from "child_process";
import { text } from "stream/consumers";

export async function extractCumuls(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Fichier introuvable : ${filePath}`);
    return null;
  }
  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);
  const text = data.text;

  const regex =
    /Cumul tous comptes[\s\S]*?(?:\d[\d\s,.]+E?\s+){1}(\d[\d\s,.]+)\s+(?:\d[\d\s,.]+E?\s+){1}(\d[\d\s,.]+)\s+(?:\d[\d\s,.]+E?\s+){1}(\d[\d\s,.]+)/;

  const match = text.match(regex);

  let cumul2025;
  let cumul2026;
  let cumul2027;

  if (match) {
    cumul2025 = parseFloat(match[1].replace(/\s/g, "").replace(",", "."));
    cumul2026 = parseFloat(match[2].replace(/\s/g, "").replace(",", "."));
    cumul2027 = parseFloat(match[3].replace(/\s/g, "").replace(",", "."));
  }
  
  return { cumul2025, cumul2026, cumul2027 };
}

export async function extractComments(filePath, numComptes) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Fichier introuvable : ${filePath}`);
    return null;
  }
  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);
  const text = data.text;

  const sectionD = text.match(/Cycle D[\s\S]*?(?=Cycle E|$)/);

  const regex = /(\d{6,8})\s*-\s*(.+?)\n([\s\S]*?)(?=\n\d{6,8}\s*-|\nChapitre|\nEdition|\Z)/g;
  const matches = [...sectionD[0].matchAll(regex)];

  const comptes = matches.map(m => ({
    compte: m[1],
    libelle: m[2],
    commentaire: m[3].replace(/[★☆•]+/g, '').trim()
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

export async function extractPointsImportants(filePath) {
  if (!fs.existsSync(filePath)) return [];

  const data = await pdf(fs.readFileSync(filePath));
  const text = data.text
    .replace(/\r\n/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/\uF06A/g, '')
    .replace(/\uF0A6/g, '')
    .replace(/\uF020|\uF021|\uF026|\uF02A/g, '');

  // on découpe le texte par blocs CODE - Libellé
  const regex = /([A-Z0-9]{2,15})\s*-\s*([^\n]+)\n([\s\S]*?)(?=\n[A-Z0-9]{2,15}\s*-|$)/g;
  const result = [];

  for (const m of text.matchAll(regex)) {
    const bloc = m[3].trim().split('\n');
    const ligneSymbole = bloc.find(l => (l.match(/[]/g) || []).length >= 2);
    if (!ligneSymbole) continue;

    // ligne suivante non vide = commentaire
    const idx = bloc.indexOf(ligneSymbole);
    let commentaire = bloc.slice(idx + 1).find(l => l.trim());
    if (!commentaire) continue;

    result.push({
      commentaire: commentaire.trim()
    });
  }

  return result;
}


export async function extractImmobEntree(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Fichier introuvable : ${filePath}`);
    return { comptes: "aucunes informations", totalGeneral: "aucunes informations" };
  }
  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);
  const text = data.text;

  const regex = /(\d{8})([^\n]+)\n([\s\S]*?)(?:Cumul du compte\s*([\d\s,.]+))(?:\s|$)/g;

  let comptes = [];
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
  if (!fs.existsSync(filePath)) {
    console.warn(`Fichier introuvable : ${filePath}`);
    return { comptes: "aucunes informations", totalGeneral: "aucunes informations" };
  }
  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);
  const text = data.text;

  const regex = /(\d{8})\s*([^\n]+)\n([\s\S]*?)(\d[\d\s,.]+)Cumul sorties du compte/g;

  let comptes = [];
  let totalGeneral;
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

  totalGeneral = totalGeneral ? totalGeneral.toLocaleString('fr-FR') : null;
  return { comptes, totalGeneral };
}

export function extractAnaSectorielle(pdfPath) {
  return new Promise((resolve, reject) => {
    const cmd = `python ./utils/extract_table.py "${pdfPath}"`;

    exec(cmd, { maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
      if (error) return reject("Python error: " + stderr);

      try {
        const parsed = JSON.parse(stdout);

        if (!parsed) {
          return reject("Tableau 'Répartition selon le chiffre' non trouvé");
        }

        parsed.rows = mergeBrokenLabels(parsed.rows);
        resolve(parsed);
      } catch (e) {
        reject("Parsing error: " + e.message + "\n" + stdout);
      }
    });
  });
}

export async function extractEmprunts(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Fichier introuvable : ${filePath}`);
    return { emprunts: [], remboursement_emprunt: null };
  }

  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);
  const text = data.text;

  const regexEmprunt =
    /\d{6,10}\s+(?<T_designation>.+?)Entreprise[\s\S]*?\n\d+\s*(?<T_date_debut>\d{2}\/\d{2}\/\d{2})\s+(?<T_date_fin>\d{2}\/\d{2}\/\d{2})(?<bloc>[\s\S]+?)(?=\n\d{6,10}|\nCumul|$)/g;

  const emprunts = [];
  const regexNombre = /\d{1,3}(?: ?\d{3})*,\d{1,2}/g;
  const regexRemboursN1 = /I[^\d]*(\d{1,3}(?: ?\d{3})*,\d{1,2})/;

  for (const match of text.matchAll(regexEmprunt)) {
    const { T_designation, T_date_debut, T_date_fin, bloc } = match.groups;

    const blocAvantK = bloc.split("K")[0];
    const blocApresK = bloc.split("K")[1];
    
    const nombres = [...blocAvantK.matchAll(regexNombre)].map((x) => x[0]);

    let montant_emprunt = "0,00";
    let montant_restant = "0,00";
    let remboursN1 = "0,00";

    if (nombres.length === 2) {
      montant_emprunt = nombres[0];
      montant_restant = "0,00";
    } else if (nombres.length >= 3) {
      montant_emprunt = nombres[0];
      montant_restant = nombres[1];
    }

    const remboursMatch = blocApresK.match(regexRemboursN1);
    if (remboursMatch) {
      remboursN1 = remboursMatch[1];
    }
    
    emprunts.push({
      T_designation: T_designation.replace(/\s+/g, " ").trim(),
      T_date_debut,
      T_date_fin,
      T_montant_emprunt : montant_emprunt.replace(/\s/g, "").replace(",", "."),
      T_montant_restant : montant_restant.replace(/\s/g, "").replace(",", "."),
      T_remboursN1: remboursN1.replace(/\s/g, "").replace(",", ".")
    });
  }

  return { emprunts };
}

function mergeBrokenLabels(rows) {
  const fixed = [];
  
  for (const row of rows) {
    if (row.length > 1) {
      fixed.push(row);
    } 
    else if (row.length === 1 && fixed.length > 0) {
      fixed[fixed.length - 1][0] += " " + row[0];
    }
  }

  return fixed;
}

export async function extractEcheancier(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Fichier introuvable : ${filePath}`);
    return [];
  }

  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);
  const text = data.text.replace(/\r\n/g, '\n');
  fs.unlinkSync(filePath);

  const result = [];

  const regexAnnee = /Année\s+(\d{4})([\s\S]*?)(?=Année\s+\d{4}|$)/g;

  for (const match of text.matchAll(regexAnnee)) {
    const annee = match[1];
    const blocAnnee = match[2];
    const echeanciers = [];

    const regexCaisse =
      /^([A-ZÉÈÎÏÂÔÛÙÀÇ][A-Za-zÉÈÊËÎÏÔÛÙÀÂÇ' ]+)\n([\s\S]*?Total[\d\s.,]+\n)/gm;

    for (const c of blocAnnee.matchAll(regexCaisse)) {
      const caisse = c[1].trim();
      const contenu = c[2];

      const regexLigne = /^([^\n]*?)\s*(\d{2}\/\d{2}\/\d{4})\s*([\d\s.,]+)$/gm;
      const lignes = [];

      for (const l of contenu.matchAll(regexLigne)) {
        const periode = l[1].trim();
        const date = l[2];
        const montant = l[3].trim();
        if (!periode || /total/i.test(periode)) continue;
        lignes.push({ periode, date, montant });
      }

      const totalMatch = contenu.match(/Total\s*([\d\s.,]+)/);
      const total = totalMatch ? totalMatch[1].trim() : null;

      if (lignes.length > 0) {
        echeanciers.push({ caisse, lignes, total });
      }
    }

    const totalAnneeMatch = blocAnnee.match(
      new RegExp(`([\\d\\s.,]+)\\s*Total\\s*année\\s*${annee}`, 'm')
    );
    const totalAnnee = totalAnneeMatch
      ? totalAnneeMatch[1].trim().split('\n').pop().trim()
      : null;

    result.push({ annee, echeanciers, totalAnnee });
  }
  
  return result;
}
