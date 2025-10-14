import express from "express";
import { getCumuls, getComments, getImmob, getAnaSectorielle } from "../controllers/pdfController.js";

const router = express.Router();

router.get("/cumuls", getCumuls);

router.get("/comments", getComments);

router.get("/immob", getImmob);

router.get("/analyse-sectorielle", getAnaSectorielle);

export default router;
