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

    const anneeN1 = await dbService.VerifAnneeN1Existe(code_client, dateFinEx);
    const resEx = await dbService.GetResEx(code_client, dateFinEx);
    const getFormeSociete = await dbService.GetFormeSociete(code_client);
    const signataire= await dbService.GetSignataire(code_client);
    
    res.json({
      anneeN1Existe: !!anneeN1?.anneeN1,
      resEx: resEx ? resEx.totalProduit - resEx.totalCharges : null,
      ei: getFormeSociete.ei,
      signataire
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
