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
    const infoFec = await dbService.GetInfoFEC(code_client, dateFinEx);
    const signataire= await dbService.GetSignataire(code_client);
    
    res.json({
      anneeN1Existe: !!infoFec?.anneeN1,
      resEx: infoFec ? infoFec.totalProduit - infoFec.totalCharges : null,
      forme_societe: infoClients.forme_societe,
      categorie_revenu: infoClients.categorie_revenu,
      signataire,
      capitalSocial: infoFec.capitalSocial,
      montantReserveLegale: infoFec.montantReserveLegale,
      montantReserveOrdinaire: infoFec.montantReserveOrdinaire,
      montantReportNouveau: infoFec.montantReportNouveau,
      montantDividendesN1: infoFec.montantDividendesN1
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur SQL' });
  }
};

export const GetInfoFiscale = async (req, res) => {
  try {
    const { code_client } = req.user;

    const infoFiscale = await dbService.GetInfoFiscale(code_client);

    res.json(infoFiscale);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur SQL' });
  }
};
