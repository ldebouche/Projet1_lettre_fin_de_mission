import dbService from '../services/dbService.js';
import { generateToken } from '../utils/jwt.js';

export const VerifCollaborateur = async (req, res) => {
  try {
    const email = "prondot@lacomptabilite.fr" /*req.user.unique_name;*/

    const collaborateur = await dbService.GetCollaborateur(email);
    if (!collaborateur) {
      return res.status(404).json({ error: 'Collaborateur introuvable' });
    }

    res.json({ collaborateur });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const VerifDossier = async (req, res) => {
  try {
    const { code_client, dateFinEx, dateDebutEx } = req.body;
    
    const { dossier, client } = await dbService.GetDossier(code_client, dateFinEx);
    if (!dossier) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }

    const token = generateToken({ code_client, dateFinEx, dateDebutEx });
    console.log('Dossier trouvé :', client);
    res.cookie("jwt_dossier", token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 1000 * 4
    });

    res.json({ client });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
