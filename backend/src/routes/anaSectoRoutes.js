import express from 'express';
import multer from 'multer';
import { getTreeController, deleteItem, createFolder, addFile, createAnaSectoFromFiles, getAnaSecto, updateAnaSecto, accepterAnaSecto, rejeterAnaSecto, getCompteurFichiersController, getProcedureText, updateProcedureText, uploadProcedureImageController, editFromTree } from '../controllers/anaSectoController.js';
import { authMiddlewareCollaborateur } from '../middlewares/auth.js';

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024,
    },
});

router.get('/tree', getTreeController);

router.post('/deleteItem', deleteItem);

router.post('/createFolder', createFolder);

router.post('/addFile', upload.array('files', 1000), addFile);

router.post('/createAnaSectoFromFiles', authMiddlewareCollaborateur, upload.array('files', 1000), createAnaSectoFromFiles);

router.get('/getAnaSecto', getAnaSecto);

router.post('/updateAnaSecto', updateAnaSecto);

router.post('/accepterAnaSecto', accepterAnaSecto);

router.post('/rejeterAnaSecto', rejeterAnaSecto);

router.get('/compteurFichiers', getCompteurFichiersController);

router.get('/getProcedureText', getProcedureText);

router.post('/updateProcedureText', updateProcedureText);

router.post("/upload-procedure-image", upload.single("file"), uploadProcedureImageController);

router.post("/edit-from-tree", editFromTree);

export default router;