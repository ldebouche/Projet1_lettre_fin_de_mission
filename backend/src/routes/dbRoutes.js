import express from 'express';
import { VerifDossier } from '../controllers/dbController.js';

const router = express.Router();

router.get('/verifDossier/:code_client/:dateFinEx', VerifDossier);

export default router;
