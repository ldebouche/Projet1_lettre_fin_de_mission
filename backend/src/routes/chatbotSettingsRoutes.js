import express from 'express';
import multer from 'multer';
import { getTreeController, deleteItem, createFolder, addFile, createProcedureFromFiles, createProcedureFromUrl, getProcedure, accepterProcedureController, rejeterProcedureController, getCompteurFichiersController, getProcedureText, updateProcedureText, uploadProcedureImageController, editFromChatbotController, moveIndexerToAttente } from '../controllers/chatbotSettingsController.js';
import { authMiddlewareCollaborateur } from '../middlewares/auth.js';
import { get } from 'http';
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/tree', getTreeController);

router.post('/deleteItem', deleteItem);

router.post('/createFolder', createFolder);

router.post('/addFile', upload.array('files', 1000), addFile);

router.post('/createProcedureFromFiles', authMiddlewareCollaborateur, upload.array('files', 1000), createProcedureFromFiles);

router.post('/createProcedureFromUrl', authMiddlewareCollaborateur, createProcedureFromUrl);

router.get('/getProcedures', getProcedure);

router.post('/accepterProcedure', accepterProcedureController);

router.post('/rejeterProcedure', rejeterProcedureController);

router.get('/compteurFichiers', getCompteurFichiersController);

router.get('/getProcedureText', getProcedureText);

router.post('/updateProcedureText', updateProcedureText);

router.post("/upload-procedure-image", upload.single("file"), uploadProcedureImageController);

router.post("/edit-from-chatbot", editFromChatbotController);

router.post("/indexer-to-attente", moveIndexerToAttente);

export default router;