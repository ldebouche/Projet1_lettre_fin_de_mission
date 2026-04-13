import {
  getDossiersRisque as labGetDossiersRisque,
  getResumeLab as labGetResumeLab,
} from '../services/labService.js';

/** POST + JSON : évite une query string énorme (431) quand il y a beaucoup de codes. */
export async function postDossiersRisque(req, res) {
  try {
    const codesClients = req.body?.codes;
    if (codesClients.length === 0) {
      return res.status(400).json({ error: 'Body codes requis (tableau non vide)' });
    }

    const map = await labGetDossiersRisque(codesClients);
    return res.json({ data: Object.fromEntries(map) });
  } catch (err) {
    console.error('Erreur postDossiersRisque:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function getResumeLab(req, res) {
  try {
    const code_client = req.query.code_client;
    if (code_client === undefined || code_client === null || String(code_client).trim() === '') {
      return res.status(400).json({ error: 'Paramètre code_client requis' });
    }

    const data = await labGetResumeLab(code_client);
    return res.json({ data });
  } catch (err) {
    console.error('Erreur getResumeLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

