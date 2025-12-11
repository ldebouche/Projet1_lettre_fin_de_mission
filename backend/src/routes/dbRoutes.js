import express from 'express';
import { VerifCollaborateur, VerifDossier } from '../controllers/authController.js';
import { GetListeDossiers, GetDossierInfos, GetInfoFiscale, GetMontantCharges } from '../controllers/dbController.js';
import { authMiddlewareCollaborateur, authMiddlewareDossier } from '../middlewares/auth.js';

const router = express.Router();

router.post('/verifCollaborateur', authMiddlewareCollaborateur, VerifCollaborateur);

router.get('/getListeDossiers', authMiddlewareCollaborateur, GetListeDossiers);

router.post('/verifDossier', authMiddlewareCollaborateur, VerifDossier);

router.get('/getDossierInfos', authMiddlewareDossier, GetDossierInfos);

router.get('/getInfoFiscale', authMiddlewareDossier, GetInfoFiscale);

router.get('/getMontantCharges', authMiddlewareDossier, GetMontantCharges);

export default router;
