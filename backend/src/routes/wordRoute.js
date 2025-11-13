import express from "express";
import { generatedocuments } from "../controllers/wordController.js";

const router = express.Router();

router.post("/generateWord", generatedocuments);

export default router;
