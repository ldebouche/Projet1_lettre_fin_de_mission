import fs from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import path from "path";

function flattenObject(obj, parentKey = "", result = {}) {
  let hasInfoFiscale = false;

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newKey = parentKey ? `${parentKey}_${key}` : key;
      if (
        typeof obj[key] === "object" &&
        obj[key] !== null &&
        !Array.isArray(obj[key])
      ) {
        flattenObject(obj[key], newKey, result);
      } else {
        result[newKey] = obj[key];
      }
    }
  }

  if (Array.isArray(obj.informationFiscale)) {
    hasInfoFiscale = obj.informationFiscale.some((v) => v === true);
    result["informationFiscale"] = hasInfoFiscale;
  }

  return result;
}

export function genererWord(variables) {
  const templateName = variables.anneeN1Existe
    ? "modele_complet.docx"
    : "modele_simple.docx";

  const templatePath = path.join(process.cwd(), "templates", templateName);
  const content = fs.readFileSync(templatePath, "binary");
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "[[", end: "]]" },
    nullGetter() {
      return "";
    },
  });

  // 🔄 Aplatir les données
  const flatVariables = flattenObject(variables);
  console.log("Variables utilisées :", flatVariables);

  // 🧩 Rendu du document
  doc.render(flatVariables);

  // 🧹 Supprimer les lignes de tableau vides uniquement dans le tableau des charges externes
  let xml = doc.getZip().file("word/document.xml").asText();

  // Trouver tous les tableaux
  const tables = [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)];

  if (tables.length >= 2) {
    console.log("🧾 Tableau des charges externes détecté !");
    const firstPart = xml.split(tables[1])[0]; // avant le 2ᵉ tableau
    const lastPart = xml.split(tables[1])[1]; // après le 2ᵉ tableau
    const targetTable = tables[1][0];

    // Supprimer les lignes de tableau (w:tr) qui ne contiennent aucun texte (w:t)
    const cleanedTable = targetTable.replace(
      /<w:tr[\s\S]*?<\/w:tr>/g,
      (row) => (/<w:t[^>]*>[^<]+<\/w:t>/.test(row) ? row : "")
    );

    // Recompose le XML complet
    xml = firstPart + cleanedTable + lastPart;
  } else {
    console.warn("⚠️ Tableau des charges externes non trouvé !");
  }


  // 🔁 Réinjection du XML nettoyé dans un nouveau zip
  const newZip = new PizZip();
  Object.entries(doc.getZip().files).forEach(([fileName, file]) => {
    if (fileName === "word/document.xml") {
      // Remplace par la version nettoyée
      newZip.file(fileName, xml);
    } else if (file._data && typeof file._data.getContent === "function") {
      // Fichier binaire (image, font, etc.)
      newZip.file(fileName, file._data.getContent(), { binary: true });
    } else if (file.asText) {
      // Fichier XML ou texte
      newZip.file(fileName, file.asText());
    }
  });

  // 🏁 Génération finale
  const finalBuf = newZip.generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  console.log("✅ Document Word généré sans lignes vides");
  return finalBuf;
}
