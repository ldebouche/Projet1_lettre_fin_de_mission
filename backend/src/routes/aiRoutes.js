import express from 'express';
import { generateComment } from '../controllers/commentController.js';

const router = express.Router();

router.post('/generate-comment', generateComment);

export default router;
