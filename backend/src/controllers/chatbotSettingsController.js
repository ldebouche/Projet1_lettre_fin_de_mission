import { getFileTree, deleteItemFromIndexedItems, createFolderToIndexedItems, addFileToIndexedItems } from '../services/chatbotSettingsService.js';

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
        const files = req.files;
        const targetFolder = req.body.targetFolder;
        await addFileToIndexedItems(files, targetFolder);
        res.status(200).send({ message: "Fichier ajouté avec succès." });
    } catch (error) {
        console.error("Erreur lors de l'ajout du fichier :", error);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
};