import { getAnaSectoriellesTree, deleteAnaSectoItem, createFolderToIndexedItems, addFileToIndexedItems, creerAnaSecto, getAna, enregistrerModifs, accepterAnaSectorielle, rejeterAnaSectorielle, getCompteurFichiers, remettreAnaSectorielleEnAttente } from '../services/anaSectoService.js';

export const getTreeController = async (req, res) => {
    try {
        const tree = await getAnaSectoriellesTree();
        console.log(JSON.stringify(tree, null, 2));  
        res.status(200).json(tree);
    } catch (error) {
        console.error("Erreur lors de la récupération de l'arborescence :", error);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
};

export const deleteItem = async (req, res) => {
    try {
        const { item } = req.body;
        await deleteAnaSectoItem(item);
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

export const createAnaSectoFromFiles = async (req, res) => {
    try {
        const utilisateur = req.user;
        const files = req.files || [];

        if (!files.length) {
            return res.status(400).json({ succes: false, message: "Aucun fichier reçu." });
        }

        const allowed = [".pdf"];
        const results = [];

        for (const f of files) {
            const ext = (f.originalname || "").toLowerCase().slice(((f.originalname || "").lastIndexOf(".")) >>> 0);
            if (!allowed.includes(ext)) continue;

            f.originalname = Buffer.from(String(f.originalname), "latin1").toString("utf8");

            const baseName = f.originalname.replace(/\.[^.]+$/i, "");

            const r = await creerAnaSecto(
                f.buffer,
                `${baseName}.pdf`,
                utilisateur,
                baseName
            );
            results.push(r);
        }

        res.json({ succes: true, results });
    } catch (e) {
        console.error(e);
        res.status(500).json({ succes: false, message: "Erreur lors de la création des procédures." });
    }
};

export const getAnaSecto = async (req, res) => {
    try {
        const { folderName } = req.query;

        const fichiers = await getAna(folderName);
        res.json({ fichiers });
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({
            succes: false,
            message: 'Erreur lors de la récupération des procédures.'
        });
    }
};

export const updateAnaSecto = async (req, res) => {
    try {
        const { anaSectoMeta } = req.body;
        await enregistrerModifs(anaSectoMeta);
        res.status(200).send({ message: "AnaSecto mis à jour avec succès." });
    } catch (error) {
        console.error("Erreur lors de la mise en edition de la procédure :", error);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
};

export const accepterAnaSecto = async (req, res) => {
    try {
        const { anaSectoMeta } = req.body;
        await accepterAnaSectorielle(anaSectoMeta);

        res.status(200).send({ message: "AnaSecto a été acceptée avec succès." });
    } catch (error) {
        console.error("Erreur lors de l'acceptation de la procédure :", error);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
};

export const rejeterAnaSecto = async (req, res) => {
    try {
        const { nomFichier, code_ape } = req.body;
        await rejeterAnaSectorielle(nomFichier, code_ape);

        res.status(200).send({ message: "AnaSecto a été rejetée avec succès." });
    } catch (error) {
        console.error("Erreur lors de la refus de la procédure :", error);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
};

export const getCompteurFichiersController = async (req, res) => {
    try {
        const compteur = await getCompteurFichiers();
        res.json(compteur);
    } catch (error) {
        console.error("Erreur lors de la récupération du compteur de fichiers :", error);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
};

export const getProcedureText = async (req, res) => {
    try {
        const { folderName, procedureName } = req.query;
        const { nom, urlSource, procedureHtml, procedure } = await getProcedureEditable(folderName, procedureName);
        res.json({ nom, urlSource, procedureHtml, procedure });
    } catch (error) {
        console.error("Erreur lors de la récupération du texte de la procédure :", error);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
}

export const updateProcedureText = async (req, res) => {
    try {
        const { folderName, procedureName, text } = req.body;
        const procedureHtml = await updateProcedureFromEdit(folderName, procedureName, text);
        res.json({ procedureHtml });
    } catch (error) {
        console.error("Erreur lors de la mise à jour du texte de la procédure :", error);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
}

export const uploadProcedureImageController = async (req, res) => {
    try {
        const { folderName, procedureName } = req.body;
        const file = req.file;

        if (!folderName || !procedureName) return res.status(400).json({ message: "Paramètres manquants." });
        if (!file) return res.status(400).json({ message: "Aucun fichier reçu." });

        const out = await uploadProcedureImage(folderName, procedureName, file);
        res.json(out);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Erreur upload image." });
    }
};

export const editFromTree = async (req, res) => {
    try {
        const { item } = req.body;
        const out = await remettreAnaSectorielleEnAttente(item);
        res.json(out);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Erreur lors du passage en édition." });
    }
};