import fs from "fs/promises";
import path from "path";
import { getAttenteRoot } from "./procedures/procedureFilesService.js";
import { extractAnaSectorielle } from "./pdfService.js";
import { poolPromise, sql } from "../config/db.js";
import { PATHS } from "../config/paths.js";

function toTrim(row) {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]),
  );
}

async function query(q, params = {}, single = false) {
  const pool = await poolPromise;
  const req = pool.request();

  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) {
      req.input(k, sql.NVarChar, null);
      continue;
    }
    if (typeof v === "number" && Number.isInteger(v)) req.input(k, sql.Int, v);
    else if (typeof v === "number") req.input(k, sql.Decimal(18, 4), v);
    else if (v instanceof Date) req.input(k, sql.DateTime2, v);
    else req.input(k, sql.NVarChar, String(v));
  }

  const res = await req.query(q);
  const rows = (res.recordset || []).map(toTrim);
  return single ? rows[0] ?? null : rows;
}

function pdfUrlFromRelative(relativePath) {
  const p = String(relativePath || "")
    .replace(/\\/g, "/")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `/api/files/anaSectorielles/${p}`;
}

function anaRoot() {
  return path.join(PATHS.documentsRoot, "anaSectorielles");
}

function safePosix(p) {
  return String(p || "").replace(/\\/g, "/");
}

async function cleanupEmptyDirs(dir) {
  try {
    const rest = await fs.readdir(dir);
    if (rest.length === 0) await fs.rm(dir, { recursive: true, force: true });
  } catch {}
}

export async function getAnaSectoriellesTree() {
  const docs = await query(
    `SELECT *
     FROM dbo.ana_sectorielle_meta
     WHERE statut = 'indexee'
     ORDER BY codeAPE, millesime, nomFichier;`,
  );

  let id = 1;
  const items = [];
  const codeNodeId = new Map();
  const millNodeId = new Map();

  for (const d of docs) {
    const code = d.codeAPE ?? "";
    const mil = d.millesime ?? 0;

    if (!codeNodeId.has(code)) {
      const nid = id++;
      codeNodeId.set(code, nid);
      items.push({
        id: nid,
        nomFichier: code,
        isFolder: true,
        idParent: null,
        isExpanded: false,
        relativePath: safePosix(code),
      });
    }

    const codeId = codeNodeId.get(code);
    const key = `${code}__${mil}`;

    if (!millNodeId.has(key)) {
      const nid = id++;
      millNodeId.set(key, nid);
      items.push({
        id: nid,
        nomFichier: String(mil),
        isFolder: true,
        idParent: codeId,
        isExpanded: false,
        relativePath: safePosix(`${code}/${mil}`),
      });
    }

    const parentId = millNodeId.get(key);

    items.push({
      id: d.id,
      dbId: d.id,
      isFolder: false,
      idParent: parentId,
      isExpanded: false,

      nomFichier: d.nomFichier,
      codeAPE: d.codeAPE,
      millesime: d.millesime,
      texte: d.texte,
      creePar: d.creeParNom,
      dateCreation: d.dateCreation,
      dateModification: d.dateModification,
      tailleMo: d.tailleMo,

      relativePdfPath: safePosix(d.relativePdfPath),
      relativePath: safePosix(d.relativePdfPath).replace(/^indexée\//, "").replace(/^indexee\//, ""),
      pdfUrl: pdfUrlFromRelative(d.relativePdfPath),
    });
  }

  return items;
}

export async function getAna(folderName) {
  const statut = folderName === "indexée" ? "indexee" : "attente";

  const rows = await query(
    `SELECT *
     FROM dbo.ana_sectorielle_meta
     WHERE statut = @statut
     ORDER BY dateCreation DESC;`,
    { statut },
  );

  return rows.map((r) => ({
    id: r.id,
    dbId: r.id,
    dateCreation: r.dateCreation,
    dateModification: r.dateModification,
    creePar: r.creeParNom ?? "",
    nomFichier: r.nomFichier,
    tailleMo: r.tailleMo,
    pdfUrl: pdfUrlFromRelative(r.relativePdfPath),
    codeAPE: r.codeAPE,
    millesime: r.millesime,
    texte: r.texte,
    isFolder: false,
    idParent: null,
    isExpanded: false,

    nomAnaSecto: r.nomAnaSecto,
    statut: r.statut,
    relativePdfPath: safePosix(r.relativePdfPath),
  }));
}

export async function creerAnaSecto(fileBuffer, originalName, utilisateur, nomAnaSecto) {
  const attentePath = getAttenteRoot("anaSectorielles");
  const anaDir = path.join(attentePath, nomAnaSecto);
  await fs.mkdir(anaDir, { recursive: true });

  const pdfDiskPath = path.join(anaDir, originalName);
  await fs.writeFile(pdfDiskPath, fileBuffer);

  const extracted = await extractAnaSectorielle(pdfDiskPath);

  const relativePdfPath = safePosix(path.posix.join("attente", nomAnaSecto, originalName));
  const tailleMo = Number(fileBuffer.byteLength / 1024 / 1024);

  const results = [];

  for (const it of extracted.items || []) {
    const millesime = Number(extracted.millesime || 0);

    const row = await query(
      `INSERT INTO dbo.ana_sectorielle_meta
        (nomAnaSecto, nomFichier, creeParNom, creeParEmail, codeAPE, millesime, texte, tailleMo, statut, relativePdfPath)
       OUTPUT INSERTED.*
       VALUES
        (@nomAnaSecto, @nomFichier, @creeParNom, @creeParEmail, @codeAPE, @millesime, @texte, @tailleMo, 'attente', @relativePdfPath);`,
      {
        nomAnaSecto,
        nomFichier: originalName,
        creeParNom: utilisateur?.name ?? null,
        creeParEmail: utilisateur?.unique_name ?? null,
        codeAPE: it.code_ape ?? "",
        millesime,
        texte: it.commentaire ?? "",
        tailleMo,
        relativePdfPath,
      },
      true,
    );

    results.push({
      id: row.id,
      dbId: row.id,
      dateCreation: row.dateCreation,
      dateModification: row.dateModification,
      creePar: row.creeParNom ?? "",
      nomFichier: row.nomFichier,
      tailleMo: row.tailleMo,
      pdfUrl: pdfUrlFromRelative(row.relativePdfPath),
      codeAPE: row.codeAPE,
      millesime: row.millesime,
      texte: row.texte,
      isFolder: false,
      idParent: null,
      isExpanded: false,
      nomAnaSecto: row.nomAnaSecto,
      statut: row.statut,
      relativePdfPath: safePosix(row.relativePdfPath),
    });
  }

  return results;
}

export async function enregistrerModifs(anaSectoMeta) {
  const id = anaSectoMeta?.id ?? anaSectoMeta?.dbId;
  if (!id) throw new Error("id manquant");

  const existing = await query(
    `SELECT * FROM dbo.ana_sectorielle_meta WHERE id=@id;`,
    { id },
    true,
  );
  if (!existing) throw new Error("Introuvable");

  const newCode = String(anaSectoMeta.codeAPE ?? "").trim();
  const newMil = Number(anaSectoMeta.millesime ?? 0);
  const newTexte = String(anaSectoMeta.texte ?? "");

  const root = anaRoot();
  let newRelativePdfPath = safePosix(existing.relativePdfPath);

  if (existing.statut === "indexee") {
    const oldDisk = path.join(root, existing.relativePdfPath);
    const desiredRel = safePosix(path.posix.join("indexée", newCode, String(newMil), existing.nomFichier));

    if (desiredRel !== newRelativePdfPath) {
      const newDisk = path.join(root, desiredRel);
      await fs.mkdir(path.dirname(newDisk), { recursive: true });
      await fs.rm(newDisk, { force: true });
      await fs.rename(oldDisk, newDisk);
      newRelativePdfPath = desiredRel;

      await cleanupEmptyDirs(path.dirname(oldDisk));
      await cleanupEmptyDirs(path.dirname(path.dirname(oldDisk)));
    }
  }

  await query(
    `UPDATE dbo.ana_sectorielle_meta
     SET codeAPE=@codeAPE,
         millesime=@millesime,
         texte=@texte,
         relativePdfPath=@relativePdfPath,
         dateModification=SYSUTCDATETIME()
     WHERE id=@id;`,
    {
      id,
      codeAPE: newCode,
      millesime: newMil,
      texte: newTexte,
      relativePdfPath: newRelativePdfPath,
    },
  );

  return { ok: true };
}

export async function accepterAnaSectorielle(anaSectoMeta) {
  const id = anaSectoMeta?.id ?? anaSectoMeta?.dbId;
  if (!id) throw new Error("id manquant");

  const meta = await query(
    `SELECT * FROM dbo.ana_sectorielle_meta WHERE id=@id;`,
    { id },
    true,
  );
  if (!meta) throw new Error("Ana sectorielle introuvable");
  if (meta.statut !== "attente") return { ok: true };

  const root = anaRoot();

  const srcPdfPath = path.join(root, meta.relativePdfPath);
  const destRel = safePosix(path.posix.join("indexée", meta.codeAPE, String(meta.millesime), meta.nomFichier));
  const destPdfPath = path.join(root, destRel);

  await fs.mkdir(path.dirname(destPdfPath), { recursive: true });
  await fs.rm(destPdfPath, { force: true });
  await fs.copyFile(srcPdfPath, destPdfPath);

  await query(
    `UPDATE dbo.ana_sectorielle_meta
     SET statut='indexee',
         relativePdfPath=@destRel,
         dateModification=SYSUTCDATETIME()
     WHERE id=@id;`,
    { id, destRel },
  );

  const remaining = await query(
    `SELECT COUNT(1) AS n
     FROM dbo.ana_sectorielle_meta
     WHERE statut='attente' AND nomAnaSecto=@nomAnaSecto;`,
    { nomAnaSecto: meta.nomAnaSecto },
    true,
  );

  if ((remaining?.n ?? 0) <= 0) {
    const attenteDir = path.join(root, "attente", meta.nomAnaSecto);
    await fs.rm(attenteDir, { recursive: true, force: true });
  }

  return { ok: true };
}

export async function remettreAnaSectorielleEnAttente(item) {
  const id = item?.id ?? item?.dbId;
  if (!id) throw new Error("id manquant");

  const meta = await query(
    `SELECT * FROM dbo.ana_sectorielle_meta WHERE id=@id;`,
    { id },
    true,
  );
  if (!meta) throw new Error("Introuvable");
  if (meta.statut !== "indexee") return { ok: true };

  const root = anaRoot();

  const srcPdfPath = path.join(root, meta.relativePdfPath);
  const destRel = safePosix(path.posix.join("attente", meta.nomAnaSecto, meta.nomFichier));
  const destPdfPath = path.join(root, destRel);

  await fs.mkdir(path.dirname(destPdfPath), { recursive: true });
  await fs.rm(destPdfPath, { force: true });
  await fs.copyFile(srcPdfPath, destPdfPath);

  await query(
    `UPDATE dbo.ana_sectorielle_meta
     SET statut='attente',
         relativePdfPath=@destRel,
         dateModification=SYSUTCDATETIME()
     WHERE id=@id;`,
    { id, destRel },
  );

  await fs.rm(srcPdfPath, { force: true });

  await cleanupEmptyDirs(path.dirname(srcPdfPath));
  await cleanupEmptyDirs(path.dirname(path.dirname(srcPdfPath)));

  return { ok: true };
}

export async function deleteAnaSectoItem(item) {
  const root = anaRoot();

  if (!item?.isFolder) {
    const id = item?.id ?? item?.dbId;
    if (!id) throw new Error("id/dbId manquant");

    const row = await query(
      `SELECT * FROM dbo.ana_sectorielle_meta WHERE id=@id;`,
      { id },
      true,
    );
    if (!row) return;

    const pdfPath = path.join(root, row.relativePdfPath);

    const before = await query(
      `SELECT COUNT(1) AS n
       FROM dbo.ana_sectorielle_meta
       WHERE statut=@statut AND nomAnaSecto=@nomAnaSecto AND nomFichier=@nomFichier;`,
      { statut: row.statut, nomAnaSecto: row.nomAnaSecto, nomFichier: row.nomFichier },
      true,
    );

    await query(`DELETE FROM dbo.ana_sectorielle_meta WHERE id=@id;`, { id });

    const after = await query(
      `SELECT COUNT(1) AS n
       FROM dbo.ana_sectorielle_meta
       WHERE statut=@statut AND nomAnaSecto=@nomAnaSecto AND nomFichier=@nomFichier;`,
      { statut: row.statut, nomAnaSecto: row.nomAnaSecto, nomFichier: row.nomFichier },
      true,
    );

    if ((before?.n ?? 0) > 0 && (after?.n ?? 0) === 0) {
      await fs.rm(pdfPath, { force: true });

      if (row.statut === "indexee") {
        await cleanupEmptyDirs(path.dirname(pdfPath));
        await cleanupEmptyDirs(path.dirname(path.dirname(pdfPath)));
      } else {
        const attenteDir = path.join(root, "attente", row.nomAnaSecto);
        try {
          const rest = await fs.readdir(attenteDir);
          if (rest.length === 0) await fs.rm(attenteDir, { recursive: true, force: true });
        } catch {}
      }
    }

    return;
  }

  if (!item.relativePath) throw new Error("relativePath manquant (dossier)");

  const folderRel = safePosix(path.posix.join("indexée", item.relativePath));
  const folderDisk = path.join(root, folderRel);

  const resolved = path.resolve(folderDisk);
  const resolvedRoot = path.resolve(path.join(root, "indexée"));
  if (!resolved.startsWith(resolvedRoot)) throw new Error("Chemin invalide");

  await fs.rm(resolved, { recursive: true, force: true });

  const like = folderRel.endsWith("/") ? folderRel : folderRel + "/";
  await query(
    `DELETE FROM dbo.ana_sectorielle_meta
     WHERE statut='indexee' AND relativePdfPath LIKE @like;`,
    { like: like + "%" },
  );
}

export async function rejeterAnaSectorielle(nomFichier, code_ape) {
  const nomFichierN = String(nomFichier || "").trim();
  const codeAPEN = String(code_ape || "").trim();
  if (!nomFichierN || !codeAPEN) return { ok: true };

  const rows = await query(
    `SELECT TOP 1 *
     FROM dbo.ana_sectorielle_meta
     WHERE statut='attente' AND nomFichier=@nomFichier AND codeAPE=@codeAPE
     ORDER BY dateCreation DESC;`,
    { nomFichier: nomFichierN, codeAPE: codeAPEN },
    true,
  );

  if (!rows) return { ok: true };

  const id = rows.id;
  const root = anaRoot();
  const pdfPath = path.join(root, rows.relativePdfPath);

  const before = await query(
    `SELECT COUNT(1) AS n
     FROM dbo.ana_sectorielle_meta
     WHERE statut='attente' AND nomAnaSecto=@nomAnaSecto AND nomFichier=@nomFichier;`,
    { nomAnaSecto: rows.nomAnaSecto, nomFichier: rows.nomFichier },
    true,
  );

  await query(`DELETE FROM dbo.ana_sectorielle_meta WHERE id=@id;`, { id });

  const after = await query(
    `SELECT COUNT(1) AS n
     FROM dbo.ana_sectorielle_meta
     WHERE statut='attente' AND nomAnaSecto=@nomAnaSecto AND nomFichier=@nomFichier;`,
    { nomAnaSecto: rows.nomAnaSecto, nomFichier: rows.nomFichier },
    true,
  );

  if ((before?.n ?? 0) > 0 && (after?.n ?? 0) === 0) {
    await fs.rm(pdfPath, { force: true });
  }

  const remainingFolder = await query(
    `SELECT COUNT(1) AS n
     FROM dbo.ana_sectorielle_meta
     WHERE statut='attente' AND nomAnaSecto=@nomAnaSecto;`,
    { nomAnaSecto: rows.nomAnaSecto },
    true,
  );

  if ((remainingFolder?.n ?? 0) === 0) {
    const attenteDir = path.join(root, "attente", rows.nomAnaSecto);
    await fs.rm(attenteDir, { recursive: true, force: true });
  }

  return { ok: true };
}

export async function getCompteurFichiers() {
  const row = await query(
    `SELECT COUNT(1) AS compteur
     FROM dbo.ana_sectorielle_meta
     WHERE statut='attente';`,
    {},
    true,
  );
  return { compteur: row?.compteur ?? 0 };
}

export async function createFolderToIndexedItems(folderName, parentId, indexedItems) {
  const root = path.join(PATHS.documentsRoot, "anaSectorielles", "indexée");

  const name = String(folderName || "").trim();
  if (!name) throw new Error("folderName manquant");

  let rel = "";
  if (parentId !== null && parentId !== undefined) {
    const parent = (indexedItems || []).find((i) => i.id === parentId);
    rel = parent?.relativePath ? safePosix(parent.relativePath) : "";
  }

  const disk = path.join(root, rel, name);
  const resolved = path.resolve(disk);
  const resolvedRoot = path.resolve(root);
  if (!resolved.startsWith(resolvedRoot)) throw new Error("Chemin invalide");

  await fs.mkdir(resolved, { recursive: true });
  return { ok: true };
}

export async function addFileToIndexedItems() {
  throw new Error("Non supporté pour anaSectorielles");
}
