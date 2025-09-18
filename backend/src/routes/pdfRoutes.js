import express from "express";
import { getCumuls } from "../controllers/pdfController.js";

const router = express.Router();

router.get("/cumuls", getCumuls);

export default router;
