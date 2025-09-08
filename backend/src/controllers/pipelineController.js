import { callOllama, callMistral, fillTemplate, prompts } from '../services/aiService.js';

export const analysePipeline = async (req, res) => {
  try {
    const { secteur, periode, donneesInternes } = req.body;

    // Étape A : Cloud
    const promptCloud = fillTemplate(prompts.pipelineCloud, {
      secteur,
      periode: `${periode.from}-${periode.to}`
    });

    let statsPubliques = {};
    try {
      const rawCloud = await callMistral(promptCloud);
      statsPubliques = JSON.parse(rawCloud.replace(/```json|```/g, '').trim());
    } catch {
      statsPubliques = { note: "Stats publiques indisponibles" };
    }

    // Étape B : Local
    const promptLocal = fillTemplate(prompts.pipelineLocal, {
      secteur,
      periode: `${periode.from}-${periode.to}`,
      ca: donneesInternes.ca,
      marge: donneesInternes.marge,
      revenu_moyen: statsPubliques.revenu_moyen,
      marge_moyenne: statsPubliques.marge_moyenne
    });

    const resultatLocal = await callOllama(promptLocal);

    res.json({ text: resultatLocal });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Pipeline en échec" });
  }
};
