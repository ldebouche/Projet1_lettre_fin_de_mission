import express from "express";
import { getCumuls, getComments, getImmob } from "../controllers/pdfController.js";

const router = express.Router();

router.get("/cumuls", getCumuls);

router.get("/comments", getComments);

router.get("/immob", getImmob);

export default router;
