import express from 'express';
import { VerifCollaborateur, VerifDossier } from '../controllers/authController.js';
import { GetListeDossiers, GetDossierInfos, GetInfoFiscale, GetMontantCharges } from '../controllers/dbController.js';
import { authMiddlewareCollaborateur, authMiddlewareDossier } from '../middlewares/auth.js';
import { authDemo } from '../middlewares/authDemo.js';

const router = express.Router();

router.post('/verifCollaborateur', authDemo, VerifCollaborateur);

router.get('/getListeDossiers', authDemo, GetListeDossiers);

router.post('/verifDossier', authDemo, VerifDossier);

router.get('/getDossierInfos', authMiddlewareDossier, GetDossierInfos);

router.get('/getInfoFiscale', authMiddlewareDossier, GetInfoFiscale);

router.get('/getMontantCharges', authMiddlewareDossier, GetMontantCharges);

export default router;
