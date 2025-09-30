import express from 'express';
import { login } from '../controllers/authController.js';
import { GetDossierInfos, GetInfoFiscale } from '../controllers/dbController.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = express.Router();

router.post('/verifDossier', login);


router.get('/getDossierInfos', authMiddleware, GetDossierInfos);

router.get('/getInfoFiscale', authMiddleware, GetInfoFiscale);

export default router;
