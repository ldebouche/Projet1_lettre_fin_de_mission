import { Router } from 'express';
import { getDossierHistorique, checkHistorique } from '../controllers/dashboardController.js';

const router = Router();

router.get('/historique', getDossierHistorique);

router.get('/check-historique', checkHistorique);

export default router;
