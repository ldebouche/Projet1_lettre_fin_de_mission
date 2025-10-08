import express from "express";
import { generateWord } from "../controllers/wordController.js";

const router = express.Router();

router.post("/generateWord", generateWord);

export default router;
