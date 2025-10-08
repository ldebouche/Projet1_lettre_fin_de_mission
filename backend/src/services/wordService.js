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

  const flatVariables = flattenObject(variables);
  console.log("Variables utilisées :", flatVariables);

  doc.render(flatVariables);

  let xml = doc.getZip().file("word/document.xml").asText();

  const tables = [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)];

  if (tables.length >= 2) {
    const firstPart = xml.split(tables[1])[0];
    const lastPart = xml.split(tables[1])[1];
    const targetTable = tables[1][0];

    const cleanedTable = targetTable.replace(
      /<w:tr[\s\S]*?<\/w:tr>/g,
      (row) => (/<w:t[^>]*>[^<]+<\/w:t>/.test(row) ? row : "")
    );

    xml = firstPart + cleanedTable + lastPart;
  } else {
    console.warn("Tableau des charges externes non trouvé !");
  }


  const newZip = new PizZip();
  Object.entries(doc.getZip().files).forEach(([fileName, file]) => {
    if (fileName === "word/document.xml") {
      newZip.file(fileName, xml);
    } else if (file._data && typeof file._data.getContent === "function") {
      newZip.file(fileName, file._data.getContent(), { binary: true });
    } else if (file.asText) {
      newZip.file(fileName, file.asText());
    }
  });

  const finalBuf = newZip.generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  return finalBuf;
}
