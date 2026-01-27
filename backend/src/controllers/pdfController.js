import { extractCumuls, extractComments, extractPointsImportants, extractImmobEntree, extractImmobSortie, extractAnaSectorielle, extractEmprunts, extractEcheancier } from "../services/pdfService.js";
import { poolPromise, sql } from "../config/db.js";
import { generateAIComment } from "../services/aiService.js";
import { buildPdfPath } from "../utils/pdfPathBuilder.js";
import pLimit from "p-limit";


export async function getCumuls(req, res) {
  try {
    const { code_client, datefinex } = req.query;

    if (!code_client || !datefinex) {
      return res.status(400).json({ error: "code_client et datefinex requis" });
    }

    const filePath = buildPdfPath({
      codeClient: code_client,
      type: "Simul des amorts sur 3 ans",
      dateFinEx: datefinex
    });

    const result = await extractCumuls(filePath);

    if (!result) {
      return res.status(200).json(null);
    }

    res.status(200).json(result);
  } catch (err) {
    console.error("Erreur dans getCumuls :", err);
    res.status(500).json({ message: "Erreur interne serveur" });
  }
}

export async function getComments(req, res) {
  try {
    const { compte, code_client, datefinex } = req.query;

    if (!code_client || !datefinex) {
      return res.status(400).json({ error: "code_client et datefinex requis" });
    }

    const filePath = buildPdfPath({
      codeClient: code_client,
      type: "Liste pts imp, N_ syn, Report_",
      dateFinEx: datefinex
    });

    const limit = pLimit(2);

    const comments = await extractComments(filePath, compte);

    if (!comments || comments.length === 0) {
      return res.status(200).json(null);
    }

    const withAI = await Promise.all(
      comments.map(c =>
        limit(async () => {
          try {
            const { comment: aiText } = await generateAIComment("reformuler", { texte: c.commentaire });
            return { ...c, commentaireReformule: aiText?.trim() || c.commentaire };
          } catch (err) {
            console.warn(err);
            return { ...c, commentaireReformule: c.commentaire };
          }
        })
      )
    );
    res.status(200).json({ compte, comments: withAI });
  } catch (err) {
    console.error("Erreur extraction PDF:", err);
    res.status(500).json({ error: "Impossible d'extraire les commentaires" });
  }
}

export async function getPointsImportants(req, res) {
  try {
    const { code_client, datefinex } = req.query;

    if (!code_client || !datefinex) {
      return res.status(400).json({ error: "code_client et datefinex requis" });
    }

    const filePath = buildPdfPath({
      codeClient: code_client,
      type: "Liste pts imp, N_ syn, Report_",
      dateFinEx: datefinex
    });
    const points = await extractPointsImportants(filePath);

    res.status(200).json(points);
  } catch (err) {
    console.error("Erreur extraction PDF:", err);
    res.status(500).json({ error: "Impossible d'extraire les points importants" });
  }
}

function isImmobEmpty(immob) {
  if (!immob) return true;

  const lignesVides =
    !Array.isArray(immob.lignes) || immob.lignes.length === 0;

  const totalVide =
    immob.totalGeneral === null || immob.totalGeneral === undefined;

  return lignesVides && totalVide;
}

export async function getImmob(req, res) {
  try {
    const { code_client, datefinex } = req.query;

    if (!code_client || !datefinex) {
      return res.status(400).json({ error: "code_client et datefinex requis" });
    }

    const filePathEntree = buildPdfPath({
      codeClient: code_client,
      type: "Immobs Entrées de l'exercice",
      dateFinEx: datefinex
    });

    const filePathSortie = buildPdfPath({
      codeClient: code_client,
      type: "Immobs Sorties de l'exercice",
      dateFinEx: datefinex
    });

    const immobEntree = await extractImmobEntree(filePathEntree);
    const immobSortie = await extractImmobSortie(filePathSortie);

    const entreeVide = isImmobEmpty(immobEntree);
    const sortieVide = isImmobEmpty(immobSortie);

    if (entreeVide && sortieVide) {
      return res.status(200).json(null);
    }

    return res.status(200).json({
      immobEntree: entreeVide ? null : immobEntree,
      immobSortie: sortieVide ? null : immobSortie
    });
  } catch (err) {
    console.error("Erreur extraction PDF:", err);
    res.status(500).json({ error: "Impossible d'extraire les immobilisations" });
  }
}

export async function getAnaSectorielle(req, res) {
  try {
    const { path } = req.query;
    if (!path) {
      return res.status(400).json({ error: "Chemin du fichier PDF requis" });
    }

    const analyse = await extractAnaSectorielle(path);

    const pool = await poolPromise;

    for (const row of analyse.rows) {
      await pool.request()
        .input("code_ape", sql.NVarChar, analyse.code_ape)
        .input("millesime", sql.Int, analyse.millesime)
        .input("libelle", sql.NVarChar, row[0] ?? null)
        .input("tranche_globale", sql.NVarChar, row[1] ?? null)
        .input("tranche_1", sql.NVarChar, row[2] ?? null)
        .input("tranche_2", sql.NVarChar, row[3] ?? null)
        .input("tranche_3", sql.NVarChar, row[4] ?? null)
        .input("tranche_4", sql.NVarChar, row[5] ?? null)
        .input("tranche_5", sql.NVarChar, row[6] ?? null)
        .input("perspectives", sql.NVarChar, row[7] ?? null)
        .query(`
          INSERT INTO analyse_sectorielle 
          (code_ape, millesime, libelle, tranche_globale, tranche_1, tranche_2, tranche_3, tranche_4, tranche_5, perspectives)
          VALUES (@code_ape, @millesime, @libelle, @tranche_globale, @tranche_1, @tranche_2, @tranche_3, @tranche_4, @tranche_5, @perspectives);
        `);
    }

    res.json({ message: "Données insérées", analyse });
  } catch (err) {
    console.error("Erreur analyseSectorielle:", err);
    res.status(500).json({ error: "Impossible d'extraire/insérer les données" });
  }
}

export async function getEmprunts(req, res) {
  try {
    const { code_client, datefinex } = req.query;

    if (!code_client || !datefinex) {
      return res.status(400).json({ error: "code_client et datefinex requis" });
    }

    const filePath = buildPdfPath({
      codeClient: code_client,
      type: "Etat des emprunts (Et fiscal)",
      dateFinEx: datefinex
    });

    const emprunts = await extractEmprunts(filePath);

    if (!emprunts) {
      return res.status(200).json(null);
    }

    res.status(200).json(emprunts);
  } catch (err) {
    console.error("Erreur extraction PDF:", err);
    res.status(500).json({ error: "Impossible d'extraire les emprunts" });
  }
}

export async function getEcheancier(req, res) {
  try {
    const file = req.file.path;
    const echeancier = await extractEcheancier(file);

    res.status(200).json(echeancier);
  } catch (err) {
    console.error("Erreur extraction PDF:", err);
    res.status(500).json({ error: "Impossible d'extraire l'echeancier" });
  }
}