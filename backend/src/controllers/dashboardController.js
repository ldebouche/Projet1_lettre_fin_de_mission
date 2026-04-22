import path from 'path';
import { getHistorique, verifHistorique } from '../services/dashboardService.js';

export const getDossierHistorique = async (req, res) => {
    const { code_client } = req.query;

    const basePath = 'C:\\outils-avenia'; 

    const clientPath = path.join(basePath, code_client, 'LFM');

    try {
        const clientFiles = await getHistorique(clientPath);
        console.log(clientFiles);

        res.status(200).json({ clientFiles});

    } catch (error) {
        console.error(`Erreur lors de la récupération de l'historique pour ${clientPath}/:`, error);
        res.status(500).json({ message: "Erreur du serveur lors de la récupération de l'historique." });
    }
};

export const checkHistorique = async (req, res) => {
    const { code_client, millesime } = req.query;

    const basePath = 'C:\\outils-avenia'; 

    const clientPath = path.join(basePath, code_client, 'LFM');

    try {
        const result = await verifHistorique(clientPath, millesime);
        res.status(200).json(result);
    } catch (error) {
        console.error(`Erreur lors de la récuperation de l'historique pour ${clientPath}/:`, error);
        res.status(500).json({ message: "Erreur du serveur lors de la récuperation de l'historique." });
    }
};