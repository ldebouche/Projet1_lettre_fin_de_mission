import express from 'express';
import { authMiddlewareCollaborateur } from '../middlewares/auth.js';
import {
  GetDossiers,
  GetDossier,
  CreateDossier,
  UpdateDossier,
  GetKyc,
  UpdateKyc,
  GetBeneficiaires,
  CreateBeneficiaire,
  UpdateBeneficiaire,
  DeleteBeneficiaire,
  GetScores,
  CreateScore,
  GetEvenements,
  GetEvenementsByClient,
  CreateEvenement,
  UpdateEvenement,
  CloturerEvenement,
  GetDiligences,
  GetDiligencesByEvenement,
  CreateDiligence,
  UpdateDiligence,
  GetPieces,
  CreatePiece,
  UpdatePiece,
  GetRevues,
  CreateRevue,
  CloturerRevue,
  GetTransactions,
  CreateTransaction,
  GetTracfin,
  CreateTracfin,
  GetDashboard,
  GetParametrage,
  UpdateParametrage,
  GetAuditLog,
} from '../controllers/labController.js';

const router = express.Router();

router.get('/dossiers', authMiddlewareCollaborateur, GetDossiers);
router.get('/dossier/:code_client', authMiddlewareCollaborateur, GetDossier);
router.post('/dossier', authMiddlewareCollaborateur, CreateDossier);
router.put('/dossier/:code_client', authMiddlewareCollaborateur, UpdateDossier);

router.get('/kyc/:code_client', authMiddlewareCollaborateur, GetKyc);
router.put('/kyc/:code_client', authMiddlewareCollaborateur, UpdateKyc);

router.get('/beneficiaires/:code_client', authMiddlewareCollaborateur, GetBeneficiaires);
router.post('/beneficiaires', authMiddlewareCollaborateur, CreateBeneficiaire);
router.put('/beneficiaires/:id', authMiddlewareCollaborateur, UpdateBeneficiaire);
router.delete('/beneficiaires/:id', authMiddlewareCollaborateur, DeleteBeneficiaire);

router.get('/scores/:code_client', authMiddlewareCollaborateur, GetScores);
router.post('/scores', authMiddlewareCollaborateur, CreateScore);

router.get('/evenements', authMiddlewareCollaborateur, GetEvenements);
router.get('/evenements/:code_client', authMiddlewareCollaborateur, GetEvenementsByClient);
router.post('/evenements', authMiddlewareCollaborateur, CreateEvenement);
router.put('/evenements/:id', authMiddlewareCollaborateur, UpdateEvenement);
router.post('/evenements/:id/cloturer', authMiddlewareCollaborateur, CloturerEvenement);

router.get('/diligences', authMiddlewareCollaborateur, GetDiligences);
router.get('/diligences/:id_evenement', authMiddlewareCollaborateur, GetDiligencesByEvenement);
router.post('/diligences', authMiddlewareCollaborateur, CreateDiligence);
router.put('/diligences/:id', authMiddlewareCollaborateur, UpdateDiligence);

router.get('/pieces/:code_client', authMiddlewareCollaborateur, GetPieces);
router.post('/pieces', authMiddlewareCollaborateur, CreatePiece);
router.put('/pieces/:id', authMiddlewareCollaborateur, UpdatePiece);

router.get('/revues/:code_client', authMiddlewareCollaborateur, GetRevues);
router.post('/revues', authMiddlewareCollaborateur, CreateRevue);
router.put('/revues/:id/cloturer', authMiddlewareCollaborateur, CloturerRevue);

router.get('/transactions/:code_client', authMiddlewareCollaborateur, GetTransactions);
router.post('/transactions', authMiddlewareCollaborateur, CreateTransaction);

router.get('/tracfin', authMiddlewareCollaborateur, GetTracfin);
router.post('/tracfin', authMiddlewareCollaborateur, CreateTracfin);

router.get('/dashboard', authMiddlewareCollaborateur, GetDashboard);

router.get('/parametrage', authMiddlewareCollaborateur, GetParametrage);
router.put('/parametrage', authMiddlewareCollaborateur, UpdateParametrage);

router.get('/audit/:code_client', authMiddlewareCollaborateur, GetAuditLog);

export default router;

