import fs from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import path from "path";
import { exec } from "child_process";
import { PATHS } from "../config/paths.js";

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

import util from "util";

function logDocxError(err) {
  console.error("Docxtemplater error:", err.message);

  const e = err?.properties?.errors;
  if (Array.isArray(e)) {
    e.forEach((sub, i) => {
      console.error(`\n--- Sub error #${i + 1} ---`);
      console.error("name:", sub.name);
      console.error("message:", sub.message);
      console.error("properties:", util.inspect(sub.properties, { depth: 5 }));
    });
  } else {
    console.error("properties:", util.inspect(err.properties, { depth: 5 }));
  }
}

export function genererWord(variables, folderPath) {
  const templateName = variables.anneeN1Existe
    ? "modele_complet.docm"
    : "modele_simple.docm";

    console.log(templateName);

  const templatePath = path.join(PATHS.templatesRoot, templateName);
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

  try {
    doc.render(flatVariables);
  } catch (err) {
    logDocxError(err);
    throw err; // pour remonter au controller
  }

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
