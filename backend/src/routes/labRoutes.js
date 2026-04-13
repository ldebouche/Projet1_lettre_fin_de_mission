import express from 'express';
import { authMiddlewareCollaborateur } from '../middlewares/auth.js';
import {
  postDossiersRisque,
  getResumeLab,
} from '../controllers/labController.js';

const router = express.Router();

router.post('/dossiers-risque', authMiddlewareCollaborateur, postDossiersRisque);
router.get('/resume', authMiddlewareCollaborateur, getResumeLab);

export default router;

