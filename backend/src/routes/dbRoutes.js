import express from 'express';
import { portal_login, login } from '../controllers/authController.js';
import { GetListeCollaborateurs, GetListeDossiers, GetDossierInfos, GetInfoFiscale, GetMontantCharges } from '../controllers/dbController.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = express.Router();

router.get('/getListeCollaborateurs', GetListeCollaborateurs);

router.post('/verifCollaborateur', portal_login);

router.get('/getListeDossiers', authMiddleware, GetListeDossiers);

router.post('/verifDossier', login);

router.get('/getDossierInfos', authMiddleware, GetDossierInfos);

router.get('/getInfoFiscale', authMiddleware, GetInfoFiscale);

router.get('/getMontantCharges', authMiddleware, GetMontantCharges);

export default router;
