import express from 'express';
import multer from 'multer';
import { authMiddlewareCollaborateur } from '../middlewares/auth.js';
import {
  postDossiersRisque,
  getResumeLab,
  getDossierLab,
  postDossierLab,
  putDossierLab,
  putClientLab,
  putKycLab,
  postBeneficiaireLab,
  putBeneficiaireLab,
  deleteBeneficiaireLabHandler,
  postPieceLab,
  postPieceUploadLab,
  putPieceLab,
  deletePieceLabHandler,
  getArpecQuestionnaire,
  getArpecEvaluation,
  postArpecEvaluation,
  postPlanVigilanceGenerer,
  getDashboardLab,
  getDossiersLab,
  getEvenementsLab,
  getDiligencesLab,
  postEvenementLab,
  putEvenementLab,
  cloturerEvenementLabHandler,
  postDiligenceLab,
  putDiligenceLab,
  getRevuesLab,
  postRevueLab,
  cloturerRevueLabHandler,
  annulerRevueLabHandler,
  getTransactionsLab,
  getTracfinLab,
  getParametrageLab,
  getEnrichissementLab,
} from '../controllers/labController.js';

const router = express.Router();

const pieceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post('/dossiers-risque', authMiddlewareCollaborateur, postDossiersRisque);
router.get('/dashboard', authMiddlewareCollaborateur, getDashboardLab);
router.get('/dossiers', authMiddlewareCollaborateur, getDossiersLab);
router.get('/resume', authMiddlewareCollaborateur, getResumeLab);
router.get('/dossier', authMiddlewareCollaborateur, getDossierLab);
router.post('/dossier', authMiddlewareCollaborateur, postDossierLab);
router.put('/dossier', authMiddlewareCollaborateur, putDossierLab);
router.put('/client', authMiddlewareCollaborateur, putClientLab);
router.put('/kyc', authMiddlewareCollaborateur, putKycLab);
router.post('/beneficiaires', authMiddlewareCollaborateur, postBeneficiaireLab);
router.put('/beneficiaires', authMiddlewareCollaborateur, putBeneficiaireLab);
router.delete('/beneficiaires', authMiddlewareCollaborateur, deleteBeneficiaireLabHandler);
router.post('/pieces/upload', authMiddlewareCollaborateur, pieceUpload.single('file'), postPieceUploadLab);
router.post('/pieces', authMiddlewareCollaborateur, postPieceLab);
router.put('/pieces', authMiddlewareCollaborateur, putPieceLab);
router.delete('/pieces', authMiddlewareCollaborateur, deletePieceLabHandler);
router.get('/arpec/questionnaire', authMiddlewareCollaborateur, getArpecQuestionnaire);
router.get('/arpec/evaluation', authMiddlewareCollaborateur, getArpecEvaluation);
router.post('/arpec/evaluation', authMiddlewareCollaborateur, postArpecEvaluation);
router.post('/plan-vigilance/generer', authMiddlewareCollaborateur, postPlanVigilanceGenerer);
router.get('/evenements', authMiddlewareCollaborateur, getEvenementsLab);
router.post('/evenements/cloturer', authMiddlewareCollaborateur, cloturerEvenementLabHandler);
router.post('/evenements', authMiddlewareCollaborateur, postEvenementLab);
router.put('/evenements', authMiddlewareCollaborateur, putEvenementLab);
router.get('/diligences', authMiddlewareCollaborateur, getDiligencesLab);
router.post('/diligences', authMiddlewareCollaborateur, postDiligenceLab);
router.put('/diligences', authMiddlewareCollaborateur, putDiligenceLab);
router.put('/revues/cloturer', authMiddlewareCollaborateur, cloturerRevueLabHandler);
router.post('/revues/annuler', authMiddlewareCollaborateur, annulerRevueLabHandler);
router.get('/revues', authMiddlewareCollaborateur, getRevuesLab);
router.post('/revues', authMiddlewareCollaborateur, postRevueLab);
router.get('/transactions', authMiddlewareCollaborateur, getTransactionsLab);
router.get('/tracfin', authMiddlewareCollaborateur, getTracfinLab);
router.get('/parametrage', authMiddlewareCollaborateur, getParametrageLab);
router.get('/enrichissement', authMiddlewareCollaborateur, getEnrichissementLab);

export default router;

