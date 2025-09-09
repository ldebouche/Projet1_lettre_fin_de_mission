import { poolPromise, sql } from '../config/db.js';

class dbService {
  async executeQuery(query, params) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('code_client', sql.NVarChar, params.code_client)
      .input('dateFinEx', sql.Date, params.dateFinEx)
      .query(query);
    return result.recordset[0] || null;
  }

  async GetDossier(code_client, dateFinEx) {
    return this.executeQuery('SELECT code_client FROM FEC WHERE code_client = @code_client AND datefinex = @dateFinEx', { code_client, dateFinEx });
  }

  async GetCA(code_client, dateFinEx) {
    return this.executeQuery(
      `SELECT 
        SUM(CASE WHEN YEAR(datefinex) = YEAR(@dateFinEx) 
                  THEN Credit - Debit ELSE 0 END) AS caN,
        SUM(CASE WHEN YEAR(datefinex) = YEAR(@dateFinEx) - 1 
                  THEN Credit - Debit ELSE 0 END) AS caN1,
        YEAR(@dateFinEx) AS anneeN,
        YEAR(@dateFinEx) - 1 AS anneeN1
      FROM FEC
      WHERE CompteNum LIKE '70%'
        AND code_client = @code_client
        AND (YEAR(datefinex) = YEAR(@dateFinEx) OR YEAR(datefinex) = YEAR(@dateFinEx) - 1)`,
      { code_client, dateFinEx }
    );
  }

  async VerifAnneeN1Existe(code_client, dateFinEx) {
    return this.executeQuery(
      `SELECT 
        MAX(CASE WHEN YEAR(datefinex) = YEAR(@dateFinEx) - 1 
                  THEN YEAR(datefinex) END) AS anneeN1
      FROM FEC
      WHERE code_client = @code_client`,
      { code_client, dateFinEx }
    );
  }

  async GetResEx(code_client, dateFinEx) {
    return this.executeQuery(
      `SELECT
        SUM(CASE WHEN YEAR(datefinex) = YEAR(@dateFinEx) 
                  AND CompteNum LIKE '6%' 
                  THEN Debit - Credit ELSE 0 END) AS totalCharges,
        SUM(CASE WHEN YEAR(datefinex) = YEAR(@dateFinEx) 
                  AND CompteNum LIKE '7%' 
                  THEN Credit - Debit ELSE 0 END) AS totalProduit
      FROM FEC
      WHERE code_client = @code_client
        AND YEAR(datefinex) = YEAR(@dateFinEx)`,
      { code_client, dateFinEx }
    );
  }

  async GetFormeSociete(code_client) {
    return this.executeQuery(
      `SELECT
        CASE WHEN clients.forme_societe = 'ei' THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS ei
      FROM clients
      WHERE clients.code_client = @code_client`,
      { code_client }
    )
  }
  
  async GetSignataire(code_client) {
    return this.executeQuery(
      `SELECT
        TRIM(collabExp.nom) AS nomExpert,
        TRIM(collabExp.prenom) AS prenomExpert,
        TRIM(collabRev.nom) AS nomReviseur,
        TRIM(collabRev.prenom) AS prenomReviseur
      FROM clients
      INNER JOIN collaborateurs AS collabExp ON clients.expert_comptable = collabExp.id_sellsy
      INNER JOIN collaborateurs AS collabRev ON clients.chef_de_mission = collabRev.id_sellsy
      WHERE clients.code_client = @code_client`,
      { code_client }
    );
  }

  async GetInfoFiscale(code_client) {
    return this.executeQuery(
      `SELECT
        CASE WHEN c.ape LIKE '41%' OR c.ape LIKE '42%' OR c.ape LIKE '43%' THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS info1,

        CASE WHEN SUM(CASE WHEN f.CompteNum LIKE '604%' OR f.CompteNum LIKE '611%' THEN 1 ELSE 0 END) > 0 
            THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS info2,

        CASE WHEN SUM(CASE WHEN f.CompteNum LIKE '53%' THEN 1 ELSE 0 END) > 0 
            THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS info3,

        CASE WHEN SUM(CASE WHEN f.CompteNum LIKE '654%' THEN 1 ELSE 0 END) > 0 
            THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS info4,

        CASE WHEN SUM(CASE WHEN f.CompteNum LIKE '455%' THEN Debit - Credit ELSE 0 END) > 0
            THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS info5,

        CASE WHEN c.forme_societe = 'ei' 
            THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS info6,

        CASE WHEN c.forme_societe = 'sci' AND c.categorie_revenu = 'rfonc' 
            THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS info7,

        CASE WHEN SUM(CASE WHEN f.CompteNum LIKE '641%' AND f.CompteNum NOT LIKE '647500%' THEN 1 ELSE 0 END) > 0
            THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS info8

      FROM clients c
      INNER JOIN FEC f ON c.code_client = f.code_client
      WHERE c.code_client = @code_client
      GROUP BY c.ape, c.forme_societe, c.categorie_revenu;`,
      { code_client }
    );
  }
}

export default new dbService();