import dbService from '../services/dbService.js';
import { comptesMapping } from '../utils/comptesMapping.js';

export const GetCAData = async (req, res) => {
  try {
    const { code_client, dateFinEx } = req.user;
    const caData = await dbService.GetCA(code_client, dateFinEx);

    if (!caData) {
      return res.status(404).json({ error: 'Pas de données trouvées' });
    }

    res.json(caData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur SQL' });
  }
};

export const GetDossierInfos = async (req, res) => {
  try {
    const { code_client, dateFinEx } = req.user;
    const anneeN = new Date(dateFinEx).getFullYear();
    const anneeN1 = anneeN - 1;

    // Récupération des infos
    const [infoClients, signataire, aggregats, infoEvoCharges] = await Promise.all([
      dbService.GetInfoClients(code_client, dateFinEx),
      dbService.GetSignataire(code_client, dateFinEx),
      dbService.GetAggregats(code_client, dateFinEx),
      dbService.GetInfoEvoCharges(code_client, dateFinEx)
    ]);

    const aggN = aggregats.find(a => a.annee === anneeN) || {};
    const aggN1 = aggregats.find(a => a.annee === anneeN1) || {};

    res.json({
      // === Infos générales ===
      anneeN1Existe: !!aggN1.annee,
      I_classe2: aggN.I_classe2,
      MD_salaries: aggN.MD_salaries,
      imposable: infoClients.imposable,
      mois_cloture: infoClients.mois_cloture,
      resEx: (aggN.totalProduits || 0) - (aggN.totalCharges || 0),
      forme_societe: infoClients.forme_societe,
      tabAutofinancement: infoClients.tabAutofinancement,
      categorie_revenu: infoClients.categorie_revenu,
      acompte_total: aggN.acompte_total || 0, // ajoute ce champ dans Aggregats_FEC si besoin
      signataire,
      capitalSocial: aggN.capitalSocial || 0,
      montantReserveLegale: aggN.montantReserveLegale || 0,
      montantReserveOrdinaire: aggN.montantReserveOrdinaire || 0,
      montantReportNouveau: aggN.montantReportNouveau || 0,
      montantDividendesN1: aggN.montantDividendesN1 || 0,

      // === Infos client ===
      client: {
        nomEntreprise: infoClients.nomEntreprise,
        adresseEntreprise1: infoClients.adresseEntreprise1,
        adresseEntreprise2: infoClients.adresseEntreprise2,
        codePostalClient: infoClients.codePostalClient,
        villeClient: infoClients.villeClient,
        lieuCreation: infoClients.lieuCreation,
        dateCreation: new Date().toLocaleDateString('fr-FR'),
        initialesChefGroupe: infoClients.initialesChefGroupe
      },

      // === Chiffres clés ===
      chiffreCles: {
        dateFinEx: new Date(dateFinEx).toLocaleDateString('fr-FR'),
        CC_caN: aggN.ca || 0,
        "CC_%caN": 100,
        CC_caN1: aggN1.ca || 0,
        "CC_%caN1": 100,
        CC_caVar: (aggN.ca || 0) - (aggN1.ca || 0),
        "CC_%caVar": (aggN1.ca
          ? ((aggN.ca - aggN1.ca) / aggN1.ca) * 100
          : null),
        CC_margeN: aggN.marge || 0,
        "CC_%margeN": aggN.ca ? (aggN.marge / aggN.ca) * 100 : null,
        CC_margeN1: aggN1.marge || 0,
        "CC_%margeN1": aggN1.ca ? (aggN1.marge / aggN1.ca) * 100 : null,
        CC_margeVar: (aggN.marge || 0) - (aggN1.marge || 0),
        "CC_%margeVar": (aggN1.marge
          ? ((aggN.marge - aggN1.marge) / aggN1.marge) * 100
          : null),
        CC_excedN: aggN.ebe || 0,
        "CC_%excedN": aggN.ca ? (aggN.ebe / aggN.ca) * 100 : null,
        CC_excedN1: aggN1.ebe || 0,
        "CC_%excedN1": aggN1.ca ? (aggN1.ebe / aggN1.ca) * 100 : null,
        CC_excedVar: (aggN.ebe || 0) - (aggN1.ebe || 0),
        "CC_%excedVar": (aggN1.ebe
          ? ((aggN.ebe - aggN1.ebe) / aggN1.ebe) * 100
          : null),
        CC_resCourantN: aggN.resCourant || 0,
        "CC_%resCourantN": aggN.ca ? (aggN.resCourant / aggN.ca) * 100 : null,
        CC_resCourantN1: aggN1.resCourant || 0,
        "CC_%resCourantN1": aggN1.ca ? (aggN1.resCourant / aggN1.ca) * 100 : null,
        CC_resCourantVar: (aggN.resCourant || 0) - (aggN1.resCourant || 0),
        "CC_%resCourantVar": (aggN1.resCourant
          ? ((aggN.resCourant - aggN1.resCourant) / aggN1.resCourant) * 100
          : null),
        CC_resNetN: aggN.resNet || 0,
        "CC_%resNetN": aggN.ca ? (aggN.resNet / aggN.ca) * 100 : null,
        CC_resNetN1: aggN1.resNet || 0,
        "CC_%resNetN1": aggN1.ca ? (aggN1.resNet / aggN1.ca) * 100 : null,
        CC_resNetVar: (aggN.resNet || 0) - (aggN1.resNet || 0),
        "CC_%resNetVar": (aggN1.resNet
          ? ((aggN.resNet - aggN1.resNet) / aggN1.resNet) * 100
          : null)
      },

      // === Evolution charges ===
      evolutionCharges: infoEvoCharges.map(item => {
        const valN = item.EC_valN || 0;
        const valN1 = item.EC_valN1 || 0;
        const valVar = valN - valN1;
        const pctVar = valN1 ? (valVar / valN1) * 100 : null;

        const totValN = infoEvoCharges.reduce((sum, it) => sum + (it.EC_valN || 0), 0);
        const poids = totValN ? (valN / totValN) * 100 : 0;

        let comment = false;
        if (poids > 30 || (pctVar !== null && Math.abs(pctVar) > 10 && Math.abs(valVar) / totValN * 100 > 6)) {
          comment = true;
        }

        const comptes = comptesMapping[item.EC_lib] || [];
        
        return {
          EC_lib: item.EC_lib,
          EC_valN: valN,
          EC_valN1: valN1,
          EC_valVar: valVar,
          "EC_%Var": pctVar,
          EC_comment: comment,
          EC_numCompte: comptes
        };
      }),

      // === Charges de personnel ===
      chargesPersonnel: {
        CP_N: aggN.CP_N || 0,
        CP_N1: aggN1.CP_N || 0,
        CP_Val: (aggN.CP_N || 0) - (aggN1.CP_N || 0),
        "CP_%": aggN1.CP_N
          ? ((aggN.CP_N - aggN1.CP_N) / aggN1.CP_N) * 100
          : null,
        "CP_%caN": aggN.ca
          ? (aggN.CP_N / aggN.ca) * 100
          : null,
        "CP_%caN1": aggN1.ca
          ? (aggN1.CP_N / aggN1.ca) * 100
          : null,
        "CP_%margeN": aggN.marge
          ? (aggN.CP_N / aggN.marge) * 100
          : null,
        "CP_%margeN1": aggN1.marge
          ? (aggN1.CP_N / aggN1.marge) * 100
          : null,
        CP_heureVar: 0,
        "CP_%heureVar": 0,
        CP_coutHorN: 0,
        CP_coutHorN1: 0
      },

      // === Impôt sur les sociétés ===
      impotSociete: {
        IS_tot: aggN.IS_tot || 0,
        IS_credit: aggN.IS_credit || 0,
        IS_montant: (aggN.IS_tot || 0) - (aggN.IS_credit || 0)
      },

      // === Autofinancement ===
      autofinancement: {
        AF_resEx: (aggN.totalProduits || 0) - (aggN.totalCharges || 0),
        AF_dota: aggN.AF_dota || 0,
        AF_reprises: aggN.AF_reprises || 0,
        AF_cessions: aggN.AF_cession || 0,
        AF_subv: aggN.AF_subv || 0,
        AF_capa:
          ((aggN.totalProduits || 0) - (aggN.totalCharges || 0))
          + (aggN.AF_dota || 0)
          - (aggN.AF_reprises || 0)
          + (aggN.AF_cession || 0)
          - (aggN.AF_subv || 0),
        AF_rembours: aggN.AF_rembours || 0,
        AF_divi: aggN.AF_divi || 0,
        AF_capaNet:
          ((aggN.totalProduits || 0) - (aggN.totalCharges || 0))
          + (aggN.AF_dota || 0)
          - (aggN.AF_reprises || 0)
          + (aggN.AF_cession || 0)
          - (aggN.AF_subv || 0)
          - (aggN.AF_rembours || 0)
          - (aggN.AF_divi || 0)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur SQL' });
  }
};

export const GetInfoFiscale = async (req, res) => {
  try {
    const { code_client, dateFinEx } = req.user;
    const infoFiscale = await dbService.GetInfoFiscale(code_client, dateFinEx);
    res.json(infoFiscale);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur SQL' });
  }
};
