import {
  getDossiersRisque as labGetDossiersRisque,
  getResumeLab as labGetResumeLab,
  getDossierLab as labGetDossierLab,
  createDossierLab as labCreateDossierLab,
  updateDossierLab as labUpdateDossierLab,
  updateClientLab as labUpdateClientLab,
  upsertKycLab as labUpsertKycLab,
  createBeneficiaireLab as labCreateBeneficiaireLab,
  updateBeneficiaireLab as labUpdateBeneficiaireLab,
  deleteBeneficiaireLab as labDeleteBeneficiaireLab,
  resolveBeneficiaireCodeClient as labResolveBeneficiaireCodeClient,
  createPieceKycLab as labCreatePieceKycLab,
  updatePieceKycLab as labUpdatePieceKycLab,
  deletePieceKycLab as labDeletePieceKycLab,
  savePieceKycFileLab as labSavePieceKycFileLab,
  resolvePieceCodeClient as labResolvePieceCodeClient,
  saveArpecEvaluation as labSaveArpecEvaluation,
  getArpecQuestionnaire as labGetArpecQuestionnaire,
  getArpecEvaluation as labGetArpecEvaluation,
  genererPlanVigilanceLab as labGenererPlanVigilanceLab,
  LabDossierError,
  getDashboardLab as labGetDashboardLab,
  getDossiersLab as labGetDossiersLab,
  getEvenementsLab as labGetEvenementsLab,
  getDiligencesLab as labGetDiligencesLab,
  createEvenementLab as labCreateEvenementLab,
  updateEvenementLab as labUpdateEvenementLab,
  cloturerEvenementLab as labCloturerEvenementLab,
  createDiligenceLab as labCreateDiligenceLab,
  updateDiligenceLab as labUpdateDiligenceLab,
  resolveEvenementCodeClient as labResolveEvenementCodeClient,
  resolveDiligenceCodeClient as labResolveDiligenceCodeClient,
  resolveRevueCodeClient as labResolveRevueCodeClient,
  getRevuesLab as labGetRevuesLab,
  createRevueLab as labCreateRevueLab,
  cloturerRevueLab as labCloturerRevueLab,
  annulerRevueLab as labAnnulerRevueLab,
  getTransactionsLab as labGetTransactionsLab,
  getTracfinLab as labGetTracfinLab,
  getParametrageLab as labGetParametrageLab,
  assertDossierInScope as labAssertDossierInScope,
} from '../services/labService.js';
import { getLabEnrichissement } from '../services/lab-enrichment-service.js';
import dbService from '../services/dbService.js';
import { getUserGroupsByOid } from '../services/graphService.js';

/** Groupes Microsoft donnant un accès LAB complet (lecture de tous les dossiers). */
const FULL_ACCESS_GROUPS = new Set(['admin', 'informatique', 'lab']);

/**
 * Résout le périmètre de lecture LAB de l'appelant (RBAC).
 * Même logique de résolution des rôles que authController.VerifCollaborateur.
 *
 * @param {import('express').Request} req
 * @returns {Promise<{ isFull: boolean, idSellsy: string|null }>}
 *   isFull   : accès complet (membre d'un groupe admin / informatique / lab)
 *   idSellsy : id_sellsy du collaborateur (périmètre restreint à ses dossiers), ou null
 */
async function resolveLabScope(req) {
  const email = req.user?.unique_name;
  let idSellsy = null;
  if (email) {
    const collaborateur = await dbService.GetCollaborateur(email);
    const raw = collaborateur?.id_sellsy != null ? String(collaborateur.id_sellsy).trim() : '';
    idSellsy = raw === '' ? null : raw;
  }

  let groupes = [];
  if (process.env.DEMO_AUTH === 'true' && Array.isArray(req.user?.roles)) {
    groupes = req.user.roles;
  } else {
    try {
      groupes = await getUserGroupsByOid(req.user?.oid);
    } catch (err) {
      console.error('resolveLabScope: échec getUserGroupsByOid', err);
      groupes = [];
    }
  }

  const normalized = (Array.isArray(groupes) ? groupes : [])
    .map((g) => (g != null ? String(g).trim().toLowerCase() : ''))
    .filter(Boolean);
  const isFull = normalized.some((g) => FULL_ACCESS_GROUPS.has(g));

  return { isFull, idSellsy };
}

/**
 * Refuse l'accès LAB (403) si l'appelant n'a ni accès complet ni id_sellsy résolu.
 * @returns {boolean} true si la réponse 403 a été envoyée (le handler doit s'arrêter).
 */
function denyIfNoScope(scope, res) {
  if (!scope.isFull && !scope.idSellsy) {
    res.status(403).json({ error: 'Accès LAB non autorisé' });
    return true;
  }
  return false;
}

/** POST + JSON : évite une query string énorme (431) quand il y a beaucoup de codes. */
export async function postDossiersRisque(req, res) {
  try {
    const codesClients = req.body?.codes;
    if (codesClients.length === 0) {
      return res.status(400).json({ error: 'Body codes requis (tableau non vide)' });
    }

    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const map = await labGetDossiersRisque(codesClients, scope);
    return res.json({ data: Object.fromEntries(map) });
  } catch (err) {
    console.error('Erreur postDossiersRisque:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function getResumeLab(req, res) {
  try {
    const code_client = req.query.code_client;
    if (code_client === undefined || code_client === null || String(code_client).trim() === '') {
      return res.status(400).json({ error: 'Paramètre code_client requis' });
    }

    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;
    await labAssertDossierInScope(code_client, scope);

    const data = await labGetResumeLab(code_client);
    return res.json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur getResumeLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function getDossierLab(req, res) {
  try {
    const code_client = req.query.code_client;
    if (code_client === undefined || code_client === null || String(code_client).trim() === '') {
      return res.status(400).json({ error: 'Paramètre code_client requis' });
    }

    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;
    await labAssertDossierInScope(code_client, scope);

    const data = await labGetDossierLab(code_client);
    return res.json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur getDossierLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function postDossierLab(req, res) {
  try {
    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const userId = await resolveUserId(req);
    const codeClient = req.body?.code_client;
    if (codeClient != null && String(codeClient).trim() !== '') {
      await labAssertDossierInScope(codeClient, scope);
    }

    const data = await labCreateDossierLab(req.body ?? {}, userId);
    return res.status(201).json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur postDossierLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function putDossierLab(req, res) {
  try {
    const code_client = req.query.code_client;
    if (code_client === undefined || code_client === null || String(code_client).trim() === '') {
      return res.status(400).json({ error: 'Paramètre code_client requis' });
    }

    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;
    await labAssertDossierInScope(code_client, scope);

    const userId = await resolveUserId(req);
    const data = await labUpdateDossierLab(code_client, req.body ?? {}, userId);
    return res.json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur putDossierLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function putClientLab(req, res) {
  try {
    const code_client = req.query.code_client;
    if (code_client === undefined || code_client === null || String(code_client).trim() === '') {
      return res.status(400).json({ error: 'Paramètre code_client requis' });
    }

    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;
    await labAssertDossierInScope(code_client, scope);

    const userId = await resolveUserId(req);
    const data = await labUpdateClientLab(code_client, req.body ?? {}, userId);
    return res.json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur putClientLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function putKycLab(req, res) {
  try {
    const code_client = req.query.code_client;
    if (code_client === undefined || code_client === null || String(code_client).trim() === '') {
      return res.status(400).json({ error: 'Paramètre code_client requis' });
    }

    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;
    await labAssertDossierInScope(code_client, scope);

    const userId = await resolveUserId(req);
    const data = await labUpsertKycLab(code_client, req.body ?? {}, userId);
    return res.json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur putKycLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function postBeneficiaireLab(req, res) {
  try {
    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const codeClient = req.body?.code_client;
    if (codeClient != null && String(codeClient).trim() !== '') {
      await labAssertDossierInScope(codeClient, scope);
    } else {
      return res.status(400).json({ error: 'code_client requis' });
    }

    const userId = await resolveUserId(req);
    const data = await labCreateBeneficiaireLab(req.body ?? {}, userId);
    return res.status(201).json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur postBeneficiaireLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function putBeneficiaireLab(req, res) {
  try {
    const id = req.query.id;
    if (id === undefined || id === null || String(id).trim() === '') {
      return res.status(400).json({ error: 'Paramètre id requis' });
    }

    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const codeClient = await labResolveBeneficiaireCodeClient(id);
    await labAssertDossierInScope(codeClient, scope);

    const userId = await resolveUserId(req);
    const data = await labUpdateBeneficiaireLab(id, req.body ?? {}, userId);
    return res.json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur putBeneficiaireLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function deleteBeneficiaireLabHandler(req, res) {
  try {
    const id = req.query.id;
    if (id === undefined || id === null || String(id).trim() === '') {
      return res.status(400).json({ error: 'Paramètre id requis' });
    }

    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const codeClient = await labResolveBeneficiaireCodeClient(id);
    await labAssertDossierInScope(codeClient, scope);

    const userId = await resolveUserId(req);
    const data = await labDeleteBeneficiaireLab(id, userId);
    return res.json({ data, message: 'Opération réussie' });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur deleteBeneficiaireLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function postPieceLab(req, res) {
  try {
    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const codeClient = req.body?.code_client;
    if (codeClient != null && String(codeClient).trim() !== '') {
      await labAssertDossierInScope(codeClient, scope);
    } else {
      return res.status(400).json({ error: 'code_client requis' });
    }

    const userId = await resolveUserId(req);
    const data = await labCreatePieceKycLab(req.body ?? {}, userId);
    return res.status(201).json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur postPieceLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function postPieceUploadLab(req, res) {
  try {
    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const codeClient = req.body?.code_client;
    if (codeClient == null || String(codeClient).trim() === '') {
      return res.status(400).json({ error: 'code_client requis' });
    }
    await labAssertDossierInScope(codeClient, scope);

    if (!req.file) {
      return res.status(400).json({ error: 'Fichier requis' });
    }

    const data = await labSavePieceKycFileLab(codeClient, req.file);
    return res.status(201).json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur postPieceUploadLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function putPieceLab(req, res) {
  try {
    const id = req.query.id;
    if (id === undefined || id === null || String(id).trim() === '') {
      return res.status(400).json({ error: 'Paramètre id requis' });
    }

    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const codeClient = await labResolvePieceCodeClient(id);
    await labAssertDossierInScope(codeClient, scope);

    const userId = await resolveUserId(req);
    const data = await labUpdatePieceKycLab(id, req.body ?? {}, userId);
    return res.json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur putPieceLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function deletePieceLabHandler(req, res) {
  try {
    const id = req.query.id;
    if (id === undefined || id === null || String(id).trim() === '') {
      return res.status(400).json({ error: 'Paramètre id requis' });
    }

    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const codeClient = await labResolvePieceCodeClient(id);
    await labAssertDossierInScope(codeClient, scope);

    const userId = await resolveUserId(req);
    const data = await labDeletePieceKycLab(id, userId);
    return res.json({ data, message: 'Opération réussie' });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur deletePieceLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function getArpecEvaluation(req, res) {
  try {
    const code_client = req.query.code_client;
    if (code_client === undefined || code_client === null || String(code_client).trim() === '') {
      return res.status(400).json({ error: 'Paramètre code_client requis' });
    }

    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;
    await labAssertDossierInScope(code_client, scope);

    const data = await labGetArpecEvaluation(code_client);
    return res.json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur getArpecEvaluation:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function getArpecQuestionnaire(req, res) {
  try {
    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const data = await labGetArpecQuestionnaire();
    return res.json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur getArpecQuestionnaire:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function postArpecEvaluation(req, res) {
  try {
    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const codeClient = req.body?.code_client;
    if (codeClient != null && String(codeClient).trim() !== '') {
      await labAssertDossierInScope(codeClient, scope);
    } else {
      return res.status(400).json({ error: 'code_client requis' });
    }

    const userId = await resolveUserId(req);
    const data = await labSaveArpecEvaluation(req.body ?? {}, userId);
    return res.status(201).json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur postArpecEvaluation:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * POST /api/lab/plan-vigilance/generer
 * Body: { code_client }
 * Génère (idempotent) le plan de vigilance selon la vigilance courante du dossier.
 */
export async function postPlanVigilanceGenerer(req, res) {
  try {
    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const codeClient = req.body?.code_client;
    if (codeClient == null || String(codeClient).trim() === '') {
      return res.status(400).json({ error: 'code_client requis' });
    }

    await labAssertDossierInScope(codeClient, scope);

    const userId = await resolveUserId(req);
    const data = await labGenererPlanVigilanceLab(codeClient, { userId });
    return res.status(200).json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur postPlanVigilanceGenerer:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function resolveUserId(req) {
  const email = req.user?.unique_name;
  if (!email) return null;
  const collaborateur = await dbService.GetCollaborateur(email);
  return collaborateur?.id_sellsy != null
    ? String(collaborateur.id_sellsy).trim()
    : null;
}

export async function getDashboardLab(req, res) {
  try {
    const scope = await resolveLabScope(req);
    if (!scope.isFull && !scope.idSellsy) {
      return res.status(403).json({ error: 'Accès LAB non autorisé' });
    }
    const data = await labGetDashboardLab(req.query, scope);
    return res.json({ data });
  } catch (err) {
    console.error('Erreur getDashboardLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function getDossiersLab(req, res) {
  try {
    const scope = await resolveLabScope(req);
    if (!scope.isFull && !scope.idSellsy) {
      return res.status(403).json({ error: 'Accès LAB non autorisé' });
    }
    const result = await labGetDossiersLab(req.query, scope);
    return res.json(result);
  } catch (err) {
    console.error('Erreur getDossiersLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function getEvenementsLab(req, res) {
  try {
    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;
    const result = await labGetEvenementsLab(req.query, scope);
    return res.json(result);
  } catch (err) {
    console.error('Erreur getEvenementsLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function getDiligencesLab(req, res) {
  try {
    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;
    const result = await labGetDiligencesLab(req.query, scope);
    return res.json(result);
  } catch (err) {
    console.error('Erreur getDiligencesLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function postEvenementLab(req, res) {
  try {
    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const codeClient = req.body?.code_client;
    if (codeClient != null && String(codeClient).trim() !== '') {
      await labAssertDossierInScope(codeClient, scope);
    } else {
      return res.status(400).json({ error: 'code_client requis' });
    }

    const userId = await resolveUserId(req);
    const data = await labCreateEvenementLab(req.body ?? {}, userId);
    return res.status(201).json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur postEvenementLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function putEvenementLab(req, res) {
  try {
    const id = req.query.id;
    if (id === undefined || id === null || String(id).trim() === '') {
      return res.status(400).json({ error: 'Paramètre id requis' });
    }

    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const codeClient = await labResolveEvenementCodeClient(id);
    await labAssertDossierInScope(codeClient, scope);

    const userId = await resolveUserId(req);
    const data = await labUpdateEvenementLab(id, req.body ?? {}, userId);
    return res.json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur putEvenementLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function cloturerEvenementLabHandler(req, res) {
  try {
    const id = req.query.id;
    if (id === undefined || id === null || String(id).trim() === '') {
      return res.status(400).json({ error: 'Paramètre id requis' });
    }

    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const codeClient = await labResolveEvenementCodeClient(id);
    await labAssertDossierInScope(codeClient, scope);

    const userId = await resolveUserId(req);
    const data = await labCloturerEvenementLab(id, req.body ?? {}, userId);
    return res.json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur cloturerEvenementLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function postDiligenceLab(req, res) {
  try {
    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const idEvenement = req.body?.id_evenement;
    if (idEvenement == null) {
      return res.status(400).json({ error: 'id_evenement requis' });
    }

    const codeClient = await labResolveEvenementCodeClient(idEvenement);
    await labAssertDossierInScope(codeClient, scope);

    const userId = await resolveUserId(req);
    const data = await labCreateDiligenceLab(req.body ?? {}, userId);
    return res.status(201).json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur postDiligenceLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function putDiligenceLab(req, res) {
  try {
    const id = req.query.id;
    if (id === undefined || id === null || String(id).trim() === '') {
      return res.status(400).json({ error: 'Paramètre id requis' });
    }

    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const codeClient = await labResolveDiligenceCodeClient(id);
    await labAssertDossierInScope(codeClient, scope);

    const userId = await resolveUserId(req);
    const data = await labUpdateDiligenceLab(id, req.body ?? {}, userId);
    return res.json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur putDiligenceLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function getRevuesLab(req, res) {
  try {
    const code_client = req.query.code_client;
    if (code_client === undefined || code_client === null || String(code_client).trim() === '') {
      return res.status(400).json({ error: 'Paramètre code_client requis' });
    }

    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;
    await labAssertDossierInScope(code_client, scope);

    const result = await labGetRevuesLab(code_client);
    return res.json(result);
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur getRevuesLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function postRevueLab(req, res) {
  try {
    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const codeClient = req.body?.code_client;
    if (codeClient != null && String(codeClient).trim() !== '') {
      await labAssertDossierInScope(codeClient, scope);
    } else {
      return res.status(400).json({ error: 'code_client requis' });
    }

    const userId = await resolveUserId(req);
    const data = await labCreateRevueLab(req.body ?? {}, userId);
    return res.status(201).json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur postRevueLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function cloturerRevueLabHandler(req, res) {
  try {
    const id = req.query.id;
    if (id === undefined || id === null || String(id).trim() === '') {
      return res.status(400).json({ error: 'Paramètre id requis' });
    }

    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const codeClient = await labResolveRevueCodeClient(id);
    await labAssertDossierInScope(codeClient, scope);

    const userId = await resolveUserId(req);
    const data = await labCloturerRevueLab(id, req.body ?? {}, userId);
    return res.json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur cloturerRevueLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function annulerRevueLabHandler(req, res) {
  try {
    const id = req.query.id;
    if (id === undefined || id === null || String(id).trim() === '') {
      return res.status(400).json({ error: 'Paramètre id requis' });
    }

    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;

    const codeClient = await labResolveRevueCodeClient(id);
    await labAssertDossierInScope(codeClient, scope);

    const userId = await resolveUserId(req);
    const data = await labAnnulerRevueLab(id, userId);
    return res.json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur annulerRevueLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function getTransactionsLab(req, res) {
  try {
    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;
    const result = await labGetTransactionsLab(req.query, scope);
    return res.json(result);
  } catch (err) {
    console.error('Erreur getTransactionsLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function getTracfinLab(req, res) {
  try {
    const scope = await resolveLabScope(req);
    if (denyIfNoScope(scope, res)) return;
    const result = await labGetTracfinLab(req.query, scope);
    return res.json(result);
  } catch (err) {
    console.error('Erreur getTracfinLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function getParametrageLab(req, res) {
  try {
    // Paramétrage cabinet (scoring, critères) : réservé aux profils LAB / admin (specs §11).
    const scope = await resolveLabScope(req);
    if (!scope.isFull) {
      return res.status(403).json({ error: 'Accès paramétrage LAB réservé aux administrateurs' });
    }
    const data = await labGetParametrageLab();
    return res.json({ data });
  } catch (err) {
    console.error('Erreur getParametrageLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export async function getEnrichissementLab(req, res) {
  try {
    const siret = req.query.siret;
    const siren = req.query.siren;
    const code_client = req.query.code_client;

    const hasSiret = siret != null && String(siret).trim() !== '';
    const hasSiren = siren != null && String(siren).trim() !== '';
    if (!hasSiret && !hasSiren) {
      return res.status(400).json({ error: 'Paramètre siret ou siren requis' });
    }

    // Si un code_client est fourni, l'enrichissement fusionne des données LAB/BDD
    // stockées (getDossierLab) -> on impose le périmètre de l'appelant (anti-IDOR).
    const hasCodeClient = code_client != null && String(code_client).trim() !== '';
    if (hasCodeClient) {
      const scope = await resolveLabScope(req);
      if (denyIfNoScope(scope, res)) return;
      await labAssertDossierInScope(code_client, scope);
    }

    const data = await getLabEnrichissement({
      siret: hasSiret ? String(siret).trim() : undefined,
      siren: hasSiren ? String(siren).trim() : undefined,
      code_client: code_client != null ? String(code_client).trim() : undefined,
    });

    if (!data.ok) {
      return res.status(400).json({ error: data.error || 'Enrichissement impossible', data });
    }

    return res.json({ data });
  } catch (err) {
    if (err instanceof LabDossierError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Erreur getEnrichissementLab:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

