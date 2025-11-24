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

export const portal_login = async (req, res) => {
  try {
    const { code } = req.body;

    const collaborateur = await dbService.GetCollaborateur(code);
    if (!collaborateur) {
      return res.status(404).json({ error: 'Collaborateur introuvable' });
    }

    const token = generateToken({ code });

    res.cookie("jwt", token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 1000 * 4
    });

    res.json({ collaborateur });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export function logout(req, res) {
  res.clearCookie("jwt");
  res.json({ message: "Déconnecté" });
}
