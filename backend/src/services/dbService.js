import { type } from 'os';
import { poolPromise, sql } from '../config/db.js';

class dbService {
  async executeQuery(query, params = {}, single = true) {
    const pool = await poolPromise;
    const request = pool.request();
    for (const [key, value] of Object.entries(params)) {
      if (value instanceof Date) {
        request.input(key, sql.Date, value);
      } else {
        request.input(key, sql.NVarChar, value);
      }
    }

    const result = await request.query(query);
    return single ? result.recordset[0] || null : result.recordset;
  }

  async GetAggregats(code_client, dateFinEx) {
    return this.executeQuery(
      `SELECT *
      FROM Aggregats_FEC
      WHERE code_client = @code_client
        AND datefinex IN (
          @dateFinEx,
          (
            SELECT MAX(datefinex)
            FROM FEC
            WHERE code_client = @code_client
              AND datefinex < @dateFinEx
          )
        )
      ORDER BY datefinex DESC;`,
      { code_client, dateFinEx },
      false,
    );
  }

  async GetDossier(code_client, dateFinEx) {
    return this.executeQuery(
      `SELECT code_client 
      FROM FEC 
      WHERE code_client = @code_client 
        AND datefinex = @dateFinEx;`,
      { code_client, dateFinEx },
    );
  }

  async GetInfoClients(code_client) {
    return this.executeQuery(
      `SELECT
        c.ape AS code_ape,
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
        CASE WHEN c.forme_societe LIKE 'ass%' AND regime_fiscal = 'a' THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS tabAutofinancement,
        c.site AS site
      FROM clients AS c
      INNER JOIN collaborateurs AS collab ON c.chef_de_mission = collab.id_sellsy
      WHERE c.code_client = @code_client;`,
      { code_client },
    );
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
      { code_client },
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
      WHERE c.code_client = @code_client AND f.datefinex = @dateFinEx
      GROUP BY c.ape, c.forme_societe, c.categorie_revenu;`,
      { code_client, dateFinEx },
    );
  }

  async GetInfoEvoCharges(code_client, dateFinEx) {
    return this.executeQuery(
      `SELECT 
          CASE
              WHEN f.CompteNum LIKE '606%' THEN 'Fournitures consommables'
              WHEN f.CompteNum LIKE '611%' THEN 'Sous-traitance'
              WHEN f.CompteNum LIKE '612%' THEN 'Loyers de crédits-bails'
              WHEN f.CompteNum LIKE '613%' OR f.CompteNum LIKE '614%' THEN 'Locations, Charges locatives'
              WHEN f.CompteNum LIKE '615%' THEN 'Entretiens, Réparations'
              WHEN f.CompteNum LIKE '616%' THEN 'Primes d''assurance'
              WHEN f.CompteNum LIKE '617%' THEN 'Etudes, recherches'
              WHEN f.CompteNum LIKE '621%' THEN 'Personnel extérieur'
              WHEN f.CompteNum LIKE '622%' THEN 'Intermédiaires et honoraires'
              WHEN f.CompteNum LIKE '623%' THEN 'Publicité'
              WHEN f.CompteNum LIKE '624%' THEN 'Transports'
              WHEN f.CompteNum LIKE '625%' THEN 'Déplacements, Réception'
              WHEN f.CompteNum LIKE '626%' THEN 'Frais postaux, Télécom.'
              WHEN f.CompteNum LIKE '627%' THEN 'Frais bancaires'
              WHEN f.CompteNum LIKE '618%' OR f.CompteNum LIKE '619%' 
                OR f.CompteNum LIKE '628%' OR f.CompteNum LIKE '629%' THEN 'Autres services extérieurs'
          END AS EC_lib,

          SUM(CASE WHEN YEAR(f.datefinex) = YEAR(@dateFinEx) 
                  THEN f.Debit - f.Credit ELSE 0 END) AS EC_valN,

          SUM(CASE WHEN YEAR(f.datefinex) = YEAR(@dateFinEx) - 1
                  THEN f.Debit - f.Credit ELSE 0 END) AS EC_valN1

      FROM FEC f
      WHERE f.code_client = @code_client
        AND f.datefinex IN (
            @dateFinEx,
            (
              SELECT MAX(datefinex)
              FROM FEC
              WHERE code_client = @code_client
                AND datefinex < @dateFinEx
            )
        )
        AND (
            f.CompteNum LIKE '606%' OR f.CompteNum LIKE '611%' OR f.CompteNum LIKE '612%'
            OR f.CompteNum LIKE '613%' OR f.CompteNum LIKE '614%' OR f.CompteNum LIKE '615%'
            OR f.CompteNum LIKE '616%' OR f.CompteNum LIKE '617%' OR f.CompteNum LIKE '621%'
            OR f.CompteNum LIKE '622%' OR f.CompteNum LIKE '623%' OR f.CompteNum LIKE '624%'
            OR f.CompteNum LIKE '625%' OR f.CompteNum LIKE '626%' OR f.CompteNum LIKE '627%'
            OR f.CompteNum LIKE '618%' OR f.CompteNum LIKE '619%' OR f.CompteNum LIKE '628%' OR f.CompteNum LIKE '629%'
        )
      GROUP BY 
          CASE
              WHEN f.CompteNum LIKE '606%' THEN 'Fournitures consommables'
              WHEN f.CompteNum LIKE '611%' THEN 'Sous-traitance'
              WHEN f.CompteNum LIKE '612%' THEN 'Loyers de crédits-bails'
              WHEN f.CompteNum LIKE '613%' OR f.CompteNum LIKE '614%' THEN 'Locations, Charges locatives'
              WHEN f.CompteNum LIKE '615%' THEN 'Entretiens, Réparations'
              WHEN f.CompteNum LIKE '616%' THEN 'Primes d''assurance'
              WHEN f.CompteNum LIKE '617%' THEN 'Etudes, recherches'
              WHEN f.CompteNum LIKE '621%' THEN 'Personnel extérieur'
              WHEN f.CompteNum LIKE '622%' THEN 'Intermédiaires et honoraires'
              WHEN f.CompteNum LIKE '623%' THEN 'Publicité'
              WHEN f.CompteNum LIKE '624%' THEN 'Transports'
              WHEN f.CompteNum LIKE '625%' THEN 'Déplacements, Réception'
              WHEN f.CompteNum LIKE '626%' THEN 'Frais postaux, Télécom.'
              WHEN f.CompteNum LIKE '627%' THEN 'Frais bancaires'
              WHEN f.CompteNum LIKE '618%' OR f.CompteNum LIKE '619%' 
                OR f.CompteNum LIKE '628%' OR f.CompteNum LIKE '629%' THEN 'Autres services extérieurs'
          END,
          CASE
              WHEN f.CompteNum LIKE '606%' THEN 1
              WHEN f.CompteNum LIKE '611%' THEN 2
              WHEN f.CompteNum LIKE '612%' THEN 3
              WHEN f.CompteNum LIKE '613%' OR f.CompteNum LIKE '614%' THEN 4
              WHEN f.CompteNum LIKE '615%' THEN 5
              WHEN f.CompteNum LIKE '616%' THEN 6
              WHEN f.CompteNum LIKE '617%' THEN 7
              WHEN f.CompteNum LIKE '621%' THEN 8
              WHEN f.CompteNum LIKE '622%' THEN 9
              WHEN f.CompteNum LIKE '623%' THEN 10
              WHEN f.CompteNum LIKE '624%' THEN 11
              WHEN f.CompteNum LIKE '625%' THEN 12
              WHEN f.CompteNum LIKE '626%' THEN 13
              WHEN f.CompteNum LIKE '627%' THEN 14
              WHEN f.CompteNum LIKE '618%' OR f.CompteNum LIKE '619%' 
                OR f.CompteNum LIKE '628%' OR f.CompteNum LIKE '629%' THEN 15
          END
      ORDER BY 
          CASE
              WHEN f.CompteNum LIKE '606%' THEN 1
              WHEN f.CompteNum LIKE '611%' THEN 2
              WHEN f.CompteNum LIKE '612%' THEN 3
              WHEN f.CompteNum LIKE '613%' OR f.CompteNum LIKE '614%' THEN 4
              WHEN f.CompteNum LIKE '615%' THEN 5
              WHEN f.CompteNum LIKE '616%' THEN 6
              WHEN f.CompteNum LIKE '617%' THEN 7
              WHEN f.CompteNum LIKE '621%' THEN 8
              WHEN f.CompteNum LIKE '622%' THEN 9
              WHEN f.CompteNum LIKE '623%' THEN 10
              WHEN f.CompteNum LIKE '624%' THEN 11
              WHEN f.CompteNum LIKE '625%' THEN 12
              WHEN f.CompteNum LIKE '626%' THEN 13
              WHEN f.CompteNum LIKE '627%' THEN 14
              WHEN f.CompteNum LIKE '618%' OR f.CompteNum LIKE '619%' 
                OR f.CompteNum LIKE '628%' OR f.CompteNum LIKE '629%' THEN 15
          END;`,
      { code_client, dateFinEx },
      false,
    );
  }

  async GetAnaSectorielle(code_ape) {
    return this.executeQuery(
      `SELECT 
          *,
          CASE 
              WHEN libelle = 'Commentaire' THEN 'commentaire'
              ELSE 'valeur'
          END AS type_donnee
      FROM analyse_sectorielle
      WHERE code_ape = @code_ape
        AND millesime = (
          SELECT MAX(millesime)
          FROM analyse_sectorielle
          WHERE code_ape = @code_ape
        );`,
      { code_ape },
      false,
    );
  }

  async GetMontantCharges(code_client, dateFinEx, comptes) {
    return this.executeQuery(
      `SELECT 
        f.CompteNum,
        SUM(f.Debit - f.Credit) AS montant
      FROM FEC f
      WHERE f.code_client = @code_client
        AND f.datefinex = @dateFinEx
        AND f.CompteNum IN (
          SELECT value FROM STRING_SPLIT(@comptes, ','))
      GROUP BY f.CompteNum;`,
      { code_client, dateFinEx, comptes },
      false,
    );
  }
}

export default new dbService();

export function selectSite(ville) {
  const site = {
    'Baume les Dames' : {
      adresse: '6 RUE ERNEST NICOLAS',
      cp: '25110',
      ville: 'BAUME LES DAMES'
    },
    'Besançon' : {
      adresse: '9 RUE JACQUARD',
      cp: '25000',
      ville: 'BESANCON'
    },
    'Morteau' : {
      adresse: '13 RUE RENE PAYOT',
      cp: '25500',
      ville: 'MORTEAU'
    }
  };
  return site[ville];
}