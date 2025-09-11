import fs from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import path from "path";

function flattenObject(obj, parentKey = "", result = {}) {
  let hasInfoFiscale = false;

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newKey = parentKey ? `${parentKey}_${key}` : key;
      if (typeof obj[key] === "object" && obj[key] !== null && !Array.isArray(obj[key])) {
        flattenObject(obj[key], newKey, result);
      } else {
        result[newKey] = obj[key];
      }
    }
  }
  
  if (Array.isArray(obj.informationFiscale)) {
    hasInfoFiscale = obj.informationFiscale.some(v => v === true);
    result["informationFiscale"] = hasInfoFiscale;
    
  }
  return result;
}

export function genererWord(variables) {
  const templateName = variables.anneeN1Existe ? "modele_complet.docx" : "modele_simple.docx";

  const templatePath = path.join(process.cwd(), "templates", templateName);
  const content = fs.readFileSync(templatePath, "binary");
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "[[", end: "]]" },
    nullGetter() { return ""; }
  });

  // 🔄 Aplatir les données
  const flatVariables = flattenObject(variables);
  console.log("Variables utilisées :", flatVariables);

  doc.render(flatVariables);

  const buf = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  return buf;
}
