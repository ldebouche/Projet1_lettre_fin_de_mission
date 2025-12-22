import { Router } from 'express';
import { getDossierHistorique } from '../controllers/dashboardController.js';

const router = Router();

router.get('/historique', getDossierHistorique);

export default router;
