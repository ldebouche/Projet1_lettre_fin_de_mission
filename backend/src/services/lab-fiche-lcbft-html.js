/**
 * Templates HTML Fiche LCB-FT 1 (entrée en relation) / 2 (revue).
 * Structure alignée Excel docs/Fiche_* ; risque = ARPEC 5 axes (pas 31 Q / score /100).
 */

function esc(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cell(value, fallback = '—') {
  const t = value != null ? String(value).trim() : '';
  return esc(t || fallback);
}

function ouiNon(v) {
  if (v === true || v === 'O' || v === 'Oui' || v === 'oui') return 'Oui';
  if (v === false || v === 'N' || v === 'Non' || v === 'non') return 'Non';
  return cell(v);
}

function formatDateFr(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return cell(value);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function decisionLabel(statutDossier) {
  const s = String(statutDossier || '').trim().toLowerCase();
  if (s === 'refuse') return 'Refusée';
  if (s === 'actif') return 'Acceptée';
  return cell(statutDossier, '—');
}

function buildAxesRows(axes = []) {
  if (!axes.length) {
    return `<tr><td colspan="3">Aucune cotation ARPEC</td></tr>`;
  }
  return axes
    .map(
      (a) => `<tr>
      <td>${cell(a.libelle || a.code)}</td>
      <td>${cell(a.niveau)}</td>
      <td>${cell(a.nb_oui, '0')}</td>
    </tr>`,
    )
    .join('');
}

function buildBeRows(beneficiaires = []) {
  if (!beneficiaires.length) {
    return `<tr><td colspan="5">Aucun bénéficiaire effectif saisi</td></tr>`;
  }
  return beneficiaires
    .map((b) => {
      const nom = [b.nom, b.prenom].filter(Boolean).join(' ');
      return `<tr>
        <td>${cell(nom)}</td>
        <td>${cell(b.nationalite)}</td>
        <td>${cell(b.pays_residence)}</td>
        <td>${cell(b.pourcentage)}</td>
        <td>${cell(b.mode_controle)}</td>
      </tr>`;
    })
    .join('');
}

function buildPiecesRows(pieces = []) {
  if (!pieces.length) {
    return `<tr><td colspan="3">Aucune pièce référencée</td></tr>`;
  }
  return pieces
    .map(
      (p) => `<tr>
      <td>${cell(p.type_piece || p.libelle)}</td>
      <td>${cell(p.statut)}</td>
      <td>${formatDateFr(p.date_recueil || p.date_delivrance)}</td>
    </tr>`,
    )
    .join('');
}

function css() {
  return `
    @page { size: A4; margin: 14mm 12mm; }
    body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10pt; color: #1a1a1a; line-height: 1.35; }
    h1 { font-size: 14pt; margin: 0 0 4px; }
    h2 { font-size: 11pt; margin: 18px 0 6px; border-bottom: 1px solid #333; padding-bottom: 2px; }
    h3 { font-size: 10pt; margin: 12px 0 4px; }
    .muted { color: #555; font-size: 8.5pt; }
    .meta { margin: 8px 0 12px; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; }
    th, td { border: 1px solid #bbb; padding: 4px 6px; vertical-align: top; text-align: left; }
    th { background: #f3f3f3; font-weight: 600; }
    .kv td:first-child { width: 38%; font-weight: 600; background: #fafafa; }
    .box-empty { min-height: 28px; border: 1px dashed #999; padding: 6px; color: #777; margin: 4px 0 10px; }
    .footer-note { margin-top: 16px; font-size: 8pt; color: #666; }
  `;
}

/**
 * @param {'1'|'2'} typeFiche
 * @param {object} ctx
 */
export function buildFicheLcbftHtml(typeFiche, ctx) {
  const isRevue = typeFiche === '2';
  const title = isRevue
    ? 'FICHE DE SYNTHÈSE — REVUE ANNUELLE DES RISQUES'
    : 'FICHE DE SYNTHÈSE — ENTRÉE EN RELATION ET ACCEPTATION DE MISSION';
  const subtitle = isRevue
    ? 'Vigilance constante et actualisation de l’analyse des risques LCB-FT (NPLAB).'
    : 'Justification des diligences et de l’analyse des risques LCB-FT avant acceptation (NPLAB).';

  const c = ctx.client || {};
  const lab = ctx.lab || {};
  const kyc = ctx.kyc || {};
  const supplement = kyc.wizard_supplement || {};
  const dirigeant = supplement.dirigeant || {};
  const extraction = ctx.extraction || {};
  const arpec = ctx.arpec || {};
  const axes = arpec.axes || [];

  const missions = [
    supplement.mission_comptabilite ? 'Comptabilité' : null,
    supplement.mission_audit ? 'Audit' : null,
    supplement.mission_sociale ? 'Sociale' : null,
    supplement.mission_juridique ? 'Juridique' : null,
    supplement.nature_relation_libre || null,
  ]
    .filter(Boolean)
    .join(' · ');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <style>${css()}</style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <p class="muted">${esc(subtitle)}</p>
  <p class="muted">Fiche ${esc(typeFiche)} · générée le ${esc(ctx.dateFicheFr)} · rédacteur : ${cell(ctx.redacteur)}</p>

  <h2>1 — Dossier</h2>
  <table class="kv">
    <tr><td>Client</td><td>${cell(c.raison_sociale)}</td></tr>
    <tr><td>Code client / SIREN-SIRET</td><td>${cell(c.code_client)} · ${cell(c.siret || c.siren)}</td></tr>
    <tr><td>Forme / APE</td><td>${cell(c.forme_societe)} · ${cell(c.ape)}</td></tr>
    <tr><td>Adresse siège</td><td>${cell([c.adr1_siege, c.adr2_siege, c.cpos_siege, c.ville_siege].filter(Boolean).join(', '))}</td></tr>
    <tr><td>Expert-comptable</td><td>${cell(ctx.expertComptable)}</td></tr>
    ${isRevue ? `<tr><td>Identifiant revue</td><td>${cell(ctx.idRevue)}</td></tr>` : ''}
    <tr><td>Date entrée relation</td><td>${formatDateFr(lab.date_entree_relation)}</td></tr>
  </table>

  <h2>2 — Identification &amp; dirigeant</h2>
  <h3>Représentant légal / dirigeant</h3>
  <table class="kv">
    <tr><td>Nom / prénom</td><td>${cell([dirigeant.nom, dirigeant.prenom].filter(Boolean).join(' '))}</td></tr>
    <tr><td>Date / lieu de naissance</td><td>${cell(dirigeant.date_naissance)} · ${cell(dirigeant.lieu_naissance)}</td></tr>
    <tr><td>Nationalité</td><td>${cell(dirigeant.nationalite)}</td></tr>
    <tr><td>Adresse personnelle</td><td>${cell(dirigeant.adresse_personnelle)}</td></tr>
  </table>

  <h3>Bénéficiaires effectifs</h3>
  <table>
    <thead><tr><th>Nom</th><th>Nationalité</th><th>Résidence</th><th>%</th><th>Contrôle</th></tr></thead>
    <tbody>${buildBeRows(ctx.beneficiaires)}</tbody>
  </table>

  <h3>Pièces recueillies</h3>
  <table>
    <thead><tr><th>Type</th><th>Statut</th><th>Date</th></tr></thead>
    <tbody>${buildPiecesRows(ctx.pieces)}</tbody>
  </table>

  <h2>3 — Connaissance de la relation</h2>
  <table class="kv">
    <tr><td>Missions / nature</td><td>${cell(missions)}</td></tr>
    <tr><td>Secteur</td><td>${cell(kyc.secteur_activite)}</td></tr>
    <tr><td>Zone géographique</td><td>${cell(kyc.zone_geographique_principale)}</td></tr>
    <tr><td>Origine des fonds</td><td>${cell(kyc.origine_fonds)}</td></tr>
    <tr><td>PEP / lien PEP</td><td>${ouiNon(kyc.est_pep)} / ${cell(kyc.lien_pep)}</td></tr>
    <tr><td>Origine du contact</td><td>${cell(extraction.origine_contact)}</td></tr>
    <tr><td>Honoraires</td><td>${cell(extraction.honoraires)}</td></tr>
    <tr><td>Clients / fournisseurs</td><td>${cell(extraction.clients_fournisseurs)}</td></tr>
    <tr><td>Banques</td><td>${cell(extraction.banques)}</td></tr>
    <tr><td>Contrôles (date / source)</td><td>${cell(extraction.date_controles)} · ${cell(extraction.source_controles)}</td></tr>
  </table>

  <h2>4 — Analyse des risques (ARPEC outil)</h2>
  <p class="muted">Cinq axes de l’outil LAB — pas de score /100, pas le questionnaire cabinet 31 questions.</p>
  <table>
    <thead><tr><th>Axe</th><th>Niveau</th><th>Nb. OUI</th></tr></thead>
    <tbody>${buildAxesRows(axes)}</tbody>
  </table>
  <table class="kv">
    <tr><td>Niveau calculé</td><td>${cell(arpec.niveau_calcule)}</td></tr>
    <tr><td>Niveau retenu</td><td>${cell(arpec.niveau_retenu)}</td></tr>
    <tr><td>Modulation</td><td>${cell(arpec.modulation)}${arpec.justification_modulation ? ` — ${cell(arpec.justification_modulation)}` : ''}</td></tr>
    <tr><td>Vigilance</td><td>${cell(arpec.vigilance || lab.vigilance)}</td></tr>
    <tr><td>Périodicité revue</td><td>${cell(lab.periodicite_revue_mois)} mois</td></tr>
    <tr><td>Prochaine revue</td><td>${formatDateFr(lab.date_prochaine_revue)}</td></tr>
  </table>

  <h2>5 — Zones non renseignées (assumées)</h2>
  <h3>Tracfin / déclaration de soupçon</h3>
  <div class="box-empty">Non renseigné dans l’outil à ce stade.</div>
  <h3>Opérations spéciales / vigilance constante ops</h3>
  <div class="box-empty">Non renseigné dans l’outil à ce stade.</div>

  <h2>6 — Conclusion</h2>
  <table class="kv">
    <tr><td>Décision</td><td><strong>${esc(decisionLabel(lab.statut_dossier))}</strong></td></tr>
    <tr><td>Date de la décision</td><td>${esc(ctx.dateFicheFr)}</td></tr>
    <tr><td>Prochaine revue programmée</td><td>${formatDateFr(lab.date_prochaine_revue)}</td></tr>
  </table>

  <h2>7 — Validation</h2>
  <table>
    <thead><tr><th>Rôle</th><th>Nom</th><th>Date</th><th>Signature</th></tr></thead>
    <tbody>
      <tr><td>Fiche établie par</td><td>${cell(ctx.redacteur)}</td><td>${esc(ctx.dateFicheFr)}</td><td></td></tr>
      <tr><td>Fiche revue par</td><td></td><td></td><td></td></tr>
      <tr><td>Décision validée par (EC inscrit)</td><td>${cell(ctx.expertComptable)}</td><td></td><td></td></tr>
    </tbody>
  </table>

  <p class="footer-note">
    Conservation cinq ans à compter de la fin de la relation d’affaires (L. 561-12 CMF).
    Aucune mention de déclaration de soupçon sur cette synthèse (L. 561-18 CMF).
  </p>
</body>
</html>`;
}
