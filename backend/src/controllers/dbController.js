import { info } from 'console';
import dbService from '../services/dbService.js';

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

    const infoClients = await dbService.GetInfoClients(code_client, dateFinEx);
    const infoFec = await dbService.GetInfoFECForm(code_client, dateFinEx);
    const signataire= await dbService.GetSignataire(code_client, dateFinEx);
    const infoChiffresCles = await dbService.GetInfoChiffresCles(code_client, dateFinEx);
    const infoChargesPersonnel = await dbService.GetInfoChargesPersonnel(code_client, dateFinEx);
    const infoImpotSociete = await dbService.GetInfoImpotSociete(code_client, dateFinEx);
    const infoAutofinancement = await dbService.GetInfoAutofinancement(code_client, dateFinEx);
    const infoEvoCharges = await dbService.GetInfoEvoCharges(code_client, dateFinEx);

    res.json({
      anneeN1Existe: !!infoFec?.anneeN1,
      I_classe2: infoFec.I_classe2,
      MD_salaries: infoFec.MD_salaries,
      imposable: infoClients.imposable,
      mois_cloture: infoClients.mois_cloture,
      resEx: infoFec.totalProduit - infoFec.totalCharges,
      forme_societe: infoClients.forme_societe,
      tabAutofinancement: infoClients.tabAutofinancement,
      categorie_revenu: infoClients.categorie_revenu,
      acompte_total: infoFec.acompte_total,
      signataire,
      capitalSocial: infoFec.capitalSocial,
      montantReserveLegale: infoFec.montantReserveLegale,
      montantReserveOrdinaire: infoFec.montantReserveOrdinaire,
      montantReportNouveau: infoFec.montantReportNouveau,
      montantDividendesN1: infoFec.montantDividendesN1,
      client: {
        "nomEntreprise": infoClients.nomEntreprise,
        "adresseEntreprise1": infoClients.adresseEntreprise1,
        "adresseEntreprise2": infoClients.adresseEntreprise2,
        "codePostalClient": infoClients.codePostalClient,
        "villeClient": infoClients.villeClient,
        "lieuCreation": infoClients.lieuCreation,
        "dateCreation": new Date().toLocaleDateString('fr-FR'),
        "initialesChefGroupe": infoClients.initialesChefGroupe
      },
      chiffreCles: {
        "dateFinEx": infoChiffresCles.dateFinEx.toLocaleDateString('fr-FR'),
        "CC_caN": infoChiffresCles.caN,
        "CC_caN1": infoChiffresCles.caN1,
        "CC_caVar": infoChiffresCles.caN - infoChiffresCles.caN1, 
        "CC_%caVar": infoChiffresCles.caN - infoChiffresCles.caN1 < 0 ? (-1 + (infoChiffresCles.caN / infoChiffresCles.caN1)) * 100 : (1 - infoChiffresCles.caN / infoChiffresCles.caN1) * 100,
        "CC_margeN": infoChiffresCles.margeN,
        "CC_%margeN": infoChiffresCles.margeN / infoChiffresCles.caN * 100, 
        "CC_margeN1": infoChiffresCles.margeN1, 
        "CC_%margeN1": infoChiffresCles.margeN1 / infoChiffresCles.caN1 * 100, 
        "CC_margeVar": infoChiffresCles.margeN - infoChiffresCles.margeN1, 
        "CC_%margeVar": infoChiffresCles.margeN - infoChiffresCles.margeN1 < 0 ? (-1 + (infoChiffresCles.margeN / infoChiffresCles.margeN1)) * 100 : (1 - infoChiffresCles.margeN / infoChiffresCles.margeN1) * 100,
        "CC_excedN": infoChiffresCles.excedN, 
        "CC_%excedN": infoChiffresCles.excedN / infoChiffresCles.caN * 100, 
        "CC_excedN1": infoChiffresCles.excedN1, 
        "CC_%excedN1": infoChiffresCles.excedN1 / infoChiffresCles.caN1 * 100, 
        "CC_excedVar": infoChiffresCles.excedN - infoChiffresCles.excedN1, 
        "CC_%excedVar": infoChiffresCles.excedN - infoChiffresCles.excedN1 < 0 ? (-1 + (infoChiffresCles.excedN / infoChiffresCles.excedN1)) * 100 : (1 - infoChiffresCles.excedN / infoChiffresCles.excedN1) * 100,
        "CC_resCourantN": infoChiffresCles.resCourantN,
        "CC_%resCourantN": infoChiffresCles.resCourantN / infoChiffresCles.caN * 100, 
        "CC_resCourantN1": infoChiffresCles.resCourantN1, 
        "CC_%resCourantN1": infoChiffresCles.resCourantN1 / infoChiffresCles.caN1 * 100, 
        "CC_resCourantVar": infoChiffresCles.resCourantN - infoChiffresCles.resCourantN1, 
        "CC_%resCourantVar": infoChiffresCles.resCourantN - infoChiffresCles.resCourantN1 < 0 ? (-1 + (infoChiffresCles.resCourantN / infoChiffresCles.resCourantN1)) * 100 : (1 - infoChiffresCles.resCourantN / infoChiffresCles.resCourantN1) * 100,
        "CC_resNetN": infoChiffresCles.resNetN, 
        "CC_%resNetN": infoChiffresCles.resNetN / infoChiffresCles.caN * 100, 
        "CC_resNetN1": infoChiffresCles.resNetN1, 
        "CC_%resNetN1": infoChiffresCles.resNetN1 / infoChiffresCles.caN1 * 100, 
        "CC_resNetVar": infoChiffresCles.resNetN - infoChiffresCles.resNetN1, 
        "CC_%resNetVar": infoChiffresCles.resNetN - infoChiffresCles.resNetN1 < 0 ? (-1 + (infoChiffresCles.resNetN / infoChiffresCles.resNetN1)) * 100 : (1 - infoChiffresCles.resNetN / infoChiffresCles.resNetN1) * 100
      },
      evolutionCharges: infoEvoCharges.map(item => ({
        "EC_compte": item.EC_compte,
        "EC_lib": item.EC_lib,
        "EC_valN": item.EC_valN,
        "EC_valN1": item.EC_valN1,
        "EC_valVar": item.EC_valN - item.EC_valN1,
        "EC_%Var": item.EC_valN1 && item.EC_valN ? ((item.EC_valN - item.EC_valN1) / item.EC_valN1) * 100 : null
      })),
      chargesPersonnel: {
        "CP_N": infoChargesPersonnel.CP_N, 
        "CP_N1": infoChargesPersonnel.CP_N1, 
        "CP_Val": infoChargesPersonnel.CP_N - infoChargesPersonnel.PN_N1, 
        "CP_%": infoChargesPersonnel.CP_N - infoChargesPersonnel.CP_N1 < 0 ? (-1 + (infoChargesPersonnel.CP_N / infoChargesPersonnel.CP_N1)) * 100 : (1 - infoChargesPersonnel.CP_N / infoChargesPersonnel.CP_N1) * 100, 
        "CP_%caN": infoChargesPersonnel.CP_N / infoChiffresCles.caN * 100, 
        "CP_%caN1": infoChargesPersonnel.CP_N1 / infoChiffresCles.caN1 * 100, 
        "CP_%margeN": infoChargesPersonnel.CP_N / infoChiffresCles.margeN * 100, 
        "CP_%margeN1": infoChargesPersonnel.CP_N1 / infoChiffresCles.margeN1 * 100,
        "CP_heureVar": 0,
        "CP_%heureVar": 0,
        "CP_coutHorN": 0,
        "CP_coutHorN1": 0
      },
      impotSociete: {
        "IS_tot": infoImpotSociete.IS_tot, 
        "IS_credit": infoImpotSociete.IS_credit, 
        "IS_montant": 0
      },
      autofinancement: {
        "AF_resEx": infoFec.totalProduit - infoFec.totalCharges,
        "AF_dota": infoAutofinancement.AF_dota,
        "AF_reprises": infoAutofinancement.AF_reprises,
        "AF_cessions": infoAutofinancement.AF_cession,
        "AF_subven": infoAutofinancement.AF_subv,
        "AF_capa": infoFec.totalProduit - infoFec.totalCharges + infoAutofinancement.AF_dota + infoAutofinancement.AF_reprises + infoAutofinancement.AF_cession - infoAutofinancement.AF_subv,
        "AF_rembours": infoAutofinancement.AF_rembours,
        "AF_divi": infoAutofinancement.AF_divi,
        "AF_capaNet": infoFec.totalProduit - infoFec.totalCharges + infoAutofinancement.AF_dota + infoAutofinancement.AF_reprises + infoAutofinancement.AF_cession - infoAutofinancement.AF_subv - infoAutofinancement.AF_rembours - infoAutofinancement.AF_divi
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
