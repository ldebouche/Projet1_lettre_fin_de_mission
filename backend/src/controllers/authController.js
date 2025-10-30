import dbService from '../services/dbService.js';
import { generateToken } from '../utils/jwt.js';

export const login = async (req, res) => {
  try {
    const { code_client, dateFinEx, dateDebutEx } = req.body;

    const dossier = await dbService.GetDossier(code_client, dateFinEx);
    if (!dossier) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }

    const token = generateToken({ code_client, dateFinEx, dateDebutEx });

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
