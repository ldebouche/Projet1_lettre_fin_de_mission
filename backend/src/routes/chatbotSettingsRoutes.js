import express from 'express';
import multer from 'multer';
import { getTreeController, deleteItem, createFolder, addFile, createProcedureFromFiles, createProcedureFromUrl, getProcedure, accepterProcedureController, getCompteurFichiersController } from '../controllers/chatbotSettingsController.js';
import { authMiddlewareCollaborateur } from '../middlewares/auth.js';
import { get } from 'http';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/tree', getTreeController);

router.post('/deleteItem', deleteItem);

router.post('/createFolder', createFolder);

router.post('/addFile', upload.array('files', 100), addFile);

router.post('/createProcedureFromFiles', authMiddlewareCollaborateur, upload.array('files', 100), createProcedureFromFiles);

router.post('/createProcedureFromUrl', authMiddlewareCollaborateur, createProcedureFromUrl);

router.get('/getProcedures', getProcedure);

router.post('/accepterProcedure', accepterProcedureController);

router.get('/compteurFichiers', getCompteurFichiersController);

export default router;