import type {
  LabBeneficiaireEffectif,
  LabClientBloc,
  LabCreateBeneficiaireRequest,
  LabCreateDossierRequest,
  LabCreatePieceRequest,
  LabDossierBloc,
  LabDossierResponse,
  LabKycBloc,
  LabPieceKyc,
  LabUpdateBeneficiaireRequest,
  LabUpdateClientRequest,
  LabUpdateDossierRequest,
  LabUpdateKycRequest,
  LabUpdatePieceRequest,
  LabWizardFormModel,
  LabWizardSupplement,
  WizardBeRow,
  WizardPieceRow,
} from '../../../services/lab-service';

export function toInputDate(value: string | Date | null | undefined): string {
  if (value == null) return '';
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s) return '';
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export function toInputStr(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

export function extractSiren(siret: string | null | undefined): string {
  const s = toInputStr(siret).replace(/\s/g, '');
  return s.length >= 9 ? s.slice(0, 9) : s;
}

export function mapNiveauRisqueForForm(niveau: string | null | undefined): string {
  const n = toInputStr(niveau);
  if (n === 'Eleve' || n === 'Élevé' || n === 'Elevé') return 'Élevé';
  if (n === 'Moyen') return 'Moyen';
  if (n === 'Faible') return 'Faible';
  return n;
}

export function extractVolumeFromNotes(notes: string | null | undefined): string {
  if (!notes) return '';
  const match = notes.match(/Volume d'affaires estime:\s*(.+?)(?:\s*\||$)/i);
  return match ? match[1].trim() : '';
}

/** Formate un nom de collaborateur (prénom + nom) — aligné sur lab-dossier. */
export function formatCollaborateur(prenom: string | null | undefined, nom: string | null | undefined): string {
  const p = prenom != null ? String(prenom).trim() : '';
  const n = nom != null ? String(nom).trim() : '';
  const full = [p, n].filter((x) => x !== '').join(' ');
  return full !== '' ? full : '—';
}

export function createEmptyWizardForm(): LabWizardFormModel {
  return {
    code_client: '',
    siren: '',
    siret: '',
    raison_sociale: '',
    forme_societe: '',
    rcs: '',
    ape: '',
    activite: '',
    nature: '',
    tvaintracom: '',
    montant_capital_social: '',
    date_entree_cabinet: '',
    adr1_siege: '',
    adr2_siege: '',
    cpos_siege: '',
    ville_siege: '',
    pays_siege: '',
    tel_fixe: '',
    tel_portable: '',
    email: '',
    regime_fiscal: '',
    soumis_is: '',
    mois_cloture: '',
    logiciel_compta: '',
    taille_entreprise: '',
    zone_geographique_activite: '',
    volume_affaires_fourchette: '',
    mission_comptabilite: false,
    mission_audit: false,
    mission_sociale: false,
    mission_juridique: false,
    nature_relation_libre: '',
    kyc: {
      categorie_client: '' as '' | 'Personne_morale' | 'Personne_physique',
      civilite: '',
      nom_physique: '',
      prenom_physique: '',
      pays_residence_fiscale: '',
      pays_implantation: '',
      pays_a_risque_text: '',
      secteur_sensible: false,
      secteurs_text: '',
      pep_statut: '' as '' | 'Oui' | 'Non' | 'Inconnu',
      pep_details: '',
      origine_fonds_requise: false,
      origine_fonds_statut: '' as '' | 'Renseignee' | 'A_renseigner' | 'Non_applicable',
      complexite_structure: '' as '' | 'Simple' | 'Moyenne' | 'Complexe' | 'Inconnue',
      justification_complexite: '',
      exposition_sanctions: '' as '' | 'Oui' | 'Non' | 'Inconnu',
      notes: '',
    },
    statut_dossier: '',
    statut_kyc: '',
    niveau_risque: '',
    justification_risque_override: '',
    date_entree_relation: '',
    date_derniere_revue: '',
    date_prochaine_revue: '',
    periodicite_revue_mois: '',
    id_responsable_lab: '',
    commentaire_revision: '',
  };
}

export function emptyBe(id: string): WizardBeRow {
  return {
    id,
    nom: '',
    prenom: '',
    type: '',
    nationalite: '',
    pays_residence: '',
    pourcentage: '',
    mode_controle: '',
    pep_statut: '',
    sanctions_gel: '',
    commentaire: '',
  };
}

export function emptyPiece(id: string): WizardPieceRow {
  return {
    id,
    type_piece: '',
    titulaire: '',
    statut: '',
    date_delivrance: '',
    date_echeance: '',
    reference: '',
    commentaire: '',
  };
}

let uid = 0;

export function genWizardId(prefix: string): string {
  uid += 1;
  return `${prefix}-${uid}`;
}

export function isPersistedId(id: string): boolean {
  return /^\d+$/.test(String(id).trim());
}

export function hydrateClient(
  m: LabWizardFormModel,
  client: LabClientBloc,
  formatCollaborateurFn: (
    prenom: string | null | undefined,
    nom: string | null | undefined,
  ) => string,
): { expertDisplay: string; chefDisplay: string } {
  const siret = toInputStr(client.siret);
  m.code_client = toInputStr(client.code_client) || m.code_client;
  m.siret = siret;
  m.siren = extractSiren(siret);
  m.raison_sociale = toInputStr(client.raison_sociale);
  m.forme_societe = toInputStr(client.forme_societe);
  m.rcs = toInputStr(client.rcs);
  m.ape = toInputStr(client.ape);
  m.activite = toInputStr(client.activite);
  m.nature = toInputStr(client.nature);
  m.tvaintracom = toInputStr(client.tvaintracom);
  m.montant_capital_social = client.montant_capital_social != null
    ? String(client.montant_capital_social)
    : '';
  m.date_entree_cabinet = toInputDate(client.date_entree_cabinet);
  m.adr1_siege = toInputStr(client.adr1_siege);
  m.adr2_siege = toInputStr(client.adr2_siege);
  m.cpos_siege = toInputStr(client.cpos_siege);
  m.ville_siege = toInputStr(client.ville_siege);
  m.tel_fixe = toInputStr(client.tel_fixe);
  m.tel_portable = toInputStr(client.tel_portable);
  m.email = toInputStr(client.email);
  m.regime_fiscal = toInputStr(client.regime_fiscal);
  m.soumis_is = toInputStr(client.soumis_is);
  m.mois_cloture = client.mois_cloture != null ? String(client.mois_cloture) : '';
  m.logiciel_compta = toInputStr(client.logiciel_compta);
  return {
    expertDisplay: formatCollaborateurFn(
      client.expert_comptable_prenom,
      client.expert_comptable_nom,
    ),
    chefDisplay: formatCollaborateurFn(
      client.chef_de_mission_prenom,
      client.chef_de_mission_nom,
    ),
  };
}

export function hydrateLab(m: LabWizardFormModel, lab: LabDossierBloc): void {
  m.statut_dossier = toInputStr(lab.statut_dossier);
  m.statut_kyc = toInputStr(lab.statut_kyc);
  m.niveau_risque = mapNiveauRisqueForForm(lab.niveau_risque);
  m.date_entree_relation = toInputDate(lab.date_entree_relation);
  m.date_derniere_revue = toInputDate(lab.date_derniere_revue);
  m.date_prochaine_revue = toInputDate(lab.date_prochaine_revue);
  m.periodicite_revue_mois = lab.periodicite_revue_mois != null
    ? String(lab.periodicite_revue_mois)
    : '';
  m.id_responsable_lab = toInputStr(lab.id_responsable_lab);
  if (!m.date_entree_relation) {
    m.date_entree_relation = m.date_entree_cabinet;
  }
}

export function hydrateKyc(m: LabWizardFormModel, kyc: LabKycBloc | null): void {
  if (!kyc) return;

  const k = m.kyc;
  if (kyc.categorie_client) {
    k.categorie_client = kyc.categorie_client;
  }
  k.pays_residence_fiscale = toInputStr(kyc.pays_residence_fiscale);
  k.pays_implantation = toInputStr(kyc.pays_implantation);
  if (kyc.pays_a_risque?.length) {
    k.pays_a_risque_text = kyc.pays_a_risque.join('\n');
  }
  k.secteur_sensible = !!kyc.secteur_sensible;
  if (kyc.secteurs?.length) {
    k.secteurs_text = kyc.secteurs.join('\n');
  }
  if (kyc.pep_statut) {
    k.pep_statut = kyc.pep_statut;
  }
  k.pep_details = toInputStr(kyc.pep_details);
  k.origine_fonds_requise = !!kyc.origine_fonds_requise;
  if (kyc.origine_fonds_statut) {
    k.origine_fonds_statut = kyc.origine_fonds_statut;
  }
  if (kyc.complexite_structure) {
    k.complexite_structure = kyc.complexite_structure;
  }
  k.justification_complexite = toInputStr(kyc.justification_complexite);
  if (kyc.exposition_sanctions) {
    k.exposition_sanctions = kyc.exposition_sanctions;
  }
  k.notes = toInputStr(kyc.notes);

  if (!m.zone_geographique_activite && kyc.pays_implantation) {
    m.zone_geographique_activite = toInputStr(kyc.pays_implantation);
  }
  const volume = extractVolumeFromNotes(kyc.notes);
  if (volume) {
    m.volume_affaires_fourchette = volume;
  }

  hydrateWizardSupplement(m, kyc.wizard_supplement);
  applyLocalKycPrefill(m);
}

export function applyLocalKycPrefill(m: LabWizardFormModel): void {
  const k = m.kyc;
  if (!k.secteurs_text.trim() && m.activite.trim()) {
    k.secteurs_text = m.activite.trim();
  }
  if (!k.pays_implantation.trim() && m.pays_siege.trim()) {
    k.pays_implantation = m.pays_siege.trim();
  }
  if (!m.zone_geographique_activite.trim() && m.pays_siege.trim()) {
    m.zone_geographique_activite = m.pays_siege.trim();
  }
}

export function hydrateWizardSupplement(
  m: LabWizardFormModel,
  supplement: LabWizardSupplement | null | undefined,
): void {
  if (!supplement) return;

  if (supplement.pays_siege) {
    m.pays_siege = toInputStr(supplement.pays_siege);
  }
  if (supplement.taille_entreprise) {
    m.taille_entreprise = toInputStr(supplement.taille_entreprise);
  }
  if (supplement.mission_comptabilite != null) {
    m.mission_comptabilite = !!supplement.mission_comptabilite;
  }
  if (supplement.mission_audit != null) {
    m.mission_audit = !!supplement.mission_audit;
  }
  if (supplement.mission_sociale != null) {
    m.mission_sociale = !!supplement.mission_sociale;
  }
  if (supplement.mission_juridique != null) {
    m.mission_juridique = !!supplement.mission_juridique;
  }
  if (supplement.nature_relation_libre) {
    m.nature_relation_libre = toInputStr(supplement.nature_relation_libre);
  }
  if (supplement.secteur_sensible === true) {
    m.kyc.secteur_sensible = true;
  }
  if ('commentaire_revision' in supplement) {
    m.commentaire_revision = toInputStr(supplement.commentaire_revision);
  }

  const k = m.kyc;
  if (supplement.categorie_client === 'Personne_morale' || supplement.categorie_client === 'Personne_physique') {
    k.categorie_client = supplement.categorie_client;
  }
  if (supplement.civilite) {
    k.civilite = toInputStr(supplement.civilite);
  }
  if (supplement.nom_physique) {
    k.nom_physique = toInputStr(supplement.nom_physique);
  }
  if (supplement.prenom_physique) {
    k.prenom_physique = toInputStr(supplement.prenom_physique);
  }
  if (supplement.pays_residence_fiscale) {
    k.pays_residence_fiscale = toInputStr(supplement.pays_residence_fiscale);
  }
}

export function mapBeneficiaire(
  be: LabBeneficiaireEffectif,
  toInputStrFn: (value: unknown) => string = toInputStr,
): WizardBeRow {
  const type = be.type === 'Personne_morale' ? 'Personne_morale' : 'Personne_physique';
  const pep = be.pep_statut === 'Oui' || be.pep_statut === 'Non' || be.pep_statut === 'Inconnu'
    ? be.pep_statut
    : '';
  const sanctions = be.sanctions_gel === 'Oui' || be.sanctions_gel === 'Non' || be.sanctions_gel === 'Inconnu'
    ? be.sanctions_gel
    : '';
  const mode = be.mode_controle === 'Detention_capital'
    || be.mode_controle === 'Droits_vote'
    || be.mode_controle === 'Controle_de_fait'
    || be.mode_controle === 'Autre'
    ? be.mode_controle
    : '';

  return {
    id: be.id,
    nom: toInputStrFn(be.nom),
    prenom: toInputStrFn(be.prenom),
    type,
    nationalite: toInputStrFn(be.nationalite),
    pays_residence: toInputStrFn(be.pays_residence),
    pourcentage: be.pourcentage != null ? String(be.pourcentage) : '',
    mode_controle: mode,
    pep_statut: pep,
    sanctions_gel: sanctions,
    commentaire: toInputStrFn(be.commentaire),
  };
}

export function mapPiece(piece: LabPieceKyc): WizardPieceRow {
  const titulaire = piece.titulaire === 'Client'
    || piece.titulaire === 'BE'
    || piece.titulaire === 'Dirigeant'
    ? piece.titulaire
    : '';
  const statut = piece.statut === 'Recue'
    || piece.statut === 'Manquante'
    || piece.statut === 'Perimee'
    || piece.statut === 'Non_requise'
    ? piece.statut
    : '';

  return {
    id: piece.id,
    type_piece: toInputStr(piece.type_piece),
    titulaire,
    statut,
    date_delivrance: toInputDate(piece.date_delivrance),
    date_echeance: toInputDate(piece.date_echeance),
    reference: toInputStr(piece.reference),
    commentaire: toInputStr(piece.commentaire),
  };
}

export function hydrateBeneficiaires(
  rows: LabBeneficiaireEffectif[],
  mapFn: (be: LabBeneficiaireEffectif) => WizardBeRow,
): WizardBeRow[] | null {
  if (!rows.length) return null;
  return rows.map((be) => mapFn(be));
}

export function hydratePieces(
  rows: LabPieceKyc[],
  mapFn: (piece: LabPieceKyc) => WizardPieceRow,
): WizardPieceRow[] | null {
  if (!rows.length) return null;
  return rows.map((piece) => mapFn(piece));
}

export function hydrateFromDossier(
  m: LabWizardFormModel,
  data: LabDossierResponse,
  _genId: (prefix: string) => string,
): {
  hasExistingLabDossier: boolean;
  beneficiaires: WizardBeRow[] | null;
  pieces: WizardPieceRow[] | null;
  clientExpertComptableDisplay: string;
  clientChefDeMissionDisplay: string;
} {
  const hasExistingLabDossier = data.lab != null;
  const displays = hydrateClient(m, data.client, formatCollaborateur);
  if (data.lab) {
    hydrateLab(m, data.lab);
  }
  hydrateKyc(m, data.kyc);
  const beneficiaires = hydrateBeneficiaires(
    data.beneficiaires ?? [],
    (be) => mapBeneficiaire(be, toInputStr),
  );
  const pieces = hydratePieces(
    data.pieces ?? [],
    (piece) => mapPiece(piece),
  );
  return {
    hasExistingLabDossier,
    beneficiaires,
    pieces,
    clientExpertComptableDisplay: displays.expertDisplay,
    clientChefDeMissionDisplay: displays.chefDisplay,
  };
}

export function buildLabPayload(
  m: LabWizardFormModel,
  idRevue: string | null,
): LabCreateDossierRequest['lab'] & LabUpdateDossierRequest['lab'] {
  const periodicite = m.periodicite_revue_mois.trim()
    ? Number(m.periodicite_revue_mois)
    : undefined;
  const payload: LabCreateDossierRequest['lab'] & LabUpdateDossierRequest['lab'] = {
    statut_dossier: m.statut_dossier.trim() || 'Actif',
    statut_kyc: m.statut_kyc.trim() || 'Incomplet',
    id_responsable_lab: m.id_responsable_lab.trim() || null,
    date_entree_relation: m.date_entree_relation.trim() || null,
    periodicite_revue_mois: Number.isFinite(periodicite) ? periodicite : undefined,
  };
  if (!idRevue) {
    payload.date_derniere_revue = m.date_derniere_revue.trim() || null;
    payload.date_prochaine_revue = m.date_prochaine_revue.trim() || null;
  }
  return payload;
}

export function buildClientPayload(m: LabWizardFormModel): LabUpdateClientRequest {
  const capitalRaw = m.montant_capital_social.trim();
  const capital = capitalRaw ? Number(capitalRaw.replace(/\s/g, '').replace(',', '.')) : null;
  const moisRaw = m.mois_cloture.trim();
  const mois = moisRaw ? Number(moisRaw) : null;

  return {
    client: {
      siret: m.siret.trim() || null,
      raison_sociale: m.raison_sociale.trim() || null,
      forme_societe: m.forme_societe.trim() || null,
      rcs: m.rcs.trim() || null,
      ape: m.ape.trim() || null,
      activite: m.activite.trim() || null,
      nature: m.nature.trim() || null,
      tvaintracom: m.tvaintracom.trim() || null,
      montant_capital_social: capital != null && Number.isFinite(capital) ? capital : null,
      date_entree_cabinet: m.date_entree_cabinet.trim() || null,
      adr1_siege: m.adr1_siege.trim() || null,
      adr2_siege: m.adr2_siege.trim() || null,
      cpos_siege: m.cpos_siege.trim() || null,
      ville_siege: m.ville_siege.trim() || null,
      tel_fixe: m.tel_fixe.trim() || null,
      tel_portable: m.tel_portable.trim() || null,
      email: m.email.trim() || null,
      regime_fiscal: m.regime_fiscal.trim() || null,
      soumis_is: m.soumis_is.trim() || null,
      mois_cloture: mois != null && Number.isFinite(mois) ? mois : null,
      logiciel_compta: m.logiciel_compta.trim() || null,
    },
  };
}

export function buildWizardSupplement(m: LabWizardFormModel): LabWizardSupplement {
  const k = m.kyc;
  return {
    pays_siege: m.pays_siege.trim() || null,
    taille_entreprise: m.taille_entreprise.trim() || null,
    mission_comptabilite: m.mission_comptabilite,
    mission_audit: m.mission_audit,
    mission_sociale: m.mission_sociale,
    mission_juridique: m.mission_juridique,
    nature_relation_libre: m.nature_relation_libre.trim() || null,
    secteur_sensible: k.secteur_sensible,
    commentaire_revision: m.commentaire_revision.trim() || null,
    categorie_client: k.categorie_client || null,
    civilite: k.civilite.trim() || null,
    nom_physique: k.nom_physique.trim() || null,
    prenom_physique: k.prenom_physique.trim() || null,
    pays_residence_fiscale: k.pays_residence_fiscale.trim() || null,
  };
}

export function buildKycPayload(m: LabWizardFormModel): LabUpdateKycRequest {
  const k = m.kyc;
  const secteurs = k.secteurs_text
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const paysRisque = k.pays_a_risque_text
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const kyc: LabUpdateKycRequest['kyc'] = {
    categorie_client: k.categorie_client || undefined,
    pays_implantation: k.pays_implantation.trim() || m.zone_geographique_activite.trim() || undefined,
    pays_a_risque: paysRisque,
    secteur_sensible: k.secteur_sensible,
    secteurs,
    pep_statut: k.pep_statut || undefined,
    pep_details: k.pep_details.trim() || null,
    origine_fonds_requise: k.origine_fonds_requise,
    origine_fonds_statut: k.origine_fonds_statut || undefined,
    complexite_structure: k.complexite_structure || undefined,
    justification_complexite: k.justification_complexite.trim() || null,
    exposition_sanctions: k.exposition_sanctions || undefined,
    notes: k.notes.trim() || null,
    volume_affaires_estime: m.volume_affaires_fourchette.trim() || undefined,
  };

  return {
    kyc,
    lab: {
      statut_kyc: m.statut_kyc.trim() || 'Incomplet',
    },
    options: {
      zone_geographique_activite: m.zone_geographique_activite.trim() || undefined,
      volume_affaires_fourchette: m.volume_affaires_fourchette.trim() || undefined,
      secteur_activite: secteurs[0],
      wizard_supplement: buildWizardSupplement(m),
    },
  };
}

export function mapBeToUpdate(row: WizardBeRow): LabUpdateBeneficiaireRequest {
  return {
    nom: row.nom.trim(),
    prenom: row.prenom.trim() || null,
    nationalite: row.nationalite.trim() || null,
    pays_residence: row.pays_residence.trim() || null,
    pourcentage: row.pourcentage.trim() ? Number(row.pourcentage) : null,
    mode_controle: row.mode_controle || 'Autre',
    pep_statut: row.pep_statut || 'Non',
    sanctions_gel: row.sanctions_gel || 'Non',
    commentaire: row.commentaire.trim() || null,
    options: { creer_evenement_changement_be: true },
  };
}

export function mapPieceToUpdate(row: WizardPieceRow): LabUpdatePieceRequest {
  return {
    type_piece: row.type_piece.trim(),
    statut: row.statut || 'Manquante',
    date_delivrance: row.date_delivrance.trim() || null,
    date_echeance: row.date_echeance.trim() || null,
    reference: row.reference.trim() || null,
    titulaire: row.titulaire || 'Client',
    commentaire: row.commentaire.trim() || null,
  };
}

export function getBeneficiairesToUpdate(rows: WizardBeRow[]): WizardBeRow[] {
  return rows.filter((row) => isPersistedId(row.id) && row.nom.trim());
}

export function getPiecesToUpdate(rows: WizardPieceRow[]): WizardPieceRow[] {
  return rows.filter((row) => isPersistedId(row.id) && row.type_piece.trim());
}

export function getBeneficiairesToCreate(
  rows: WizardBeRow[],
  code: string,
): LabCreateBeneficiaireRequest[] {
  return rows
    .filter((row) => !isPersistedId(row.id) && row.nom.trim())
    .map((row) => ({
      code_client: code,
      nom: row.nom.trim(),
      prenom: row.prenom.trim() || null,
      nationalite: row.nationalite.trim() || null,
      pays_residence: row.pays_residence.trim() || null,
      pourcentage: row.pourcentage.trim() ? Number(row.pourcentage) : null,
      mode_controle: row.mode_controle || 'Autre',
      pep_statut: row.pep_statut || 'Non',
      sanctions_gel: row.sanctions_gel || 'Non',
      commentaire: row.commentaire.trim() || null,
      options: { creer_evenement_changement_be: true },
    }));
}

export function getPiecesToCreate(
  rows: WizardPieceRow[],
  code: string,
): LabCreatePieceRequest[] {
  return rows
    .filter((row) => !isPersistedId(row.id) && row.type_piece.trim())
    .map((row) => ({
      code_client: code,
      type_piece: row.type_piece.trim(),
      statut: row.statut || 'Manquante',
      date_delivrance: row.date_delivrance.trim() || null,
      date_echeance: row.date_echeance.trim() || null,
      reference: row.reference.trim() || null,
      titulaire: row.titulaire || 'Client',
      commentaire: row.commentaire.trim() || null,
    }));
}
