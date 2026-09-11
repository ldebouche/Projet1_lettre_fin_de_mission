import { poolPromise, sql } from '../config/db.js';
import { LabDossierError, assertDossierInScope } from './lab-utils.js';

const MAX_CONTENU = 4000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const TYPE_FIL_DOSSIER = 'DOSSIER';

const CONVERSATION_SELECT = `
  SELECT
    id,
    code_client,
    type_fil,
    id_evenement,
    id_diligence,
    date_creation,
    date_dernier_message,
    cree_par
  FROM lab_conversations
`;

function cleanText(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function parseOptionalPositiveInt(value, label) {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(String(value).trim());
  if (!Number.isInteger(n) || n < 1) {
    throw new LabDossierError(`${label} invalide`, 400);
  }
  return n;
}

function parseRequiredPositiveInt(value, label) {
  const n = parseOptionalPositiveInt(value, label);
  if (n == null) {
    throw new LabDossierError(`${label} requis`, 400);
  }
  return n;
}

function parseIdList(value, label) {
  if (value == null || String(value).trim() === '') return [];
  const parts = String(value)
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const ids = [];
  for (const part of parts) {
    const n = parseOptionalPositiveInt(part, label);
    if (n != null) ids.push(n);
  }
  return [...new Set(ids)];
}

function normalizeContenu(raw) {
  const text = raw == null ? '' : String(raw).trim();
  if (!text) {
    throw new LabDossierError('contenu requis', 400);
  }
  if (text.length > MAX_CONTENU) {
    throw new LabDossierError(`contenu trop long (max ${MAX_CONTENU} caractères)`, 400);
  }
  return text;
}

function isUniqueViolation(err) {
  let n = err?.number;
  if (n == null && err?.originalError) {
    n = err.originalError.number ?? err.originalError.info?.number;
  }
  return n === 2627 || n === 2601;
}

function mapConversationRow(row, participants = []) {
  if (!row) return null;
  return {
    id: row.id,
    code_client: cleanText(row.code_client),
    type_fil: cleanText(row.type_fil) || TYPE_FIL_DOSSIER,
    id_evenement: row.id_evenement == null ? null : Number(row.id_evenement),
    id_diligence: row.id_diligence == null ? null : Number(row.id_diligence),
    date_creation: row.date_creation ?? null,
    date_dernier_message: row.date_dernier_message ?? null,
    cree_par: cleanText(row.cree_par),
    participants,
  };
}

function mapMessageRow(row) {
  if (!row) return null;
  const supprime = cleanText(row.supprime) === 'O';
  return {
    id: row.id,
    id_conversation: row.id_conversation,
    code_client: cleanText(row.code_client),
    id_auteur: cleanText(row.id_auteur),
    auteur_nom: cleanText(row.auteur_nom),
    auteur_prenom: cleanText(row.auteur_prenom),
    contenu: supprime ? null : row.contenu,
    date_creation: row.date_creation ?? null,
    date_modification: row.date_modification ?? null,
    edite: cleanText(row.edite) === 'O',
    supprime,
    date_suppression: row.date_suppression ?? null,
    supprime_par: cleanText(row.supprime_par),
    id_evenement: row.id_evenement == null ? null : Number(row.id_evenement),
    id_diligence: row.id_diligence == null ? null : Number(row.id_diligence),
    evenement_type: cleanText(row.evenement_type),
    evenement_libelle: cleanText(row.evenement_libelle),
    diligence_intitule: cleanText(row.diligence_intitule),
  };
}

function mapParticipantRow(row) {
  return {
    id_sellsy: cleanText(row.id_sellsy),
    nom: cleanText(row.nom),
    prenom: cleanText(row.prenom),
    role: cleanText(row.role),
  };
}

async function insertAudit({ userId, typeAction, entite, idEntite, codeClient, detail }) {
  const pool = await poolPromise;
  await pool
    .request()
    .input('id_utilisateur', sql.NChar(20), cleanText(userId))
    .input('type_action', sql.NChar(50), typeAction)
    .input('entite', sql.NChar(50), entite)
    .input('id_entite', sql.NVarChar(50), idEntite != null ? String(idEntite) : null)
    .input('code_client', sql.NVarChar(10), codeClient)
    .input(
      'detail',
      sql.NVarChar(sql.MAX),
      typeof detail === 'string' ? detail : JSON.stringify(detail ?? {}),
    )
    .query(`
      INSERT INTO lab_audit_log (
        id_utilisateur,
        type_action,
        entite,
        id_entite,
        code_client,
        detail
      )
      VALUES (
        @id_utilisateur,
        @type_action,
        @entite,
        @id_entite,
        @code_client,
        @detail
      )
    `);
}

async function fetchConversationById(pool, idConversation) {
  const result = await pool
    .request()
    .input('id', sql.Int, idConversation)
    .query(`
      ${CONVERSATION_SELECT}
      WHERE id = @id
    `);
  return result.recordset?.[0] ?? null;
}

async function fetchConversationByCodeClient(pool, codeClient) {
  const result = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      ${CONVERSATION_SELECT.replace(/^\s*SELECT/i, 'SELECT TOP 1')}
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
        AND RTRIM(LTRIM(type_fil)) = N'DOSSIER'
      ORDER BY id ASC
    `);
  return result.recordset?.[0] ?? null;
}

async function assertClientExists(pool, codeClient) {
  const result = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT TOP 1 RTRIM(LTRIM(code_client)) AS code_client
      FROM clients
      WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
    `);
  const row = result.recordset?.[0];
  if (!row) {
    throw new LabDossierError('Client introuvable', 404);
  }
  return cleanText(row.code_client);
}

async function resolveCodeClientFromSource(pool, source) {
  const codeClient = cleanText(source?.code_client);
  const idConversation = parseOptionalPositiveInt(source?.id_conversation, 'id_conversation');
  const idEvenement = parseOptionalPositiveInt(source?.id_evenement, 'id_evenement');
  const idDiligence = parseOptionalPositiveInt(source?.id_diligence, 'id_diligence');

  if (codeClient) {
    return assertClientExists(pool, codeClient);
  }

  if (idConversation != null) {
    const row = await fetchConversationById(pool, idConversation);
    if (!row) {
      throw new LabDossierError('Conversation introuvable', 404);
    }
    return cleanText(row.code_client);
  }

  if (idEvenement != null) {
    const result = await pool
      .request()
      .input('id', sql.Int, idEvenement)
      .query(`
        SELECT TOP 1 RTRIM(LTRIM(code_client)) AS code_client
        FROM lab_evenements
        WHERE id = @id
      `);
    const row = result.recordset?.[0];
    if (!row) {
      throw new LabDossierError('Événement introuvable', 404);
    }
    return cleanText(row.code_client);
  }

  if (idDiligence != null) {
    const result = await pool
      .request()
      .input('id', sql.Int, idDiligence)
      .query(`
        SELECT TOP 1 RTRIM(LTRIM(code_client)) AS code_client
        FROM lab_diligences
        WHERE id = @id
      `);
    const row = result.recordset?.[0];
    if (!row) {
      throw new LabDossierError('Diligence introuvable', 404);
    }
    return cleanText(row.code_client);
  }

  throw new LabDossierError(
    'Indiquer code_client, id_conversation, id_evenement ou id_diligence',
    400,
  );
}

async function loadMessageTags(pool, { idEvenement, idDiligence }, expectedCodeClient) {
  let eventId = idEvenement;
  let diligenceId = idDiligence;

  if (diligenceId != null) {
    const result = await pool
      .request()
      .input('id', sql.Int, diligenceId)
      .query(`
        SELECT TOP 1 id, RTRIM(LTRIM(code_client)) AS code_client, id_evenement
        FROM lab_diligences
        WHERE id = @id
      `);
    const row = result.recordset?.[0];
    if (!row) {
      throw new LabDossierError('Diligence introuvable', 404);
    }
    if (cleanText(row.code_client) !== expectedCodeClient) {
      throw new LabDossierError('Diligence hors dossier', 400);
    }
    if (eventId == null && row.id_evenement != null) {
      eventId = Number(row.id_evenement);
    }
  }

  if (eventId != null) {
    const result = await pool
      .request()
      .input('id', sql.Int, eventId)
      .query(`
        SELECT TOP 1 id, RTRIM(LTRIM(code_client)) AS code_client
        FROM lab_evenements
        WHERE id = @id
      `);
    const row = result.recordset?.[0];
    if (!row) {
      throw new LabDossierError('Événement introuvable', 404);
    }
    if (cleanText(row.code_client) !== expectedCodeClient) {
      throw new LabDossierError('Événement hors dossier', 400);
    }
  }

  return { idEvenement: eventId ?? null, idDiligence: diligenceId ?? null };
}

async function loadParticipants(pool, codeClient) {
  const result = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeClient)
    .query(`
      SELECT
        RTRIM(LTRIM(x.id_sellsy)) AS id_sellsy,
        RTRIM(LTRIM(c.nom)) AS nom,
        RTRIM(LTRIM(c.prenom)) AS prenom,
        x.role
      FROM (
        SELECT expert_comptable AS id_sellsy, N'expert_comptable' AS role
        FROM clients
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND expert_comptable IS NOT NULL
          AND RTRIM(LTRIM(expert_comptable)) <> N''
        UNION
        SELECT chef_de_mission, N'chef_de_mission'
        FROM clients
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND chef_de_mission IS NOT NULL
          AND RTRIM(LTRIM(chef_de_mission)) <> N''
        UNION
        SELECT assistant_comptable_revision, N'assistant_comptable_revision'
        FROM clients
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND assistant_comptable_revision IS NOT NULL
          AND RTRIM(LTRIM(assistant_comptable_revision)) <> N''
        UNION
        SELECT assistant_comptable, N'assistant_comptable'
        FROM clients
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND assistant_comptable IS NOT NULL
          AND RTRIM(LTRIM(assistant_comptable)) <> N''
        UNION
        SELECT id_responsable_lab, N'responsable_lab'
        FROM lab_dossier
        WHERE RTRIM(LTRIM(code_client)) = RTRIM(LTRIM(@code_client))
          AND id_responsable_lab IS NOT NULL
          AND RTRIM(LTRIM(id_responsable_lab)) <> N''
      ) x
      LEFT JOIN collaborateurs c
        ON RTRIM(LTRIM(c.id_sellsy)) = RTRIM(LTRIM(x.id_sellsy))
    `);
  return (result.recordset || [])
    .map(mapParticipantRow)
    .filter((p) => p.id_sellsy);
}

async function insertConversation(pool, codeClient, userId) {
  const result = await pool
    .request()
    .input('code_client', sql.NVarChar(10), codeClient)
    .input('type_fil', sql.NChar(20), TYPE_FIL_DOSSIER)
    .input('cree_par', sql.NChar(20), cleanText(userId))
    .query(`
      INSERT INTO lab_conversations (
        code_client,
        type_fil,
        id_evenement,
        id_diligence,
        cree_par
      )
      OUTPUT
        INSERTED.id,
        INSERTED.code_client,
        INSERTED.type_fil,
        INSERTED.id_evenement,
        INSERTED.id_diligence,
        INSERTED.date_creation,
        INSERTED.date_dernier_message,
        INSERTED.cree_par
      VALUES (
        @code_client,
        @type_fil,
        NULL,
        NULL,
        @cree_par
      )
    `);
  return result.recordset?.[0] ?? null;
}

export async function ensureConversationLab(source, scope, userId = null) {
  const pool = await poolPromise;
  const codeClient = await resolveCodeClientFromSource(pool, source);
  await assertDossierInScope(codeClient, scope);

  let row = await fetchConversationByCodeClient(pool, codeClient);
  let created = false;

  if (!row) {
    try {
      row = await insertConversation(pool, codeClient, userId);
      created = true;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      row = await fetchConversationByCodeClient(pool, codeClient);
    }
  }

  if (!row) {
    throw new LabDossierError('Conversation introuvable', 404);
  }

  if (created) {
    await insertAudit({
      userId,
      typeAction: 'CREATION_CONVERSATION',
      entite: 'lab_conversations',
      idEntite: row.id,
      codeClient,
      detail: { type_fil: TYPE_FIL_DOSSIER },
    });
  }

  const participants = await loadParticipants(pool, codeClient);
  return mapConversationRow(row, participants);
}

async function resolveConversation(source, scope, userId, { ensureIfMissing = false } = {}) {
  const pool = await poolPromise;
  const idConversation = parseOptionalPositiveInt(source?.id_conversation, 'id_conversation');

  if (idConversation != null) {
    const row = await fetchConversationById(pool, idConversation);
    if (!row) {
      throw new LabDossierError('Conversation introuvable', 404);
    }
    await assertDossierInScope(cleanText(row.code_client), scope);
    return row;
  }

  if (ensureIfMissing) {
    const conversation = await ensureConversationLab(source, scope, userId);
    return {
      id: conversation.id,
      code_client: conversation.code_client,
      type_fil: conversation.type_fil,
      id_evenement: conversation.id_evenement,
      id_diligence: conversation.id_diligence,
    };
  }

  const codeClient = await resolveCodeClientFromSource(pool, source);
  await assertDossierInScope(codeClient, scope);
  const row = await fetchConversationByCodeClient(pool, codeClient);
  if (!row) {
    throw new LabDossierError('Conversation introuvable', 404);
  }
  return row;
}

const SQL_MESSAGE_VISIBLE = `(m.supprime IS NULL OR RTRIM(m.supprime) <> N'O')`;

const SQL_MESSAGE_SELECT = `
      m.id,
      m.id_conversation,
      m.code_client,
      m.id_auteur,
      m.contenu,
      m.date_creation,
      m.date_modification,
      m.edite,
      m.supprime,
      m.date_suppression,
      m.supprime_par,
      m.id_evenement,
      m.id_diligence,
      auteur.nom AS auteur_nom,
      auteur.prenom AS auteur_prenom,
      RTRIM(LTRIM(ev.type_evenement)) AS evenement_type,
      RTRIM(LTRIM(ev.libelle)) AS evenement_libelle,
      RTRIM(LTRIM(di.intitule)) AS diligence_intitule
    FROM lab_messages m
    LEFT JOIN collaborateurs auteur
      ON RTRIM(LTRIM(auteur.id_sellsy)) = RTRIM(LTRIM(m.id_auteur))
    LEFT JOIN lab_evenements ev ON ev.id = m.id_evenement
    LEFT JOIN lab_diligences di ON di.id = m.id_diligence
`;

function applyMessageFilters(req, where, { eventIds, diligenceIds }) {
  const filterParts = [];
  if (eventIds.length) {
    eventIds.forEach((id, index) => {
      const name = `flt_evt_${index}`;
      req.input(name, sql.Int, id);
    });
    filterParts.push(`m.id_evenement IN (${eventIds.map((_, i) => `@flt_evt_${i}`).join(', ')})`);
  }
  if (diligenceIds.length) {
    diligenceIds.forEach((id, index) => {
      const name = `flt_dlg_${index}`;
      req.input(name, sql.Int, id);
    });
    filterParts.push(`m.id_diligence IN (${diligenceIds.map((_, i) => `@flt_dlg_${i}`).join(', ')})`);
  }
  if (filterParts.length) {
    where.push(`(${filterParts.join(' OR ')})`);
  }
}

export async function getMessagesLab(query, scope, userId = null) {
  let conversation;
  try {
    conversation = await resolveConversation(query, scope, userId, { ensureIfMissing: false });
  } catch (err) {
    if (err instanceof LabDossierError && err.statusCode === 404) {
      return { data: [], total: 0 };
    }
    throw err;
  }
  const sinceId = parseOptionalPositiveInt(query?.since_id, 'since_id');
  const beforeId = parseOptionalPositiveInt(query?.before_id, 'before_id');
  const eventIds = parseIdList(query?.id_evenement, 'id_evenement');
  const diligenceIds = parseIdList(query?.id_diligence, 'id_diligence');
  let limit = DEFAULT_LIMIT;
  if (query?.limit != null && String(query.limit).trim() !== '') {
    limit = parseRequiredPositiveInt(query.limit, 'limit');
  }
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  const includeDeletedFlag = String(query?.inclure_supprimes ?? '').trim();
  const includeDeleted =
    scope?.isFull === true
    && (includeDeletedFlag === '1' || includeDeletedFlag.toLowerCase() === 'true');

  const pool = await poolPromise;
  const req = pool
    .request()
    .input('id_conversation', sql.Int, conversation.id)
    .input('limit', sql.Int, limit);

  const where = ['m.id_conversation = @id_conversation'];
  if (!includeDeleted) {
    where.push(SQL_MESSAGE_VISIBLE);
  }
  if (sinceId != null) {
    req.input('since_id', sql.Int, sinceId);
    where.push('m.id > @since_id');
  }
  if (beforeId != null) {
    req.input('before_id', sql.Int, beforeId);
    where.push('m.id < @before_id');
  }
  applyMessageFilters(req, where, { eventIds, diligenceIds });

  const whereSql = where.join('\n        AND ');
  const incremental = sinceId != null;
  const orderSql = incremental ? 'ORDER BY m.id ASC' : 'ORDER BY m.id DESC';

  const countReq = pool.request().input('id_conversation', sql.Int, conversation.id);
  const countWhere = ['m.id_conversation = @id_conversation'];
  if (!includeDeleted) countWhere.push(SQL_MESSAGE_VISIBLE);
  applyMessageFilters(countReq, countWhere, { eventIds, diligenceIds });
  const countResult = await countReq.query(`
    SELECT COUNT(*) AS total
    FROM lab_messages m
    WHERE ${countWhere.join('\n      AND ')}
  `);
  const total = Number(countResult.recordset?.[0]?.total ?? 0);

  const result = await req.query(`
    SELECT
      ${SQL_MESSAGE_SELECT}
    WHERE ${whereSql}
    ${orderSql}
    OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY
  `);

  let rows = result.recordset || [];
  if (!incremental) {
    rows = rows.slice().reverse();
  }

  return {
    data: rows.map(mapMessageRow),
    total,
  };
}

async function attachAuteurAndTags(pool, row) {
  if (!row) return row;
  const result = await pool
    .request()
    .input('id', sql.Int, row.id)
    .query(`
      SELECT
        ${SQL_MESSAGE_SELECT}
      WHERE m.id = @id
    `);
  return result.recordset?.[0] ?? row;
}

export async function createMessageLab(body, scope, userId) {
  if (!cleanText(userId)) {
    throw new LabDossierError('Utilisateur introuvable', 403);
  }
  const contenu = normalizeContenu(body?.contenu);
  const conversation = await resolveConversation(body, scope, userId, { ensureIfMissing: true });
  const pool = await poolPromise;
  const tags = await loadMessageTags(
    pool,
    {
      idEvenement: parseOptionalPositiveInt(body?.id_evenement, 'id_evenement'),
      idDiligence: parseOptionalPositiveInt(body?.id_diligence, 'id_diligence'),
    },
    cleanText(conversation.code_client),
  );

  const insert = await pool
    .request()
    .input('id_conversation', sql.Int, conversation.id)
    .input('code_client', sql.NVarChar(10), conversation.code_client)
    .input('id_auteur', sql.NChar(20), cleanText(userId))
    .input('contenu', sql.NVarChar(4000), contenu)
    .input('id_evenement', sql.Int, tags.idEvenement)
    .input('id_diligence', sql.Int, tags.idDiligence)
    .query(`
      INSERT INTO lab_messages (
        id_conversation,
        code_client,
        id_auteur,
        contenu,
        id_evenement,
        id_diligence
      )
      OUTPUT
        INSERTED.id,
        INSERTED.id_conversation,
        INSERTED.code_client,
        INSERTED.id_auteur,
        INSERTED.contenu,
        INSERTED.date_creation,
        INSERTED.date_modification,
        INSERTED.edite,
        INSERTED.supprime,
        INSERTED.date_suppression,
        INSERTED.supprime_par,
        INSERTED.id_evenement,
        INSERTED.id_diligence
      VALUES (
        @id_conversation,
        @code_client,
        @id_auteur,
        @contenu,
        @id_evenement,
        @id_diligence
      )
    `);

  const row = insert.recordset?.[0];
  await pool
    .request()
    .input('id', sql.Int, conversation.id)
    .input('date_dernier_message', sql.DateTime2, row?.date_creation ?? new Date())
    .query(`
      UPDATE lab_conversations
      SET date_dernier_message = @date_dernier_message
      WHERE id = @id
    `);

  await insertAudit({
    userId,
    typeAction: 'CREATION_MESSAGE',
    entite: 'lab_messages',
    idEntite: row.id,
    codeClient: conversation.code_client,
    detail: {
      type_fil: TYPE_FIL_DOSSIER,
      id_conversation: conversation.id,
      id_evenement: tags.idEvenement,
      id_diligence: tags.idDiligence,
      extrait: contenu.slice(0, 120),
    },
  });

  const named = await attachAuteurAndTags(pool, row);
  return mapMessageRow(named);
}

async function loadMessageOrThrow(pool, id) {
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query(`
      SELECT
        ${SQL_MESSAGE_SELECT}
      WHERE m.id = @id
    `);
  const row = result.recordset?.[0];
  if (!row) {
    throw new LabDossierError('Message introuvable', 404);
  }
  return row;
}

export async function updateMessageLab(id, body, scope, userId) {
  if (!cleanText(userId)) {
    throw new LabDossierError('Utilisateur introuvable', 403);
  }
  const messageId = parseRequiredPositiveInt(id, 'id');
  const contenu = normalizeContenu(body?.contenu);
  const pool = await poolPromise;
  const row = await loadMessageOrThrow(pool, messageId);
  await assertDossierInScope(cleanText(row.code_client), scope);

  if (cleanText(row.supprime) === 'O') {
    throw new LabDossierError('Message supprimé', 400);
  }
  if (cleanText(row.id_auteur) !== cleanText(userId)) {
    throw new LabDossierError("Seul l'auteur peut modifier ce message", 403);
  }

  await pool
    .request()
    .input('id', sql.Int, messageId)
    .input('contenu', sql.NVarChar(4000), contenu)
    .query(`
      UPDATE lab_messages
      SET
        contenu = @contenu,
        edite = N'O',
        date_modification = SYSUTCDATETIME()
      WHERE id = @id
    `);

  await insertAudit({
    userId,
    typeAction: 'MODIF_MESSAGE',
    entite: 'lab_messages',
    idEntite: messageId,
    codeClient: cleanText(row.code_client),
    detail: {
      id_conversation: row.id_conversation,
      extrait: contenu.slice(0, 120),
    },
  });

  const updated = await loadMessageOrThrow(pool, messageId);
  return mapMessageRow(updated);
}

export async function deleteMessageLab(id, scope, userId) {
  if (!cleanText(userId)) {
    throw new LabDossierError('Utilisateur introuvable', 403);
  }
  const messageId = parseRequiredPositiveInt(id, 'id');
  const pool = await poolPromise;
  const row = await loadMessageOrThrow(pool, messageId);
  await assertDossierInScope(cleanText(row.code_client), scope);

  const isAuthor = cleanText(row.id_auteur) === cleanText(userId);
  if (!isAuthor && scope?.isFull !== true) {
    throw new LabDossierError('Suppression non autorisée', 403);
  }

  if (cleanText(row.supprime) === 'O') {
    return { id: messageId, supprime: true };
  }

  await pool
    .request()
    .input('id', sql.Int, messageId)
    .input('supprime_par', sql.NChar(20), cleanText(userId))
    .query(`
      UPDATE lab_messages
      SET
        supprime = N'O',
        date_suppression = SYSUTCDATETIME(),
        supprime_par = @supprime_par
      WHERE id = @id
    `);

  await insertAudit({
    userId,
    typeAction: 'SUPPRESSION_MESSAGE',
    entite: 'lab_messages',
    idEntite: messageId,
    codeClient: cleanText(row.code_client),
    detail: {
      id_conversation: row.id_conversation,
      id_auteur: cleanText(row.id_auteur),
    },
  });

  return { id: messageId, supprime: true };
}
