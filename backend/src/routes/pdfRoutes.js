import express from "express";
import multer from "multer";
import { getCumuls, getComments, getImmob, getAnaSectorielle, getPointsImportants, getEmprunts, getEcheancier } from "../controllers/pdfController.js";

const upload = multer({ dest: 'uploads/' });

const router = express.Router();

router.get("/cumuls", getCumuls);

router.get("/comments", getComments);

router.get("/points-importants", getPointsImportants);

router.get("/immob", getImmob);

router.get("/analyse-sectorielle", getAnaSectorielle);

router.get("/emprunts", getEmprunts);

router.post("/echeancier", upload.single('file'), getEcheancier);

export default router;
