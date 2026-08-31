import { getDossiersLabForExport } from './lab-dashboard-service.js';

const EXPORT_MAX_ROWS = 5000;

/** A4 paysage (points PDF). */
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN_X = 28;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 32;
const ROW_H = 12;
const HEADER_H = 14;
const FONT_SIZE = 7;
const TITLE_SIZE = 12;

/**
 * Charge le portefeuille pour export (requête SQL dédiée, 1 aller-retour).
 * @param {object} filters
 * @param {{ isFull: boolean, idSellsy: string|null }} scope
 */
export async function fetchPortefeuilleForExport(filters = {}, scope = { isFull: true, idSellsy: null }) {
  const base = { ...filters };
  delete base.page;
  delete base.pageSize;
  delete base.format;

  const result = await getDossiersLabForExport(base, scope, EXPORT_MAX_ROWS);
  return {
    data: result.data,
    total: result.total,
    exported: result.exported,
    truncated: result.truncated,
    filters: summarizeFilters(base),
  };
}

function summarizeFilters(filters = {}) {
  const labels = [];
  const search = clean(filters.search);
  if (search) labels.push(`Recherche : ${search}`);
  if (filters.niveau) labels.push(`Niveau : ${filters.niveau}`);
  if (filters.vigilance) labels.push(`Vigilance : ${filters.vigilance}`);
  if (filters.revue === 'late') labels.push('Revue en retard');
  if (filters.revue === 'soon') labels.push('Revue < 60 j');
  if (filters.kyc) labels.push(`KYC : ${filters.kyc}`);
  if (filters.secteur) labels.push(`Secteur : ${filters.secteur}`);
  if (filters.pays) labels.push(`Pays : ${filters.pays}`);
  return labels;
}

function clean(value) {
  return value != null ? String(value).trim() : '';
}

function formatDateFr(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR');
}

function display(value) {
  const t = clean(value);
  return t || 'Non renseigne';
}

function vigilanceLabel(value) {
  const n = display(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (n === 'renforcee') return 'Renforcee';
  if (n === 'standard') return 'Standard';
  return display(value);
}

/** Colonnes landscape (x, largeur). */
const COLS = [
  { key: 'client', label: 'Client', x: 28, w: 150 },
  { key: 'secteur', label: 'Secteur', x: 178, w: 90 },
  { key: 'pays', label: 'Pays', x: 268, w: 70 },
  { key: 'niveau', label: 'Niveau', x: 338, w: 55 },
  { key: 'vigilance', label: 'Vigilance', x: 393, w: 60 },
  { key: 'kyc', label: 'KYC', x: 453, w: 55 },
  { key: 'revue', label: 'Proch. revue', x: 508, w: 70 },
  { key: 'diligences', label: 'Diligences', x: 578, w: 70 },
  { key: 'resp', label: 'Resp. LAB', x: 648, w: 165 },
];

function truncate(text, maxChars) {
  const s = String(text ?? '');
  if (s.length <= maxChars) return s;
  return `${s.slice(0, Math.max(0, maxChars - 1))}…`;
}

function rowCells(row) {
  const name = display(row.raison_sociale);
  const code = display(row.code_client);
  const diligences =
    Number(row.nb_diligences_retard) > 0
      ? `${row.nb_diligences_retard} en retard`
      : 'A jour';
  return {
    client: truncate(`${name} (${code})`, 42),
    secteur: truncate(display(row.secteur_activite), 24),
    pays: truncate(display(row.zone_geographique_principale), 18),
    niveau: truncate(display(row.niveau_risque), 12),
    vigilance: truncate(vigilanceLabel(row.vigilance), 12),
    kyc: truncate(display(row.statut_kyc), 12),
    revue: formatDateFr(row.date_prochaine_revue),
    diligences: truncate(diligences, 14),
    resp: truncate(display(row.responsable_lab), 40),
  };
}

/**
 * Encode une chaîne PDF littérale (WinAnsi approximé + escapes).
 * Les accents hors Latin-1 sont décomposés (NFD) pour rester lisibles avec Helvetica.
 */
function pdfString(value) {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  let out = '';
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    if (code === 0x5c) out += '\\\\';
    else if (code === 0x28) out += '\\(';
    else if (code === 0x29) out += '\\)';
    else if (code === 0x0a) out += '\\n';
    else if (code === 0x0d) out += '\\r';
    else if (code === 0x09) out += ' ';
    else if (code < 32 || code > 255) out += '?';
    else if (code >= 128) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += normalized[i];
  }
  return `(${out})`;
}

function buildContentStream({ titleLines, headerCells, bodyRows, pageIndex, pageCount }) {
  const lines = [];
  lines.push('BT');
  lines.push(`/F1 ${TITLE_SIZE} Tf`);
  lines.push(`1 0 0 1 ${MARGIN_X} ${PAGE_H - 24} Tm`);
  lines.push(`${pdfString(titleLines[0] || 'Portefeuille clients LAB')} Tj`);
  lines.push(`/F1 8 Tf`);
  let metaY = PAGE_H - 36;
  for (let i = 1; i < titleLines.length; i++) {
    lines.push(`1 0 0 1 ${MARGIN_X} ${metaY} Tm`);
    lines.push(`${pdfString(titleLines[i])} Tj`);
    metaY -= 10;
  }

  // En-tête tableau
  let y = PAGE_H - MARGIN_TOP - 28;
  lines.push(`/F1 ${FONT_SIZE} Tf`);
  for (const col of COLS) {
    lines.push(`1 0 0 1 ${col.x} ${y} Tm`);
    lines.push(`${pdfString(col.label)} Tj`);
  }
  y -= 4;
  lines.push('ET');
  // Ligne sous header
  lines.push(`0.7 w ${MARGIN_X} ${y} m ${PAGE_W - MARGIN_X} ${y} l S`);
  y -= HEADER_H;

  lines.push('BT');
  lines.push(`/F1 ${FONT_SIZE} Tf`);
  for (const cells of bodyRows) {
    for (const col of COLS) {
      lines.push(`1 0 0 1 ${col.x} ${y} Tm`);
      lines.push(`${pdfString(cells[col.key] ?? '')} Tj`);
    }
    y -= ROW_H;
  }
  lines.push('ET');

  // Pied de page
  lines.push('BT');
  lines.push(`/F1 8 Tf`);
  lines.push(`1 0 0 1 ${MARGIN_X} 18 Tm`);
  lines.push(`${pdfString('Avenia LAB — portefeuille')} Tj`);
  lines.push(`1 0 0 1 ${PAGE_W - 70} 18 Tm`);
  lines.push(`${pdfString(`${pageIndex}/${pageCount}`)} Tj`);
  lines.push('ET');

  return lines.join('\n');
}

/**
 * Génère un PDF A4 paysage sans Chrome/Puppeteer (évite ECONNRESET en dev).
 * @param {{ data: object[], total: number, exported: number, truncated: boolean, filters: string[] }} payload
 * @param {{ nom?: string, email?: string }} actor
 */
export async function buildPortefeuillePdfBuffer(payload, actor = {}) {
  const generatedAt = new Date().toLocaleString('fr-FR');
  const filterLine = payload.filters.length
    ? payload.filters.join(' · ')
    : 'Aucun filtre (portefeuille entier du perimetre)';

  const titleLines = [
    'Portefeuille clients LAB',
    `Genere le ${generatedAt} — Par ${actor.nom || 'Utilisateur'} (${actor.email || '—'})`,
    `${payload.exported} ligne(s) exportee(s) sur ${payload.total} resultat(s)`,
    `Filtres : ${filterLine}`,
  ];
  if (payload.truncated) {
    titleLines.push(`Export limite a ${EXPORT_MAX_ROWS} lignes sur ${payload.total}.`);
  }

  const allRows = (payload.data || []).map(rowCells);
  const usableHeight = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM - 50;
  const rowsPerPage = Math.max(1, Math.floor(usableHeight / ROW_H));
  const pageCount = Math.max(1, Math.ceil(allRows.length / rowsPerPage) || 1);

  /** @type {string[]} */
  const contentStreams = [];
  for (let p = 0; p < pageCount; p++) {
    const slice = allRows.slice(p * rowsPerPage, (p + 1) * rowsPerPage);
    contentStreams.push(
      buildContentStream({
        titleLines: p === 0 ? titleLines : ['Portefeuille clients LAB (suite)', titleLines[2]],
        headerCells: COLS,
        bodyRows: slice.length ? slice : [Object.fromEntries(COLS.map((c) => [c.key, '']))],
        pageIndex: p + 1,
        pageCount,
      }),
    );
  }

  return assemblePdf(contentStreams);
}

/**
 * Assemble un PDF 1.4 minimal (Helvetica, multi-pages).
 * @param {string[]} contentStreams
 */
function assemblePdf(contentStreams) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };

  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const contentIds = contentStreams.map((stream) => {
    const body = Buffer.from(stream, 'latin1');
    return add(`<< /Length ${body.length} >>\nstream\n${stream}\nendstream`);
  });

  const pageIds = contentIds.map((contentId) =>
    add(
      `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    ),
  );

  const kids = pageIds.map((id) => `${id} 0 R`).join(' ');
  const pagesId = add(`<< /Type /Pages /Kids [ ${kids} ] /Count ${pageIds.length} >>`);

  // Patch Parent refs now that pagesId is known.
  for (let i = 0; i < pageIds.length; i++) {
    const idx = pageIds[i] - 1;
    objects[idx] = objects[idx].replace('/Parent 0 0 R', `/Parent ${pagesId} 0 R`);
  }

  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = '%PDF-1.4\n';
  /** @type {number[]} */
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`;
  pdf += `startxref\n${xrefPos}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}

/**
 * Génère un CSV UTF-8 (BOM) du portefeuille.
 * @param {{ data: object[] }} payload
 */
export function buildPortefeuilleCsvBuffer(payload) {
  const headers = [
    'code_client',
    'raison_sociale',
    'secteur_activite',
    'pays',
    'niveau_risque',
    'vigilance',
    'statut_kyc',
    'date_prochaine_revue',
    'nb_diligences_retard',
    'responsable_lab',
  ];

  const lines = [headers.join(';')];
  for (const row of payload.data || []) {
    const values = [
      row.code_client,
      row.raison_sociale,
      row.secteur_activite,
      row.zone_geographique_principale,
      row.niveau_risque,
      row.vigilance,
      row.statut_kyc,
      row.date_prochaine_revue ? formatDateFr(row.date_prochaine_revue) : '',
      row.nb_diligences_retard ?? 0,
      row.responsable_lab,
    ].map(csvCell);
    lines.push(values.join(';'));
  }

  const bom = '\uFEFF';
  return Buffer.from(bom + lines.join('\r\n'), 'utf8');
}

function csvCell(value) {
  const raw = value == null ? '' : String(value);
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function portefeuilleExportFilename(format) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const ext = format === 'csv' ? 'csv' : 'pdf';
  return `lab-portefeuille-${stamp}.${ext}`;
}
