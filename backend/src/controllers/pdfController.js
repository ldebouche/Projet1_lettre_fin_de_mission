import { extractCumuls, extractComments, extractPointsImportants, extractImmobEntree, extractImmobSortie, extractAnaSectorielle, extractEmprunts, extractEcheancier } from "../services/pdfService.js";
import { poolPromise, sql } from "../config/db.js";
import { generateAIComment } from "../services/aiService.js";
import pLimit from "p-limit";


export async function getCumuls(req, res) {
  try {
    const filePath = "./Simul des amorts sur 3 ans.pdf";
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
    const { compte } = req.query;
    const filePath = "./efm cdt.pdf";
    const limit = pLimit(3);
    const comments = await extractComments(filePath, compte);
    
    if (!comments) {
      return res.status(200).json(null);
    }

    const withAI = await Promise.all(
      comments.map(c =>
        limit(async () => {
          try {
            const aiText = await generateAIComment("reformuler", { texte: c.commentaire });
            return { ...c, commentaireReformule: aiText?.trim() || c.commentaire };
          } catch (err) {
            console.warn("Erreur IA sur", c.commentaire);
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
    const filePath = "./Liste pts imp, N. syn, Report 1.pdf";
    const points = await extractPointsImportants(filePath);

    res.status(200).json(points);
  } catch (err) {
    console.error("Erreur extraction PDF:", err);
    res.status(500).json({ error: "Impossible d'extraire les points importants" });
  }
}

export async function getImmob(req, res) {
  try {
    const filePathEntree = "./Immobs Entrées de l'exercice.pdf";
    const filePathSortie = "./Immobs Sorties de l'exercice.pdf";
    const immobEntree = await extractImmobEntree(filePathEntree);
    const immobSortie = await extractImmobSortie(filePathSortie);
    
    if (immobEntree.comptes == "aucunes informations" && immobSortie.comptes == "aucunes informations") {
      return res.status(200).json(null);
    }

    const immob = { immobEntree, immobSortie };

    res.status(200).json(immob);
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
    const filePath = "./EMPRUNT 1.pdf";
    const emprunts = await extractEmprunts(filePath);

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