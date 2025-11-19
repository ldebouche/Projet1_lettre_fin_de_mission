import fs from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import path from "path";
import { exec } from "child_process";

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

export function genererWord(variables, folderPath) {
  const templateName = variables.anneeN1Existe
    ? "modele_complet1.docm"
    : "modele_simple1.docm";

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

export function genererPPT(variables, folderPath) {
  const BackendPath = "C:\\Users\\DEBOUCHELucas\\Projets_stage\\Projet1_lettre_fin_de_mission\\backend\\src\\templates";
  const dataPath = path.join(BackendPath, "data.json");
  const vbsPath = path.join(BackendPath, "launchPPT.vbs");

  folderPath = path.join(folderPath, "ppt");
  const resolvedFolder = path.resolve(folderPath);

  if (!fs.existsSync(resolvedFolder)) {
    fs.mkdirSync(resolvedFolder, { recursive: true });
  }

  const fileName = `lfm_${variables.code_client}_${variables.anneeN}.pptm`;
  const filePath = path.join(resolvedFolder, fileName);

  fs.writeFileSync(dataPath, JSON.stringify(variables), "utf8");

  exec(`cscript //nologo "${vbsPath}" "${filePath}"`, (error, stdout, stderr) => {
    if (error) {
      console.error("Erreur lors du lancement du script VBS :", error);
      return;
    }
    if (stderr) {
      console.error("Erreur VBS :", stderr);
    }
    console.log("Script VBS exécuté avec succès :", stdout);
  });
}
