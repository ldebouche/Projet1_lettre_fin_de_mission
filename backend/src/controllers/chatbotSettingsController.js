import { getFileTree, deleteItemFromIndexedItems, createFolderToIndexedItems, addFileToIndexedItems, creerPdfDepuisFichierPdfBuffer, creerPdfDepuisUrl, getProced, accepterProcedure, getCompteurFichiers } from '../services/chatbotSettingsService.js';

export const getTreeController = async (req, res) => {
    try {
        const tree = await getFileTree();
        res.status(200).json(tree);
    } catch (error) {
        console.error("Erreur lors de la récupération de l'arborescence :", error);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
};

export const deleteItem = async (req, res) => {
    try {
        const { item, indexedItems } = req.body;
        await deleteItemFromIndexedItems(item, indexedItems);
        res.status(200).send({ message: "Élément supprimé avec succès." });
    } catch (error) {
        console.error("Erreur lors de la suppression de l'item :", error);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
};

export const createFolder = async (req, res) => {
    try {
        const { folderName, parentId, indexedItems } = req.body;
        await createFolderToIndexedItems(folderName, parentId, indexedItems);
        res.status(200).send({ message: "Dossier créé avec succès." });
    } catch (error) {
        console.error("Erreur lors de la création du dossier :", error);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
};

export const addFile = async (req, res) => {
    try {
        const items = req.body.items;

        await addFileToIndexedItems(items);
        res.status(200).send({ message: "Fichier ajouté avec succès." });
    } catch (error) {
        console.error("Erreur lors de l'ajout du fichier :", error);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
};

export const createProcedureFromFiles = async (req, res) => {
    try {
        const utilisateur = req.user;
        const files = req.files || [];

        if (!files.length) {
            return res.status(400).json({ succes: false, message: 'Aucun fichier reçu.' });
        }

        const results = [];
        for (const f of files) {
            if (!f.originalname.toLowerCase().endsWith('.pdf')) continue;

            const nomProcedure = f.originalname.replace(/\.pdf$/i, "");
            const r = await creerPdfDepuisFichierPdfBuffer(f.buffer, f.originalname, utilisateur, nomProcedure);
            results.push(r);
        }

        res.json({ succes: true, results });
    } catch (e) {
        console.error(e);
        res.status(500).json({ succes: false, message: 'Erreur lors de la création des procédures depuis fichiers.' });
    }
};

export const createProcedureFromUrl = async (req, res) => {
    try {
        const { procedureName, externalLink } = req.body;
        const utilisateur = req.user;

        await creerPdfDepuisUrl(externalLink, utilisateur, procedureName);

        res.json({
            succes: true,
            message: 'La procédure PDF a été créée avec succès.'
        });
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({
            succes: false,
            message: 'Erreur lors de la création du PDF.'
        });
    }
};

export const getProcedure = async (req, res) => {
    try {
        const { folderName } = req.query;

        const procedures = await getProced(folderName);
        res.json({ procedures });
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({
            succes: false,
            message: 'Erreur lors de la récupération des procédures.'
        });
    }
};

export const accepterProcedureController = async (req, res) => {
    try {
        const { procedureName } = req.body;
        await accepterProcedure(procedureName);

        res.status(200).send({ message: "La procédure a été acceptée avec succès." });
    } catch (error) {
        console.error("Erreur lors de l'acceptation de la procédure :", error);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
};

export const getCompteurFichiersController = async (req, res) => {
    try {
        const compteur = await getCompteurFichiers();
        res.json({ compteur });
    } catch (error) {
        console.error("Erreur lors de la récupération du compteur de fichiers :", error);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
};