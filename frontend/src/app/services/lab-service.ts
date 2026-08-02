import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface LabClientBloc {
  code_client: string;
  raison_sociale: string | null;
  forme_societe: string | null;
  siret: string | null;
  ape: string | null;
  activite: string | null;
  nature: string | null;
  rcs: string | null;
  tvaintracom: string | null;
  montant_capital_social: number | string | null;
  date_entree_cabinet: string | null;
  adr1_siege: string | null;
  adr2_siege: string | null;
  cpos_siege: string | null;
  ville_siege: string | null;
  tel_fixe: string | null;
  tel_portable: string | null;
  email: string | null;
  regime_fiscal: string | null;
  soumis_is: string | null;
  mois_cloture: number | string | null;
  logiciel_compta: string | null;
  expert_comptable: string | null;
  expert_comptable_nom: string | null;
  expert_comptable_prenom: string | null;
  chef_de_mission: string | null;
  chef_de_mission_nom: string | null;
  chef_de_mission_prenom: string | null;
}

export interface LabDossierBloc {
  id: number | null;
  code_client: string;
  statut_dossier: string | null;
  niveau_risque: string | null;
  vigilance: string | null;
  id_responsable_lab: string | null;
  responsable_lab_nom: string | null;
  responsable_lab_prenom: string | null;
  date_entree_relation: string | null;
  date_derniere_revue: string | null;
  date_prochaine_revue: string | null;
  periodicite_revue_mois: number | null;
  statut_kyc: string | null;
  date_creation: string | null;
  date_modification: string | null;
  cree_par: string | null;
  modifie_par: string | null;
  nb_evenements_ouverts: number;
  nb_diligences_retard: number;
}

export interface LabEvenement {
  id: string;
  type: string;
  date_creation: string | null;
  criticite: 'Faible' | 'Moyenne' | 'Elevee';
  statut: 'Ouvert' | 'En_cours' | 'Cloture';
  responsable: string;
  echeance: string | null;
  resume: string;
}

export interface LabDiligence {
  id: string;
  evenement_id: string | null;
  intitule: string;
  /** Origine du plan : Standard | Renforcee | Manuelle (null/autre → affichage « manuelle ») */
  type_diligence?: 'Standard' | 'Renforcee' | 'Manuelle' | string | null;
  responsable: string;
  statut: 'A_faire' | 'En_cours' | 'Realisee' | 'Abandonnee';
  date_echeance: string | null;
  preuve: string | null;
  commentaire: string | null;
}

export interface LabBeneficiaireEffectif {
  id: string;
  nom: string;
  prenom?: string | null;
  type: 'Personne_physique' | 'Personne_morale';
  nationalite: string | null;
  pays_residence: string | null;
  pourcentage: number | null;
  mode_controle: 'Detention_capital' | 'Droits_vote' | 'Controle_de_fait' | 'Autre';
  pep_statut: 'Oui' | 'Non' | 'Inconnu';
  sanctions_gel: 'Oui' | 'Non' | 'Inconnu';
  commentaire: string | null;
}

export interface LabPieceKyc {
  id: string;
  type_piece: string;
  titulaire: 'Client' | 'BE' | 'Dirigeant';
  statut: 'Recue' | 'Manquante' | 'Perimee' | 'Non_requise';
  date_delivrance: string | null;
  date_echeance: string | null;
  reference: string | null;
  commentaire: string | null;
}

export interface LabKycBloc {
  categorie_client: 'Personne_morale' | 'Personne_physique';
  pays_residence_fiscale: string | null;
  pays_implantation: string | null;
  pays_a_risque: string[];
  secteur_sensible: boolean;
  secteurs: string[];
  pep_statut: 'Oui' | 'Non' | 'Inconnu';
  pep_details: string | null;
  origine_fonds_requise: boolean;
  origine_fonds_statut: 'Renseignee' | 'A_renseigner' | 'Non_applicable';
  complexite_structure: 'Simple' | 'Moyenne' | 'Complexe' | 'Inconnue';
  justification_complexite: string | null;
  exposition_sanctions: 'Oui' | 'Non' | 'Inconnu';
  notes: string | null;
  wizard_supplement?: LabWizardSupplement | null;
}

export interface LabRevue {
  id: string;
  date: string | null;
  responsable: string;
  statut: 'En_cours' | 'Cloturee';
  conclusion: string | null;
  prochain_rdv: string | null;
  reponses?: Array<{
    code_question: string;
    libelle_question: string | null;
    reponse: string | null;
    commentaire: string | null;
  }>;
}

export interface LabRevueEnCours {
  id: number;
  id_evenement: number | null;
  date_revue: string | null;
  statut: 'En_cours';
  wizard_url: string;
}

export type LabManualEvenementType =
  | 'PIECE_MANQUANTE'
  | 'PIECE_PERIMEE'
  | 'CHANGEMENT_KYC'
  | 'TRANSACTION_ATYPIQUE'
  | 'AUTRE';

export interface LabCreateEvenementRequest {
  code_client: string;
  type_evenement: LabManualEvenementType | string;
  libelle?: string;
  criticite?: 'Faible' | 'Moyenne' | 'Elevee';
  statut?: 'Ouvert' | 'En_cours';
  date_echeance?: string | null;
  id_responsable?: string | null;
  diligences?: Array<{
    intitule: string;
    date_echeance?: string | null;
    type_diligence?: string;
  }>;
}

export interface LabUpdateEvenementRequest {
  libelle?: string;
  criticite?: 'Faible' | 'Moyenne' | 'Elevee';
  statut?: 'Ouvert' | 'En_cours';
  date_echeance?: string | null;
  id_responsable?: string | null;
}

export interface LabCloturerEvenementRequest {
  conclusion: string;
  tracfin_declare?: 'O' | 'N';
  tracfin_commentaire?: string | null;
}

export interface LabCreateDiligenceRequest {
  id_evenement: number | string;
  intitule: string;
  type_diligence?: string;
  date_echeance?: string | null;
  id_responsable?: string | null;
}

export interface LabUpdateDiligenceRequest {
  statut?: 'A_faire' | 'En_cours' | 'Realisee' | 'Abandonnee';
  date_echeance?: string | null;
  commentaires?: string | null;
  ref_piece_jointe?: string | null;
  motif_abandon?: string | null;
}

export interface LabCreateRevueRequest {
  code_client: string;
  date_revue?: string;
  id_responsable?: string | null;
}

export interface LabCreateRevueResponse {
  revue: {
    id: number;
    code_client: string;
    id_evenement: number;
    statut: string;
    date_revue: string | null;
  };
  evenement: {
    id: number;
    type_evenement: string;
    statut: string;
  };
  wizard_url: string;
}

export interface LabCloturerRevueRequest {
  commentaires_conclusion?: string | null;
  options?: {
    source?: string;
    bodacc_checklist?: Record<string, LabBodaccChecklistEntry>;
  };
}

export interface LabRevueDetailItem {
  id: number;
  code_client: string | null;
  id_evenement: number | null;
  type_revue: string;
  date_revue: string | null;
  statut: string;
  conclusion_risque: string | null;
  commentaires_conclusion: string | null;
  niveau_risque_avant: string | null;
  niveau_risque_apres: string | null;
  date_cloture: string | null;
  responsable: string;
  reponses: Array<{
    code_question: string;
    libelle_question: string | null;
    reponse: string | null;
    commentaire: string | null;
  }>;
}

export interface LabRisqueHistoriqueItem {
  id: string;
  date: string | null;
  niveau: 'Faible' | 'Moyen' | 'Eleve';
  origine: 'Calcul_auto' | 'Override_manuel';
  justification: string | null;
  utilisateur: string;
}

export interface LabAuditItem {
  id: string;
  date: string | null;
  utilisateur: string;
  action: string;
  entite: string;
  details: string;
}

export interface LabCreateDossierLabInput {
  statut_dossier?: string;
  niveau_risque?: string;
  id_responsable_lab?: string | null;
  date_entree_relation?: string | null;
  periodicite_revue_mois?: number;
  statut_kyc?: string;
  date_derniere_revue?: string | null;
  date_prochaine_revue?: string | null;
}

export interface LabCreateDossierRequest {
  code_client: string;
  lab?: LabCreateDossierLabInput;
  options?: {
    creer_evenement_entree?: boolean;
  };
}

export interface LabUpdateDossierLabInput {
  statut_dossier?: string;
  statut_kyc?: string;
  id_responsable_lab?: string | null;
  date_entree_relation?: string | null;
  periodicite_revue_mois?: number;
  date_derniere_revue?: string | null;
  date_prochaine_revue?: string | null;
}

export interface LabUpdateDossierRequest {
  lab?: LabUpdateDossierLabInput;
}

export interface LabUpdateClientInput {
  siret?: string | null;
  raison_sociale?: string | null;
  forme_societe?: string | null;
  rcs?: string | null;
  ape?: string | null;
  activite?: string | null;
  nature?: string | null;
  tvaintracom?: string | null;
  montant_capital_social?: number | string | null;
  date_entree_cabinet?: string | null;
  adr1_siege?: string | null;
  adr2_siege?: string | null;
  cpos_siege?: string | null;
  ville_siege?: string | null;
  tel_fixe?: string | null;
  tel_portable?: string | null;
  email?: string | null;
  regime_fiscal?: string | null;
  soumis_is?: string | null;
  mois_cloture?: number | string | null;
  logiciel_compta?: string | null;
  expert_comptable?: string | null;
  chef_de_mission?: string | null;
}

export interface LabUpdateClientRequest {
  client: LabUpdateClientInput;
}

export interface LabWizardSupplement {
  pays_siege?: string | null;
  taille_entreprise?: string | null;
  mission_comptabilite?: boolean;
  mission_audit?: boolean;
  mission_sociale?: boolean;
  mission_juridique?: boolean;
  nature_relation_libre?: string | null;
  /** Persisté dans lab_kyc.origine_patrimoine (JSON wizard_supplement), audit MODIF_KYC. */
  commentaire_revision?: string | null;
  categorie_client?: string | null;
  civilite?: string | null;
  nom_physique?: string | null;
  prenom_physique?: string | null;
  pays_residence_fiscale?: string | null;
}

export interface LabUpdateKycRequest {
  kyc?: Partial<LabKycBloc> & {
    secteurs_text?: string;
    pays_a_risque_text?: string;
    volume_affaires_estime?: string;
    operations_internationales?: boolean;
    lien_pep?: string;
    detail_lien_pep?: string | null;
  };
  lab?: {
    statut_kyc?: string;
  };
  options?: {
    zone_geographique_activite?: string;
    volume_affaires_fourchette?: string;
    secteur_activite?: string;
    operations_internationales?: boolean;
    wizard_supplement?: LabWizardSupplement;
  };
}

export interface LabCreateBeneficiaireRequest {
  code_client: string;
  nom: string;
  prenom?: string | null;
  nationalite?: string | null;
  pays_residence?: string | null;
  pourcentage?: number | null;
  mode_controle?: string;
  pep_statut?: string;
  sanctions_gel?: string;
  commentaire?: string | null;
  options?: {
    creer_evenement_changement_be?: boolean;
  };
}

export interface LabUpdateBeneficiaireRequest {
  nom: string;
  prenom?: string | null;
  nationalite?: string | null;
  pays_residence?: string | null;
  pourcentage?: number | null;
  mode_controle?: string;
  pep_statut?: string;
  sanctions_gel?: string;
  commentaire?: string | null;
  options?: {
    creer_evenement_changement_be?: boolean;
  };
}

export interface LabCreatePieceRequest {
  code_client: string;
  type_piece: string;
  statut?: string;
  date_delivrance?: string | null;
  date_echeance?: string | null;
  reference?: string | null;
  nom_fichier?: string | null;
  filepath?: string | null;
  titulaire?: string;
  commentaire?: string | null;
}

export interface LabUpdatePieceRequest {
  type_piece: string;
  statut?: string;
  date_delivrance?: string | null;
  date_echeance?: string | null;
  reference?: string | null;
  nom_fichier?: string | null;
  filepath?: string | null;
  titulaire?: string;
  commentaire?: string | null;
}

export interface LabPieceUploadResponse {
  nom_fichier: string;
  filepath: string;
}

export interface LabArpecReponseInput {
  code_question: string;
  reponse: 'O' | 'N';
  commentaire?: string | null;
}

export interface LabSaveArpecEvaluationRequest {
  code_client: string;
  reponses: LabArpecReponseInput[];
  modulation: 'Conforme' | 'Hausse' | 'Baisse';
  justification_modulation?: string | null;
  commentaire?: string | null;
}

export interface LabSaveArpecEvaluationResponse {
  code_client: string;
  niveau_calcule: string;
  niveau_retenu: string;
  modulation: string;
  vigilance: string;
  axes: Array<{ code: string; nb_oui: number; niveau: string }>;
}

export interface LabArpecEvaluationData {
  code_client: string;
  date_evaluation: string | null;
  niveau_calcule: string;
  niveau_retenu: string;
  modulation: 'Conforme' | 'Hausse' | 'Baisse';
  justification_modulation?: string | null;
  vigilance: string;
  commentaire?: string | null;
  axes: Array<{ code: string; nb_oui: number; niveau: string }>;
  reponses: Array<{ code_question: string; reponse: 'O' | 'N'; commentaire?: string | null }>;
}

export interface LabArpecQuestionDef {
  code: string;
  libelle: string;
  sousAxe?: string;
  estDeclencheur: boolean;
  niveauSiOui: 'Moyen' | 'Élevé';
}

export interface LabArpecAxeDef {
  code: string;
  libelle: string;
  questions: LabArpecQuestionDef[];
}

export interface LabArpecQuestionnaireData {
  axes: LabArpecAxeDef[];
}

export interface LabDossierResponse {
  client: LabClientBloc;
  lab: LabDossierBloc | null;
  kyc: LabKycBloc | null;
  beneficiaires: LabBeneficiaireEffectif[];
  pieces: LabPieceKyc[];
  evenements: LabEvenement[];
  diligences: LabDiligence[];
  revues: LabRevue[];
  risqueHistorique: LabRisqueHistoriqueItem[];
  audit: LabAuditItem[];
  revue_en_cours?: LabRevueEnCours | null;
}

export interface LabDashboardResponse {
  kpi: {
    totalClients: number;
    pctRisqueEleve: number;
    vigilanceRenforcee: number;
    evenementsOuverts: number;
    diligencesEnRetard: number;
    revuesEnRetard: number;
  };
  histogramRisque: Array<{ label: string; value: number; color?: 'green' | 'orange' | 'red' | 'neutral' }>;
  histogramVigilance: Array<{ label: string; value: number; color?: 'green' | 'orange' | 'red' | 'neutral' }>;
  histogramSecteur: Array<{ label: string; value: number; color?: 'green' | 'orange' | 'red' | 'neutral' }>;
  histogramPays: Array<{ label: string; value: number; color?: 'green' | 'orange' | 'red' | 'neutral' }>;
  evenementsCritiquesOuverts: Array<{
    client: string;
    type: string;
    criticite: 'Faible' | 'Moyenne' | 'Élevée';
    date: string | null;
  }>;
  revuesEnRetardListe: Array<{
    client: string;
    echeanceDepassee: string | null;
    retardJours: number;
  }>;
  diligencesEnRetardListe: Array<{
    client: string;
    responsable: string;
    echeance: string | null;
    retardJours: number;
  }>;
}

export interface LabListResponse<T> {
  data: T[];
  total: number;
}

export interface LabPagedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LabDossiersQuery {
  search?: string;
  niveau?: 'Faible' | 'Moyen' | 'Eleve' | 'NonEvalue';
  vigilance?: 'Standard' | 'Renforcee';
  revue?: 'late' | 'soon';
  kyc?: 'Complet' | 'Incomplet';
  secteur?: string;
  pays?: string;
  page?: number;
  pageSize?: number;
}

export interface LabDashboardQuery {
  collaborateur?: string;
  date_debut?: string;
  date_fin?: string;
}

export interface LabDossierListItem {
  id: number;
  code_client: string | null;
  raison_sociale: string | null;
  siret: string | null;
  secteur_activite: string | null;
  zone_geographique_principale: string | null;
  niveau_risque: string | null;
  vigilance: string | null;
  statut_kyc: string | null;
  statut_dossier: string | null;
  date_derniere_revue: string | null;
  date_prochaine_revue: string | null;
  responsable_lab: string;
  nb_evenements_ouverts: number;
  nb_diligences_retard: number;
}

export interface LabEvenementListItem {
  id: number;
  code_client: string | null;
  client: string | null;
  type_evenement: string | null;
  libelle: string | null;
  criticite: string;
  statut: string | null;
  date_evenement: string | null;
  date_echeance: string | null;
  responsable: string;
  nb_diligences: number;
}

export interface LabDiligenceListItem {
  id: number;
  id_evenement: number;
  code_client: string | null;
  client: string | null;
  type_evenement: string | null;
  intitule: string | null;
  type_diligence: string | null;
  responsable: string;
  date_echeance: string | null;
  statut: string | null;
  date_realisation: string | null;
  commentaires: string | null;
  ref_piece_jointe: string | null;
}

export interface LabTransactionItem {
  id: number;
  code_client: string | null;
  client: string | null;
  id_evenement: number | null;
  type_evenement: string | null;
  fec_annee: number | null;
  fec_ecriture_num: string | null;
  fec_ecriture_date: string | null;
  fec_montant: number | null;
  fec_libelle: string | null;
  fec_journal_code: string | null;
  motif_atypique: string | null;
  statut: string | null;
  signale_par: string;
  date_signalement: string | null;
}

export interface LabTracfinItem {
  id: number;
  code_client: string | null;
  client: string | null;
  id_evenement: number | null;
  type_evenement: string | null;
  nature_soupcon: string | null;
  description_operations: string | null;
  montants_concernes: string | null;
  periode_concernee_debut: string | null;
  periode_concernee_fin: string | null;
  diligences_effectuees: string | null;
  statut: string | null;
  date_declaration: string | null;
  reference_declaration: string | null;
  declare_par: string;
}

export interface LabParametrageResponse {
  parametrage: Array<{
    id: number;
    code_param: string | null;
    libelle: string | null;
    valeur: string | null;
    version: number | null;
    actif: 'Oui' | 'Non' | 'Inconnu';
    date_modification: string | null;
    modifie_par: string | null;
  }>;
  criteres: Array<{
    id: number;
    code_critere: string | null;
    libelle: string | null;
    ponderation: number | null;
    actif: 'Oui' | 'Non' | 'Inconnu';
    ordre_affichage: number | null;
  }>;
  valeurs_ref: Array<{
    id: number;
    id_critere: number;
    code_critere: string | null;
    valeur: string | null;
    libelle: string | null;
    niveau_risque: 'Faible' | 'Moyen' | 'Eleve';
    score: number | null;
  }>;
}

export type LabFieldMetaStatus = 'empty' | 'bdd' | 'prefilled' | 'divergence';

export interface LabFieldMeta {
  value: string | null;
  source: string | null;
  sourceLabel: string | null;
  fetchedAt: string | null;
  status: LabFieldMetaStatus;
  bddValue: string | null;
  apiValue: string | null;
  apiSource: string | null;
  apiSourceLabel: string | null;
}

export interface LabBodaccAlerte {
  id: string;
  date: string | null;
  famille: string | null;
  type: string | null;
  tribunal: string | null;
  resume: string | null;
  source: string;
  fetchedAt: string;
  lienBodacc?: string | null;
  gravite: 'faible' | 'moyenne' | 'elevee';
  familleLabel: string;
  actionGuide: string;
  etapeWizard: string;
  etapeLabel: string;
  typeEvenementLab: string | null;
  diligenceSuggeree: string;
  masquerParDefaut: boolean;
}

export type LabBodaccChecklistStatut = 'a_traiter' | 'traite' | 'sans_suite';

export interface LabBodaccChecklistEntry {
  statut: LabBodaccChecklistStatut;
  commentaire: string;
  traiteLe: string | null;
}

export interface LabEnrichissementResponse {
  ok: boolean;
  fetchedAt: string;
  siren: string;
  siret: string;
  fields: Record<string, LabFieldMeta>;
  merged: Record<string, unknown>;
  divergences: Array<LabFieldMeta & { field: string }>;
  alertesBodacc: LabBodaccAlerte[];
  sources: Record<string, {
    ok?: boolean;
    skipped?: boolean;
    error?: string | null;
    fetchedAt?: string;
    proceduresCollectives?: number;
  }>;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class LabService {
  private http = inject(HttpClient);

  getDossiersRisqueLab(codesClients: string[]): Observable<{ data: any }> {
    return this.http.post<{ data: any }>(`/api/lab/dossiers-risque`, { codes: codesClients });
  }

  getResumeLab(codeClient: string): Observable<{ data: any }> {
    return this.http.get<{ data: any }>(`/api/lab/resume`, {
      params: { code_client: String(codeClient).trim() }
    });
  }

  getDossierLab(codeClient: string): Observable<{ data: LabDossierResponse | null }> {
    return this.http.get<{ data: LabDossierResponse | null }>(`/api/lab/dossier`, {
      params: { code_client: String(codeClient).trim() }
    });
  }

  createDossierLab(body: LabCreateDossierRequest): Observable<{ data: LabDossierResponse }> {
    return this.http.post<{ data: LabDossierResponse }>(`/api/lab/dossier`, body);
  }

  updateDossierLab(
    codeClient: string,
    body: LabUpdateDossierRequest,
  ): Observable<{ data: LabDossierResponse }> {
    return this.http.put<{ data: LabDossierResponse }>(`/api/lab/dossier`, body, {
      params: { code_client: String(codeClient).trim() },
    });
  }

  updateClientLab(
    codeClient: string,
    body: LabUpdateClientRequest,
  ): Observable<{ data: LabClientBloc }> {
    return this.http.put<{ data: LabClientBloc }>(`/api/lab/client`, body, {
      params: { code_client: String(codeClient).trim() },
    });
  }

  updateKycLab(
    codeClient: string,
    body: LabUpdateKycRequest,
  ): Observable<{ data: { kyc: LabKycBloc | null; lab: { statut_kyc: string | null } | null } }> {
    return this.http.put<{ data: { kyc: LabKycBloc | null; lab: { statut_kyc: string | null } | null } }>(
      `/api/lab/kyc`,
      body,
      { params: { code_client: String(codeClient).trim() } },
    );
  }

  createBeneficiaireLab(
    body: LabCreateBeneficiaireRequest,
  ): Observable<{ data: { beneficiaire: LabBeneficiaireEffectif; evenement?: { id: number; type: string } | null } }> {
    return this.http.post<{ data: { beneficiaire: LabBeneficiaireEffectif; evenement?: { id: number; type: string } | null } }>(
      `/api/lab/beneficiaires`,
      body,
    );
  }

  updateBeneficiaireLab(
    id: string | number,
    body: LabUpdateBeneficiaireRequest,
  ): Observable<{ data: { beneficiaire: LabBeneficiaireEffectif; evenement?: { id: number; type: string } | null } }> {
    return this.http.put<{ data: { beneficiaire: LabBeneficiaireEffectif; evenement?: { id: number; type: string } | null } }>(
      `/api/lab/beneficiaires`,
      body,
      { params: { id: String(id).trim() } },
    );
  }

  deleteBeneficiaireLab(
    id: string | number,
  ): Observable<{ data: { id: string; code_client: string }; message: string }> {
    return this.http.delete<{ data: { id: string; code_client: string }; message: string }>(
      `/api/lab/beneficiaires`,
      { params: { id: String(id).trim() } },
    );
  }

  createPieceLab(
    body: LabCreatePieceRequest,
  ): Observable<{ data: { piece: LabPieceKyc } }> {
    return this.http.post<{ data: { piece: LabPieceKyc } }>(`/api/lab/pieces`, body);
  }

  uploadPieceKycFile(
    codeClient: string,
    file: File,
  ): Observable<{ data: LabPieceUploadResponse }> {
    const formData = new FormData();
    formData.append('code_client', String(codeClient).trim());
    formData.append('file', file, file.name);
    return this.http.post<{ data: LabPieceUploadResponse }>(`/api/lab/pieces/upload`, formData);
  }

  updatePieceLab(
    id: string | number,
    body: LabUpdatePieceRequest,
  ): Observable<{ data: { piece: LabPieceKyc } }> {
    return this.http.put<{ data: { piece: LabPieceKyc } }>(
      `/api/lab/pieces`,
      body,
      { params: { id: String(id).trim() } },
    );
  }

  deletePieceLab(
    id: string | number,
  ): Observable<{ data: { id: string; code_client: string }; message: string }> {
    return this.http.delete<{ data: { id: string; code_client: string }; message: string }>(
      `/api/lab/pieces`,
      { params: { id: String(id).trim() } },
    );
  }

  getArpecEvaluation(codeClient: string): Observable<{ data: LabArpecEvaluationData }> {
    return this.http.get<{ data: LabArpecEvaluationData }>(`/api/lab/arpec/evaluation`, {
      params: { code_client: codeClient.trim() },
    });
  }

  getArpecQuestionnaire(): Observable<{ data: LabArpecQuestionnaireData }> {
    return this.http.get<{ data: LabArpecQuestionnaireData }>(`/api/lab/arpec/questionnaire`);
  }

  saveArpecEvaluation(
    body: LabSaveArpecEvaluationRequest,
  ): Observable<{ data: LabSaveArpecEvaluationResponse }> {
    return this.http.post<{ data: LabSaveArpecEvaluationResponse }>(`/api/lab/arpec/evaluation`, body);
  }

  getDashboardLab(params: LabDashboardQuery = {}): Observable<{ data: LabDashboardResponse }> {
    const query: Record<string, string> = {};
    if (params.collaborateur?.trim()) query['collaborateur'] = params.collaborateur.trim();
    if (params.date_debut?.trim()) query['date_debut'] = params.date_debut.trim();
    if (params.date_fin?.trim()) query['date_fin'] = params.date_fin.trim();
    return this.http.get<{ data: LabDashboardResponse }>(`/api/lab/dashboard`, { params: query });
  }

  getDossiersLab(params: LabDossiersQuery = {}): Observable<LabPagedResponse<LabDossierListItem>> {
    const query: Record<string, string> = {};
    if (params.search?.trim()) query['search'] = params.search.trim();
    if (params.niveau) query['niveau'] = params.niveau;
    if (params.vigilance) query['vigilance'] = params.vigilance;
    if (params.revue) query['revue'] = params.revue;
    if (params.kyc) query['kyc'] = params.kyc;
    if (params.secteur?.trim()) query['secteur'] = params.secteur.trim();
    if (params.pays?.trim()) query['pays'] = params.pays.trim();
    if (params.page != null) query['page'] = String(params.page);
    if (params.pageSize != null) query['pageSize'] = String(params.pageSize);
    return this.http.get<LabPagedResponse<LabDossierListItem>>(`/api/lab/dossiers`, { params: query });
  }

  getEvenementsLab(params: Record<string, string> = {}): Observable<LabListResponse<LabEvenementListItem>> {
    return this.http.get<LabListResponse<LabEvenementListItem>>(`/api/lab/evenements`, { params });
  }

  getDiligencesLab(params: Record<string, string> = {}): Observable<LabListResponse<LabDiligenceListItem>> {
    return this.http.get<LabListResponse<LabDiligenceListItem>>(`/api/lab/diligences`, { params });
  }

  getTransactionsLab(params: Record<string, string> = {}): Observable<LabListResponse<LabTransactionItem>> {
    return this.http.get<LabListResponse<LabTransactionItem>>(`/api/lab/transactions`, { params });
  }

  getTracfinLab(params: Record<string, string> = {}): Observable<LabListResponse<LabTracfinItem>> {
    return this.http.get<LabListResponse<LabTracfinItem>>(`/api/lab/tracfin`, { params });
  }

  getParametrageLab(): Observable<{ data: LabParametrageResponse }> {
    return this.http.get<{ data: LabParametrageResponse }>(`/api/lab/parametrage`);
  }

  getEnrichissementLab(params: {
    siret?: string;
    siren?: string;
    code_client?: string;
  }): Observable<{ data: LabEnrichissementResponse }> {
    const query: Record<string, string> = {};
    if (params.siret?.trim()) query['siret'] = params.siret.trim();
    if (params.siren?.trim()) query['siren'] = params.siren.trim();
    if (params.code_client?.trim()) query['code_client'] = params.code_client.trim();
    return this.http.get<{ data: LabEnrichissementResponse }>(`/api/lab/enrichissement`, { params: query });
  }

  createEvenementLab(body: LabCreateEvenementRequest): Observable<{ data: LabEvenementListItem }> {
    return this.http.post<{ data: LabEvenementListItem }>(`/api/lab/evenements`, body);
  }

  updateEvenementLab(
    id: string | number,
    body: LabUpdateEvenementRequest,
  ): Observable<{ data: LabEvenementListItem }> {
    return this.http.put<{ data: LabEvenementListItem }>(`/api/lab/evenements`, body, {
      params: { id: String(id).trim() },
    });
  }

  cloturerEvenementLab(
    id: string | number,
    body: LabCloturerEvenementRequest,
  ): Observable<{ data: LabEvenementListItem }> {
    return this.http.post<{ data: LabEvenementListItem }>(`/api/lab/evenements/cloturer`, body, {
      params: { id: String(id).trim() },
    });
  }

  createDiligenceLab(body: LabCreateDiligenceRequest): Observable<{ data: LabDiligenceListItem }> {
    return this.http.post<{ data: LabDiligenceListItem }>(`/api/lab/diligences`, body);
  }

  updateDiligenceLab(
    id: string | number,
    body: LabUpdateDiligenceRequest,
  ): Observable<{ data: LabDiligenceListItem }> {
    return this.http.put<{ data: LabDiligenceListItem }>(`/api/lab/diligences`, body, {
      params: { id: String(id).trim() },
    });
  }

  createRevueLab(body: LabCreateRevueRequest): Observable<{ data: LabCreateRevueResponse }> {
    return this.http.post<{ data: LabCreateRevueResponse }>(`/api/lab/revues`, body);
  }

  getRevuesLab(codeClient: string): Observable<LabListResponse<LabRevueDetailItem>> {
    return this.http.get<LabListResponse<LabRevueDetailItem>>(`/api/lab/revues`, {
      params: { code_client: String(codeClient).trim() },
    });
  }

  cloturerRevueLab(
    id: string | number,
    body: LabCloturerRevueRequest,
  ): Observable<{ data: unknown }> {
    return this.http.put<{ data: unknown }>(`/api/lab/revues/cloturer`, body, {
      params: { id: String(id).trim() },
    });
  }

  annulerRevueLab(id: string | number): Observable<{ data: unknown }> {
    return this.http.post<{ data: unknown }>(`/api/lab/revues/annuler`, {}, {
      params: { id: String(id).trim() },
    });
  }

  /**
   * Régénère le plan de vigilance (diligences auto) pour un dossier.
   * Usage futur / debug — pas de CTA obligatoire dans l’UI MVP.
   */
  genererPlanVigilanceLab(
    code_client: string,
  ): Observable<{ data: unknown }> {
    return this.http.post<{ data: unknown }>(`/api/lab/plan-vigilance/generer`, {
      code_client: String(code_client).trim(),
    });
  }
}
