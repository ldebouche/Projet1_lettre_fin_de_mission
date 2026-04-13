import fs from "fs";
import pdf from "pdf-parse-fork";
import path from "path";
import { exec } from "child_process";
import { PATHS } from "../config/paths.js";

export async function extractCumuls(filePath) {
  if (!fs.existsSync(filePath)) return null;

  const buffer = fs.readFileSync(filePath);
  const { text } = await pdf(buffer);

  const part = text.split(/Cumul tous comptes/i)[1];
  if (!part) return null;

  const regex = /E\s*([\d\s\u00A0]+,\d+)/g;
  const values = [];

  let match;
  while ((match = regex.exec(part)) !== null) {
    values.push(
      parseFloat(
        match[1].replace(/[\s\u00A0]/g, "").replace(",", ".")
      )
    );
  }

  if (values.length < 3) return null;

  return {
    cumul2025: values[0],
    cumul2026: values[1],
    cumul2027: values[2],
  };
}

export async function extractComments(filePath, numComptes) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Fichier introuvable : ${filePath}`);
    return null;
  }
  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);
  const text = data.text;

  if (text.trim().length < 50) return [];

  const sectionDMatch = text.match(/(?:^|\n)\s*Cycle\s*D\b[\s\S]*?(?=(?:\n\s*Cycle\s*E\b)|$)/i);
  if (!sectionDMatch) return [];

  const sectionD = sectionDMatch[0];

  const regex = /(\d{6,8})\s*-\s*(.+?)\n([\s\S]*?)(?=\n\d{6,8}\s*-|\nChapitre|\nEdition|\Z)/g;
  const comptes = [...sectionD.matchAll(regex)].map(m => ({
    compte: m[1],
    libelle: m[2],
    commentaire: m[3].replace(/[★☆•]+/g, '').trim()
  }));
  if (!numComptes) return comptes;

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

  const regex = /([A-Z0-9]{2,15})\s*-\s*([^\n]+)\n([\s\S]*?)(?=\n[A-Z0-9]{2,15}\s*-|$)/g;
  const result = [];

  for (const m of text.matchAll(regex)) {
    const bloc = m[3].trim().split('\n');
    const ligneSymbole = bloc.find(l => (l.match(/[]/g) || []).length >= 2);
    if (!ligneSymbole) continue;

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
    return { lignes: [], totalGeneral: "aucunes informations" };
  }

  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);

  const text = (data.text || "")
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n");

  if (!text.trim()) return { lignes: [], totalGeneral: "aucunes informations" };

  const lignes = [];
  const reDate = /\d{2}\/\d{2}\/\d{2}/;
  const reMontant = /(\d{1,3}(?: \d{3})*,\d{2})/;

  for (const line of text.split("\n").map(l => l.trim()).filter(Boolean)) {
    if (/^Cumul\b/i.test(line)) continue;
    if (/^\d{6,}\s*/.test(line)) continue; // lignes compte: 20780000...

    const mNo = line.match(/^(\d+)\s*/);
    if (!mNo) continue;

    const afterNo = line.slice(mNo[0].length);
    const iDate = afterNo.search(reDate);
    if (iDate < 0) continue;

    const libelle = afterNo.slice(0, iDate).trim();
    const date = afterNo.slice(iDate, iDate + 8);

    const rest = afterNo
      .slice(iDate + 8)
      .replace(/(Achat|Apport|Reprise)(?=\d)/gi, "$1 "); // Achat450,00 -> Achat 450,00

    const mMontant = rest.match(reMontant);
    if (!mMontant) continue;

    lignes.push({ libelle, date, montant: mMontant[1] });
  }

  const totalGeneralMatch = text.match(/Total des entrées\s*([\d ]+,\d{2})/i);
  const totalGeneral = totalGeneralMatch ? totalGeneralMatch[1].trim() : null;

  return { lignes, totalGeneral };
}


export async function extractImmobSortie(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Fichier introuvable : ${filePath}`);
    return { lignes: [], totalGeneral: "aucunes informations" };
  }

  return new Promise((resolve, reject) => {
    const pythonPath = PATHS.pythonExecutablePath;
    const scriptPath = path.join(PATHS.utilsRoot, "extract_immobSortie.py");
    const cmd = `"${pythonPath}" "${scriptPath}" "${filePath}"`;

    exec(cmd, { maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
      if (err) return reject("Erreur Python : " + stderr);

      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (e) {
        reject("Erreur parsing JSON : " + e.message);
      }
    });
  });
}

export async function extractAnaSectorielle(filePath) {
  if (!fs.existsSync(filePath)) return null;

  const { text } = await pdf(fs.readFileSync(filePath));
  const t = (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[•➜]/g, "-");

  const millesime = Number((filePath.match(/(19|20)\d{2}/) || [])[0] || null);

  const rawLines = t.split("\n").map(l => l.replace(/\s+/g, " ").trim());

  const codes = [...new Set([...t.matchAll(/\b(\d{2})\.(\d{2})([A-Z])\b/gi)]
    .map(m => `${m[1]}${m[2]}${m[3]}`.toUpperCase())
  )];

  const isToc = l => /\.{5,}\s*\d+\s*$/.test(l);
  const isFooter = l =>
    /Analyses\s+sectorielles\s*-\s*CNOEC\s*\|/i.test(l) ||
    /^\|\s*\d+\s*$/.test(l) ||
    /\|\s*\d+\s*$/.test(l);

  const titleRe = /^(\d+)\.(\d+)\.\s+(.*)$/;
  const majorTitleRe = /^(\d+)\.\s+\S/;
  const isPerspTitle = s => /\b(perspectiv|prévis)\w*\b/i.test(s);

  const isHardStopTitle = l => /^structure\s+financi[eè]re\b/i.test(l);

  const start = rawLines.findIndex(l => l && !isToc(l) && titleRe.test(l) && isPerspTitle(l.match(titleRe)[3]));
  let commentaire = "";

  if (start >= 0) {
    const [, maj, sub] = rawLines[start].match(titleRe);

    let end = rawLines.length;
    let emptyRun = 0;

    for (let i = start + 1; i < rawLines.length; i++) {
      const l = rawLines[i];

      if (!l) { emptyRun++; continue; }
      else emptyRun = 0;

      if (isToc(l) || isFooter(l)) continue;

      if (emptyRun >= 2 && (titleRe.test(l) || majorTitleRe.test(l) || isHardStopTitle(l))) {
        end = i;
        break;
      }

      if (majorTitleRe.test(l) || isHardStopTitle(l)) {
        end = i;
        break;
      }

      if (titleRe.test(l)) {
        const [, m2, s2, label] = l.match(titleRe);

        if (m2 === maj && s2 !== sub && !isPerspTitle(label)) {
          end = i;
          break;
        }

        if (m2 !== maj) {
          end = i;
          break;
        }
      }
    }

    const block = rawLines
      .slice(start + 1, end)
      .filter(l => l && !isToc(l) && !isFooter(l));

    commentaire = block.join("\n").trim();
  }

  return {
    millesime,
    items: (codes.length ? codes.sort() : ["UNKNOWN"]).map(code_ape => ({ code_ape, commentaire }))
  };
}

export async function extractEmprunts(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Fichier introuvable : ${filePath}`);
    return null;
  }

  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);
  const text = data.text;

  const regexEmprunt =
    /(?<numero>\d{8})\s*(?<E_designation>.+?)Entreprise[\s\S]*?(?<E_date_debut>\d{2}\/\d{2}\/\d{2})\s*(?<E_date_fin>\d{2}\/\d{2}\/\d{2})(?<bloc>[\s\S]+?)(?=(?:\n|\r)\d{8}|Cumul|$)/g;


  const emprunts = [];
  const regexNombre = /\d{1,3}(?: ?\d{3})*,\d{1,2}/g;
  const regexRemboursN1 = /I[^\d]*(\d{1,3}(?: ?\d{3})*,\d{1,2})/;
  for (const match of text.matchAll(regexEmprunt)) {
    const { E_designation, E_date_debut, E_date_fin, bloc } = match.groups;

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
      E_designation: E_designation.replace(/\s+/g, " ").trim(),
      E_date_debut,
      E_date_fin,
      E_montant_emprunt: montant_emprunt.replace(/\s/g, "").replace(",", "."),
      E_montant_restant: montant_restant.replace(/\s/g, "").replace(",", "."),
      E_remboursN1: remboursN1.replace(/\s/g, "").replace(",", ".")
    });
  }

  return { emprunts };
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
