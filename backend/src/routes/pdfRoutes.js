import express from "express";
import { getCumuls, getComments } from "../controllers/pdfController.js";

const router = express.Router();

router.get("/cumuls", getCumuls);

router.get("/comments", getComments);

export default router;
