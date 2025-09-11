import express from "express";
import { generateWordFile } from "../controllers/wordController.js";

const router = express.Router();

router.post("/generate", generateWordFile);

export default router;
