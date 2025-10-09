import express from "express";
import { getCumuls, getComments, getImmob, getAnaSectorielle, getBilanSocial } from "../controllers/pdfController.js";

const router = express.Router();

router.get("/cumuls", getCumuls);

router.get("/comments", getComments);

router.get("/immob", getImmob);

router.get("/analyse-sectorielle", getAnaSectorielle);

router.get("/bilan-social", getBilanSocial);

export default router;
