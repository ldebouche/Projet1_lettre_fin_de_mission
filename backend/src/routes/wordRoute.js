import express from "express";
import { generatedocuments, jobStatus } from "../controllers/wordController.js";

const router = express.Router();

router.post("/generateWord", generatedocuments);

router.get("/job-status", jobStatus);

export default router;
