import dbService from '../services/dbService.js';

export const VerifDossier = async (req, res) => {
  try {
    const dossier = await dbService.GetDossier(req.params.code_client, req.params.dateFinEx);

    if (!dossier) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }

    res.json(dossier);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur SQL' });
  }
};
