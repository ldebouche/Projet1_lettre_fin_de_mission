import { poolPromise, sql } from '../config/db.js';

class dbService {
  async executeQuery(query, params, single = true) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('code_client', sql.NVarChar, params.code_client)
      .input('dateFinEx', sql.Date, params.dateFinEx)
      .query(query);
    return single ? (result.recordset[0] || null) : result.recordset;
  }

  async GetDossier(code_client, dateFinEx) {
    return this.executeQuery(
      `SELECT code_client 
      FROM FEC 
      WHERE code_client = @code_client 
        AND YEAR(datefinex) = YEAR(@dateFinEx);`,
      { code_client, dateFinEx }
    );
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

  async GetInfoFECForm(code_client, dateFinEx) {
    return this.executeQuery(
      `SELECT
        SUM(CASE WHEN YEAR(datefinex) = YEAR(@dateFinEx) 
                  AND CompteNum LIKE '6%' 
                  THEN Debit - Credit ELSE 0 END) AS totalCharges,
        SUM(CASE WHEN YEAR(datefinex) = YEAR(@dateFinEx) 
                  AND CompteNum LIKE '7%' 
                  THEN Credit - Debit ELSE 0 END) AS totalProduit,
        MAX(CASE WHEN YEAR(datefinex) = YEAR(@dateFinEx) - 1 
                  THEN YEAR(datefinex) END) AS anneeN1,
        SUM(CASE WHEN CompteNum LIKE '101300'
                  THEN Credit - Debit ELSE 0 END) AS capitalSocial,
        SUM(CASE WHEN CompteNum LIKE '106100'
                  THEN Credit - Debit ELSE 0 END) AS montantReserveLegale,
        SUM(CASE WHEN CompteNum LIKE '106800'
                  THEN Credit - Debit ELSE 0 END) AS montantReserveOrdinaire,
        SUM(CASE WHEN CompteNum LIKE '110000' OR CompteNum LIKE '119000'
                  THEN Credit - Debit ELSE 0 END) AS montantReportNouveau,
        SUM(CASE WHEN CompteNum LIKE '457000'
                  THEN Credit - Debit ELSE 0 END) AS montantDividendesN1,
        SUM(CASE WHEN CompteNum LIKE '695%' 
                  THEN Debit - Credit ELSE 0 END) AS acompte_total,
        CAST(SUM(CASE WHEN CompteNum LIKE '2%' THEN 1 ELSE 0 END) AS bit) AS I_classe2,
        CAST(SUM(CASE WHEN CompteNum LIKE '641%' THEN 1 ELSE 0 END) AS bit) AS MD_salaries
      FROM FEC
      WHERE code_client = @code_client AND YEAR(datefinex) = YEAR(@dateFinEx);`,
      { code_client, dateFinEx }
    );
  }

  async GetInfoClients(code_client) {
    return this.executeQuery(
      `SELECT
        c.soumis_is AS imposable,
        c.mois_cloture AS mois_cloture,
        CASE WHEN c.raison_sociale = ''
                THEN CONCAT(TRIM(c.civilite), ' ', TRIM(c.nom), ' ', TRIM(c.prenom)) 
             WHEN LEFT(c.raison_sociale, LEN(c.forme_societe)) = c.forme_societe
                THEN LTRIM(RTRIM(c.raison_sociale))
             ELSE CONCAT(TRIM(c.forme_societe), ' ', TRIM(c.raison_sociale)) END AS nomEntreprise,
        TRIM(c.forme_societe) AS forme_societe,
        TRIM(c.categorie_revenu) AS categorie_revenu,
        TRIM(c.adr1_corresp) AS adresseEntreprise1,
        TRIM(c.adr2_corresp) AS adresseEntreprise2,
        TRIM(c.cpos_corresp) AS codePostalClient,
        TRIM(c.ville_siege) AS villeClient,
        TRIM(c.site) AS lieuCreation,
        CONCAT(LEFT(collab.nom, 1), LEFT(collab.prenom, 1), ' ', TRIM(c.code_client)) AS initialesChefGroupe,
        CASE WHEN c.forme_societe LIKE 'ass%' AND regime_fiscal = 'a' THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS tabAutofinancement
      FROM clients AS c
      INNER JOIN collaborateurs AS collab ON c.chef_de_mission = collab.id_sellsy
      WHERE c.code_client = @code_client;`,
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
      WHERE clients.code_client = @code_client;`,
      { code_client }
    );
  }

  async GetInfoFiscale(code_client, dateFinEx) {
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
      WHERE c.code_client = @code_client AND YEAR(f.datefinex) = YEAR(@dateFinEx)
      GROUP BY c.ape, c.forme_societe, c.categorie_revenu;`,
      { code_client, dateFinEx }
    );
  }

  async GetInfoChiffresCles(code_client, dateFinEx) {
    return this.executeQuery(
      `WITH sig AS (
        SELECT 
            YEAR(datefinex) AS annee,

            MAX(datefinex) AS dateFinEx,

            SUM(CASE WHEN CompteNum LIKE '70%' THEN Credit - Debit ELSE 0 END) AS ca,

            SUM(CASE WHEN CompteNum LIKE '707%' THEN Credit - Debit ELSE 0 END) 
            - SUM(CASE WHEN CompteNum LIKE '607%' THEN Debit - Credit ELSE 0 END) AS marge,

            (SUM(CASE WHEN CompteNum LIKE '70%' THEN Credit - Debit ELSE 0 END)
            - SUM(CASE WHEN CompteNum LIKE '60%' THEN Debit - Credit ELSE 0 END)
            - SUM(CASE WHEN CompteNum LIKE '61%' THEN Debit - Credit ELSE 0 END)
            - SUM(CASE WHEN CompteNum LIKE '62%' THEN Debit - Credit ELSE 0 END)
            - SUM(CASE WHEN CompteNum LIKE '63%' THEN Debit - Credit ELSE 0 END)
            - SUM(CASE WHEN CompteNum LIKE '64%' THEN Debit - Credit ELSE 0 END)
            + SUM(CASE WHEN CompteNum LIKE '74%' THEN Credit - Debit ELSE 0 END)) AS ebe,

            (SUM(CASE WHEN CompteNum LIKE '70%' THEN Credit - Debit ELSE 0 END)
            - SUM(CASE WHEN CompteNum LIKE '60%' THEN Debit - Credit ELSE 0 END)
            + SUM(CASE WHEN CompteNum LIKE '76%' THEN Credit - Debit ELSE 0 END)
            - SUM(CASE WHEN CompteNum LIKE '66%' THEN Debit - Credit ELSE 0 END)) AS resCourant,

            (SUM(CASE WHEN CompteNum LIKE '70%' THEN Credit - Debit ELSE 0 END)
            - SUM(CASE WHEN CompteNum LIKE '60%' THEN Debit - Credit ELSE 0 END)
            + SUM(CASE WHEN CompteNum LIKE '76%' THEN Credit - Debit ELSE 0 END)
            - SUM(CASE WHEN CompteNum LIKE '66%' THEN Debit - Credit ELSE 0 END)
            + SUM(CASE WHEN CompteNum LIKE '77%' THEN Credit - Debit ELSE 0 END)
            - SUM(CASE WHEN CompteNum LIKE '67%' THEN Debit - Credit ELSE 0 END)
            - SUM(CASE WHEN CompteNum LIKE '69%' THEN Debit - Credit ELSE 0 END)) AS resNet

        FROM FEC
        WHERE code_client = @code_client
          AND YEAR(datefinex) IN (YEAR(@dateFinEx), YEAR(@dateFinEx) - 1)
        GROUP BY YEAR(datefinex)
    )

    SELECT 
        n.dateFinEx AS dateFinEx,
        n.ca AS caN,
        n1.ca AS caN1,

        n.marge AS margeN,
        n1.marge AS margeN1,

        n.ebe AS excedN,
        n1.ebe AS excedN1,

        n.resCourant AS resCourantN,
        n1.resCourant AS resCourantN1,

        n.resNet AS resNetN,
        n1.resNet AS resNetN1

    FROM sig n
    LEFT JOIN sig n1 ON n1.annee = n.annee - 1
    WHERE n.annee = YEAR(@dateFinEx);
    `,
      { code_client, dateFinEx }
    );
  }

  async GetInfoChargesPersonnel(code_client, dateFinEx) {
    return this.executeQuery(
      `SELECT 
        SUM(CASE WHEN YEAR(datefinex) = YEAR(@dateFinEx) AND CompteNum LIKE '64%' THEN Debit - Credit ELSE 0 END) AS CP_N,
        SUM(CASE WHEN YEAR(datefinex) = YEAR(@dateFinEx) - 1 AND CompteNum LIKE '64%' THEN Debit - Credit ELSE 0 END) AS CP_N1
      FROM FEC
      WHERE code_client = @code_client
        AND YEAR(datefinex) IN (YEAR(@dateFinEx), YEAR(@dateFinEx) - 1);`,
      { code_client, dateFinEx }
    );
  };

  async GetInfoImpotSociete(code_client, dateFinEx) {
    return this.executeQuery(
      `SELECT 
        SUM(CASE WHEN CompteNum LIKE '695000' OR CompteNum LIKE '695100' OR CompteNum LIKE '698100' THEN Debit - Credit ELSE 0 END) AS IS_tot,
        SUM(CASE WHEN CompteNum LIKE '699%' THEN Debit - Credit ELSE 0 END) AS IS_credit
      FROM FEC
      WHERE code_client = @code_client AND YEAR(datefinex) = YEAR(@dateFinEx);`,
      { code_client, dateFinEx }
    );
  };

  async GetInfoEvoCharges(code_client, dateFinEx) {
    return this.executeQuery(
      `SELECT 
          f.CompteNum AS EC_compte,
          f.CompteLib AS EC_lib,
          SUM(CASE 
                WHEN YEAR(f.datefinex) = YEAR(@dateFinEx) 
                AND (f.CompteNum LIKE '606%' OR f.CompteNum LIKE '61%' OR f.CompteNum LIKE '62%') 
                THEN f.Debit - f.Credit ELSE 0 END) AS EC_valN,
          SUM(CASE 
                WHEN YEAR(f.datefinex) = YEAR(@dateFinEx) - 1
                AND (f.CompteNum LIKE '606%' OR f.CompteNum LIKE '61%' OR f.CompteNum LIKE '62%') 
                THEN f.Debit - f.Credit ELSE 0 END) AS EC_valN1
      FROM FEC f
      WHERE f.code_client = @code_client
        AND YEAR(f.datefinex) IN (YEAR(@dateFinEx), YEAR(@dateFinEx) - 1)
        AND (f.CompteNum LIKE '606%' OR f.CompteNum LIKE '61%' OR f.CompteNum LIKE '62%')
      GROUP BY f.CompteNum, f.CompteLib
      ORDER BY f.CompteNum;`,
      { code_client, dateFinEx },
      false
    );
  };

  async GetInfoAutofinancement(code_client, dateFinEx) {
    return this.executeQuery(
      `SELECT 
        SUM(CASE WHEN CompteNum LIKE '681%' OR CompteNum LIKE '686%' 
                THEN Debit - Credit ELSE 0 END) AS AF_dota,

        SUM(CASE WHEN CompteNum LIKE '781%' OR CompteNum LIKE '786%' 
                THEN Credit - Debit ELSE 0 END) AS AF_reprises,

        (SUM(CASE WHEN CompteNum LIKE '675%' 
                  THEN Debit - Credit ELSE 0 END)
        - SUM(CASE WHEN CompteNum LIKE '775%' 
                  THEN Credit - Debit ELSE 0 END)) AS AF_cession,

        SUM(CASE WHEN CompteNum LIKE '777%' 
                THEN Credit - Debit ELSE 0 END) AS AF_subv,

        SUM(CASE WHEN CompteNum LIKE '16%' 
                THEN Debit - Credit ELSE 0 END) AS AF_rembours,

        SUM(CASE WHEN CompteNum LIKE '457%' 
                THEN Credit - Debit ELSE 0 END) AS AF_divi
      FROM FEC
      WHERE code_client = @code_client AND YEAR(datefinex) = YEAR(@dateFinEx);`,
      { code_client, dateFinEx }
    );
  };
}

export default new dbService();