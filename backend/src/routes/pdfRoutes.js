import express from "express";
import { getCumuls, getComments, getImmob, getAnaSectorielle, getPointsImportants } from "../controllers/pdfController.js";

const router = express.Router();

router.get("/cumuls", getCumuls);

router.get("/comments", getComments);

router.get("/points-importants", getPointsImportants);

router.get("/immob", getImmob);

router.get("/analyse-sectorielle", getAnaSectorielle);

export default router;
