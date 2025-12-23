import express from 'express';
import multer from 'multer';
import { getTreeController, deleteItem, createFolder, addFile } from '../controllers/chatbotSettingsController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/tree', getTreeController);

router.post('/deleteItem', deleteItem);

router.post('/createFolder', createFolder);

router.post('/addFile', upload.array('files', 100), addFile);

export default router;