import express from 'express';
import { generateComment } from '../controllers/commentController.js';
import { analysePipeline } from '../controllers/pipelineController.js';

const router = express.Router();

router.post('/generate-comment', generateComment);
router.post('/pipeline/analyse', analysePipeline);

export default router;
