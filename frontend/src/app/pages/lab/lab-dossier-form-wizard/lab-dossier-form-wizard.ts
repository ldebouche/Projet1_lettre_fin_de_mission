import { Component, DestroyRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { LabCarteComponent } from '../lab-carte/lab-carte';
import {
  LabBeneficiaireEffectif,
  LabBodaccAlerte,
  LabClientBloc,
  LabDossierBloc,
  LabDossierResponse,
  LabEnrichissementResponse,
  LabFieldMeta,
  LabCreateBeneficiaireRequest,
  LabCreateDossierRequest,
  LabCreatePieceRequest,
  LabKycBloc,
  LabPieceKyc,
  LabService,
  LabUpdateBeneficiaireRequest,
  LabUpdateClientRequest,
  LabUpdateDossierRequest,
  LabUpdateKycRequest,
  LabUpdatePieceRequest,
  LabWizardSupplement,
} from '../../../services/lab-service';
import { LabWizardFieldMetaComponent } from '../lab-wizard-field-meta/lab-wizard-field-meta';
import { LabBodaccChecklistComponent } from '../lab-bodacc-checklist/lab-bodacc-checklist';
import { LabEvaluationRisqueComponent } from '../lab-evaluation-risque/lab-evaluation-risque';

/** Ligne bénéficiaire effectif — alignée sur le mock `LabBeneficiaireEffectif` du dossier LAB. */
export type WizardBeRow = {
  id: string;
  nom: string;
  prenom: string;
  type: '' | 'Personne_physique' | 'Personne_morale';
  nationalite: string;
  pays_residence: string;
  pourcentage: string;
  mode_controle: '' | 'Detention_capital' | 'Droits_vote' | 'Controle_de_fait' | 'Autre';
  pep_statut: '' | 'Oui' | 'Non' | 'Inconnu';
  sanctions_gel: '' | 'Oui' | 'Non' | 'Inconnu';
  commentaire: string;
};

/** Ligne pièce KYC — alignée sur `LabPieceKyc`. */
export type WizardPieceRow = {
  id: string;
  type_piece: string;
  titulaire: '' | 'Client' | 'BE' | 'Dirigeant';
  statut: '' | 'Recue' | 'Manquante' | 'Perimee' | 'Non_requise';
  date_delivrance: string;
  date_echeance: string;
  reference: string;
  commentaire: string;
};

function toInputDate(value: string | Date | null | undefined): string {
  if (value == null) return '';
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s) return '';
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function toInputStr(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function extractSiren(siret: string | null | undefined): string {
  const s = toInputStr(siret).replace(/\s/g, '');
  return s.length >= 9 ? s.slice(0, 9) : s;
}

function mapNiveauRisqueForForm(niveau: string | null | undefined): string {
  const n = toInputStr(niveau);
  if (n === 'Eleve' || n === 'Élevé' || n === 'Elevé') return 'Élevé';
  if (n === 'Moyen') return 'Moyen';
  if (n === 'Faible') return 'Faible';
  return n;
}

function extractVolumeFromNotes(notes: string | null | undefined): string {
  if (!notes) return '';
  const match = notes.match(/Volume d'affaires estime:\s*(.+?)(?:\s*\||$)/i);
  return match ? match[1].trim() : '';
}

const ENRICHABLE_STRING_FIELDS = [
  'siren',
  'siret',
  'raison_sociale',
  'forme_societe',
  'rcs',
  'ape',
  'activite',
  'nature',
  'tvaintracom',
  'montant_capital_social',
  'adr1_siege',
  'adr2_siege',
  'cpos_siege',
  'ville_siege',
  'pays_siege',
  'taille_entreprise',
  'zone_geographique_activite',
  'volume_affaires_fourchette',
] as const;

type EnrichableStringField = (typeof ENRICHABLE_STRING_FIELDS)[number];

function isEnrichableStringField(key: string): key is EnrichableStringField {
  return (ENRICHABLE_STRING_FIELDS as readonly string[]).includes(key);
}

/**
 * Formulaire multi-étapes création / révision dossier LAB — périmètre aligné sur specs LAB (client + KYC + BE + pièces + dossier).
 */
@Component({
  selector: 'app-lab-dossier-form-wizard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    LabCarteComponent,
    LabWizardFieldMetaComponent,
    LabBodaccChecklistComponent,
    LabEvaluationRisqueComponent,
  ],
  templateUrl: './lab-dossier-form-wizard.html',
  styleUrls: ['./lab-dossier-form-wizard.scss'],
})
export class LabDossierFormWizardComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private labService = inject(LabService);
  private destroyRef = inject(DestroyRef);

  codeClient: string | null = null;
  returnTo: string | null = null;
  idRevue: string | null = null;
  /** Entrée depuis dashboard « dossiers en attente » — revue/acceptation sans id_revue obligatoire. */
  isAcceptationMode = false;
  loading = false;
  enriching = false;
  errorMessage: string | null = null;
  enrichmentError: string | null = null;
  hasExistingLabDossier = false;
  fieldMeta: Record<string, LabFieldMeta> = {};
  alertesBodacc: LabBodaccAlerte[] = [];
  enrichmentSources: LabEnrichissementResponse['sources'] | null = null;
  divergenceCount = 0;
  bodaccChecklistWarning: string | null = null;
  submitError: string | null = null;
  submitting = false;
  step1Saving = false;
  revueActionBusy = false;
  bodaccPendingCritical = 0;
  private loadedCode: string | null = null;

  @ViewChild('bodaccChecklist') bodaccChecklist?: LabBodaccChecklistComponent;
  @ViewChild('evalRisque') evalRisque?: LabEvaluationRisqueComponent;

  bodaccSectionOpen = false;

  /** Anciennes étapes wizard → ancres de la page Dossier client (étape 1). */
  private readonly sectionAnchorByWizardStep: Record<string, string> = {
    identifiants: 'section-identifiants',
    bodacc: 'section-bodacc',
    identite: 'section-identite',
    coordonnees: 'section-coordonnees',
    'fiscal-profil': 'section-fiscal',
    kyc: 'section-kyc',
    be: 'section-be',
    pieces: 'section-pieces',
    lab: 'section-affectation',
  };

  private uid = 0;
  private genId(prefix: string): string {
    this.uid += 1;
    return `${prefix}-${this.uid}`;
  }

  stepIndex = 0;

  readonly steps: { id: string; label: string; hint: string }[] = [
    {
      id: 'dossier-client',
      label: 'Dossier client',
      hint: 'Identifiants, enrichissement, KYC, BE, pièces, affectation',
    },
    {
      id: 'evaluation-risque',
      label: 'Évaluation du risque',
      hint: 'Questionnaire ARPEC D1–D5 (NPLAB)',
    },
  ];

  readonly pieceTypePresets = [
    'Extrait KBIS / INSEE',
    'Statuts à jour',
    'Pièce d’identité dirigeant',
    'RIB',
    'Organigramme / chaîne de détention',
    'Justificatif domicile',
    'Autre',
  ];

  m = {
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

  /** Libellés équipe cabinet — lecture seule, source table clients (hors périmètre wizard). */
  clientExpertComptableDisplay = '—';
  clientChefDeMissionDisplay = '—';

  beneficiaires: WizardBeRow[] = [this.emptyBe()];
  pieces: WizardPieceRow[] = [this.emptyPiece()];
  private deletedBeneficiaireIds: string[] = [];
  private deletedPieceIds: string[] = [];

  ngOnInit(): void {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const code = params.get('code_client')?.trim() || null;
        this.returnTo = params.get('returnTo')?.trim() || null;
        this.idRevue = params.get('id_revue')?.trim() || null;
        this.isAcceptationMode = (params.get('mode')?.trim() || '').toLowerCase() === 'acceptation';
        this.applyCodeClient(code);
      });
  }

  private applyCodeClient(code: string | null): void {
    this.codeClient = code;
    this.submitError = null;
    if (!code) {
      this.loadedCode = null;
      return;
    }
    if (code === this.loadedCode) return;
    this.loadedCode = code;
    this.stepIndex = 0;
    this.m.code_client = code;
    this.loadDossier(code);
  }

  private loadDossier(codeClient: string): void {
    this.loading = true;
    this.errorMessage = null;

    this.labService.getDossierLab(codeClient).subscribe({
      next: (res: { data: LabDossierResponse | null }) => {
        const data = res?.data ?? null;
        if (!data?.client) {
          this.errorMessage = 'Aucune donnée client trouvée pour ce code.';
        } else {
          this.hydrateFromDossier(data);
          if (this.hasExistingLabDossier && !this.idRevue && !this.isAcceptationMode) {
            this.errorMessage =
              'Révision impossible : paramètre id_revue manquant. Lancez ou reprenez la revue depuis le plan & suivi.';
          } else {
            void this.enrichFromPublicApis();
          }
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Erreur chargement dossier LAB (formulaire):', err);
        this.loading = false;
        this.errorMessage = 'Impossible de charger les données existantes.';
      },
    });
  }

  private hydrateFromDossier(data: LabDossierResponse): void {
    this.hasExistingLabDossier = data.lab != null;
    this.deletedBeneficiaireIds = [];
    this.deletedPieceIds = [];
    this.hydrateClient(data.client);
    if (data.lab) {
      this.hydrateLab(data.lab);
    }
    this.hydrateKyc(data.kyc);
    this.hydrateBeneficiaires(data.beneficiaires ?? []);
    this.hydratePieces(data.pieces ?? []);
    this.initFieldMetaFromForm();
  }

  private initFieldMetaFromForm(): void {
    const now = new Date().toISOString();
    const enrichable: Array<{ key: string; value: string }> = [
      { key: 'siren', value: this.m.siren },
      { key: 'siret', value: this.m.siret },
      { key: 'raison_sociale', value: this.m.raison_sociale },
      { key: 'forme_societe', value: this.m.forme_societe },
      { key: 'rcs', value: this.m.rcs },
      { key: 'ape', value: this.m.ape },
      { key: 'activite', value: this.m.activite },
      { key: 'nature', value: this.m.nature },
      { key: 'tvaintracom', value: this.m.tvaintracom },
      { key: 'montant_capital_social', value: this.m.montant_capital_social },
      { key: 'adr1_siege', value: this.m.adr1_siege },
      { key: 'adr2_siege', value: this.m.adr2_siege },
      { key: 'cpos_siege', value: this.m.cpos_siege },
      { key: 'ville_siege', value: this.m.ville_siege },
      { key: 'pays_siege', value: this.m.pays_siege },
      { key: 'taille_entreprise', value: this.m.taille_entreprise },
      { key: 'zone_geographique_activite', value: this.m.zone_geographique_activite },
      { key: 'volume_affaires_fourchette', value: this.m.volume_affaires_fourchette },
      { key: 'kyc.pays_implantation', value: this.m.kyc.pays_implantation },
      { key: 'kyc.secteurs_text', value: this.m.kyc.secteurs_text },
    ];

    for (const { key, value } of enrichable) {
      const v = toInputStr(value);
      if (!v) continue;
      this.fieldMeta[key] = {
        value: v,
        source: 'BDD',
        sourceLabel: 'BDD',
        fetchedAt: now,
        status: 'bdd',
        bddValue: v,
        apiValue: null,
        apiSource: null,
        apiSourceLabel: null,
      };
    }
  }

  enrichFromPublicApis(): void {
    const siret = toInputStr(this.m.siret).replace(/\s/g, '');
    const siren = toInputStr(this.m.siren).replace(/\s/g, '') || (siret.length >= 9 ? siret.slice(0, 9) : '');
    if (!siret && siren.length !== 9) {
      this.enrichmentError = 'Saisissez un SIREN (9 chiffres) ou SIRET (14 chiffres) pour enrichir.';
      return;
    }

    this.enriching = true;
    this.enrichmentError = null;

    this.labService.getEnrichissementLab({
      siret: siret || undefined,
      siren: siren || undefined,
      code_client: this.m.code_client || this.codeClient || undefined,
    }).subscribe({
      next: (res) => {
        this.applyEnrichment(res.data);
        this.enriching = false;
      },
      error: (err) => {
        console.error('Erreur enrichissement LAB:', err);
        this.enriching = false;
        this.enrichmentError = err?.error?.error || 'Enrichissement depuis les registres publics impossible.';
      },
    });
  }

  private applyEnrichment(data: LabEnrichissementResponse): void {
    if (!data?.ok) {
      this.enrichmentError = data?.error || 'Enrichissement impossible.';
      return;
    }

    this.fieldMeta = { ...this.fieldMeta, ...(data.fields ?? {}) };
    this.alertesBodacc = data.alertesBodacc ?? [];
    this.enrichmentSources = data.sources ?? null;
    this.divergenceCount = data.divergences?.length ?? 0;
    this.bodaccPendingCritical = (data.alertesBodacc ?? []).filter((a) => a.gravite === 'elevee').length;

    const merged = data.merged ?? {};
    this.applyMergedValue('siren', merged['siren']);
    this.applyMergedValue('siret', merged['siret']);
    this.applyMergedValue('raison_sociale', merged['raison_sociale']);
    this.applyMergedValue('forme_societe', merged['forme_societe']);
    this.applyMergedValue('rcs', merged['rcs']);
    this.applyMergedValue('ape', merged['ape']);
    this.applyMergedValue('activite', merged['activite']);
    this.applyMergedValue('nature', merged['nature']);
    this.applyMergedValue('tvaintracom', merged['tvaintracom']);
    this.applyMergedValue('montant_capital_social', merged['montant_capital_social']);
    this.applyMergedValue('adr1_siege', merged['adr1_siege']);
    this.applyMergedValue('adr2_siege', merged['adr2_siege']);
    this.applyMergedValue('cpos_siege', merged['cpos_siege']);
    this.applyMergedValue('ville_siege', merged['ville_siege']);
    this.applyMergedValue('pays_siege', merged['pays_siege']);
    this.applyMergedValue('taille_entreprise', merged['taille_entreprise']);
    this.applyMergedValue('zone_geographique_activite', merged['zone_geographique_activite']);
    this.applyMergedValue('volume_affaires_fourchette', merged['volume_affaires_fourchette']);

    const kycMerged = merged['kyc'] as Record<string, unknown> | undefined;
    if (kycMerged) {
      if (kycMerged['pays_implantation']) {
        this.m.kyc.pays_implantation = String(kycMerged['pays_implantation']);
      }
      if (kycMerged['secteurs_text']) {
        this.m.kyc.secteurs_text = String(kycMerged['secteurs_text']);
      }
    }
  }

  private applyMergedValue(field: EnrichableStringField, value: unknown): void {
    if (value == null || value === '') return;
    this.m[field] = String(value);
  }

  getFieldMeta(key: string): LabFieldMeta | null {
    return this.fieldMeta[key] ?? null;
  }

  acceptApiValue(fieldKey: string): void {
    const meta = this.fieldMeta[fieldKey];
    if (!meta?.apiValue) return;

    if (fieldKey === 'kyc.pays_implantation') {
      this.m.kyc.pays_implantation = meta.apiValue;
    } else if (fieldKey === 'kyc.secteurs_text') {
      this.m.kyc.secteurs_text = meta.apiValue;
    } else if (isEnrichableStringField(fieldKey)) {
      this.m[fieldKey] = meta.apiValue;
    }

    this.fieldMeta[fieldKey] = {
      ...meta,
      value: meta.apiValue,
      source: meta.apiSource,
      sourceLabel: meta.apiSourceLabel,
      status: 'prefilled',
      bddValue: meta.bddValue,
    };
    this.divergenceCount = Object.values(this.fieldMeta).filter((f) => f.status === 'divergence').length;
  }

  onSiretBlur(): void {
    const siret = toInputStr(this.m.siret).replace(/\s/g, '');
    if (siret.length === 14) {
      this.m.siren = siret.slice(0, 9);
      void this.enrichFromPublicApis();
    }
  }

  private hydrateClient(client: LabClientBloc): void {
    const siret = toInputStr(client.siret);
    this.m.code_client = toInputStr(client.code_client) || this.m.code_client;
    this.m.siret = siret;
    this.m.siren = extractSiren(siret);
    this.m.raison_sociale = toInputStr(client.raison_sociale);
    this.m.forme_societe = toInputStr(client.forme_societe);
    this.m.rcs = toInputStr(client.rcs);
    this.m.ape = toInputStr(client.ape);
    this.m.activite = toInputStr(client.activite);
    this.m.nature = toInputStr(client.nature);
    this.m.tvaintracom = toInputStr(client.tvaintracom);
    this.m.montant_capital_social = client.montant_capital_social != null
      ? String(client.montant_capital_social)
      : '';
    this.m.date_entree_cabinet = toInputDate(client.date_entree_cabinet);
    this.m.adr1_siege = toInputStr(client.adr1_siege);
    this.m.adr2_siege = toInputStr(client.adr2_siege);
    this.m.cpos_siege = toInputStr(client.cpos_siege);
    this.m.ville_siege = toInputStr(client.ville_siege);
    this.m.tel_fixe = toInputStr(client.tel_fixe);
    this.m.tel_portable = toInputStr(client.tel_portable);
    this.m.email = toInputStr(client.email);
    this.m.regime_fiscal = toInputStr(client.regime_fiscal);
    this.m.soumis_is = toInputStr(client.soumis_is);
    this.m.mois_cloture = client.mois_cloture != null ? String(client.mois_cloture) : '';
    this.m.logiciel_compta = toInputStr(client.logiciel_compta);
    this.clientExpertComptableDisplay = this.formatCollaborateur(
      client.expert_comptable_prenom,
      client.expert_comptable_nom,
    );
    this.clientChefDeMissionDisplay = this.formatCollaborateur(
      client.chef_de_mission_prenom,
      client.chef_de_mission_nom,
    );
  }

  private hydrateLab(lab: LabDossierBloc): void {
    this.m.statut_dossier = toInputStr(lab.statut_dossier);
    this.m.statut_kyc = toInputStr(lab.statut_kyc);
    this.m.niveau_risque = mapNiveauRisqueForForm(lab.niveau_risque);
    this.m.date_entree_relation = toInputDate(lab.date_entree_relation);
    this.m.date_derniere_revue = toInputDate(lab.date_derniere_revue);
    this.m.date_prochaine_revue = toInputDate(lab.date_prochaine_revue);
    this.m.periodicite_revue_mois = lab.periodicite_revue_mois != null
      ? String(lab.periodicite_revue_mois)
      : '';
    this.m.id_responsable_lab = toInputStr(lab.id_responsable_lab);
    if (!this.m.date_entree_relation) {
      this.m.date_entree_relation = this.m.date_entree_cabinet;
    }
  }

  private hydrateKyc(kyc: LabKycBloc | null): void {
    if (!kyc) return;

    const k = this.m.kyc;
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

    if (!this.m.zone_geographique_activite && kyc.pays_implantation) {
      this.m.zone_geographique_activite = toInputStr(kyc.pays_implantation);
    }
    const volume = extractVolumeFromNotes(kyc.notes);
    if (volume) {
      this.m.volume_affaires_fourchette = volume;
    }

    this.hydrateWizardSupplement(kyc.wizard_supplement);
  }

  private hydrateWizardSupplement(supplement: LabWizardSupplement | null | undefined): void {
    if (!supplement) return;

    if (supplement.pays_siege) {
      this.m.pays_siege = toInputStr(supplement.pays_siege);
    }
    if (supplement.taille_entreprise) {
      this.m.taille_entreprise = toInputStr(supplement.taille_entreprise);
    }
    if (supplement.mission_comptabilite != null) {
      this.m.mission_comptabilite = !!supplement.mission_comptabilite;
    }
    if (supplement.mission_audit != null) {
      this.m.mission_audit = !!supplement.mission_audit;
    }
    if (supplement.mission_sociale != null) {
      this.m.mission_sociale = !!supplement.mission_sociale;
    }
    if (supplement.mission_juridique != null) {
      this.m.mission_juridique = !!supplement.mission_juridique;
    }
    if (supplement.nature_relation_libre) {
      this.m.nature_relation_libre = toInputStr(supplement.nature_relation_libre);
    }
    if ('commentaire_revision' in supplement) {
      this.m.commentaire_revision = toInputStr(supplement.commentaire_revision);
    }

    const k = this.m.kyc;
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

  private hydrateBeneficiaires(rows: LabBeneficiaireEffectif[]): void {
    if (!rows.length) return;

    this.beneficiaires = rows.map((be) => this.mapBeneficiaire(be));
  }

  private mapBeneficiaire(be: LabBeneficiaireEffectif): WizardBeRow {
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
      nom: toInputStr(be.nom),
      prenom: toInputStr(be.prenom),
      type,
      nationalite: toInputStr(be.nationalite),
      pays_residence: toInputStr(be.pays_residence),
      pourcentage: be.pourcentage != null ? String(be.pourcentage) : '',
      mode_controle: mode,
      pep_statut: pep,
      sanctions_gel: sanctions,
      commentaire: toInputStr(be.commentaire),
    };
  }

  private hydratePieces(rows: LabPieceKyc[]): void {
    if (!rows.length) return;

    this.pieces = rows.map((piece) => this.mapPiece(piece));
  }

  private mapPiece(piece: LabPieceKyc): WizardPieceRow {
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

  get isPm(): boolean {
    return this.m.kyc.categorie_client !== 'Personne_physique';
  }

  emptyBe(): WizardBeRow {
    return {
      id: this.genId('be'),
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

  emptyPiece(): WizardPieceRow {
    return {
      id: this.genId('pc'),
      type_piece: '',
      titulaire: '',
      statut: '',
      date_delivrance: '',
      date_echeance: '',
      reference: '',
      commentaire: '',
    };
  }

  addBeneficiaire(): void {
    this.beneficiaires = [...this.beneficiaires, this.emptyBe()];
  }

  removeBeneficiaire(id: string): void {
    if (this.isPersistedId(id)) {
      this.deletedBeneficiaireIds = [...this.deletedBeneficiaireIds, id];
    }
    const next = this.beneficiaires.filter((b) => b.id !== id);
    this.beneficiaires = next.length ? next : [this.emptyBe()];
  }

  addPiece(): void {
    this.pieces = [...this.pieces, this.emptyPiece()];
  }

  removePiece(id: string): void {
    if (this.isPersistedId(id)) {
      this.deletedPieceIds = [...this.deletedPieceIds, id];
    }
    const next = this.pieces.filter((p) => p.id !== id);
    this.pieces = next.length ? next : [this.emptyPiece()];
  }

  trackById(_index: number, row: { id: string }): string {
    return row.id;
  }

  get isFirstStep(): boolean {
    return this.stepIndex <= 0;
  }

  get isLastStep(): boolean {
    return this.stepIndex >= this.steps.length - 1;
  }

  goPrev(): void {
    if (!this.isFirstStep) this.stepIndex--;
  }

  async goNext(): Promise<void> {
    if (this.isLastStep || this.step1Saving) return;

    if (this.stepIndex === 0) {
      const pending = this.bodaccChecklist?.pendingCriticalCount ?? this.bodaccPendingCritical;
      if (pending > 0) {
        this.bodaccChecklistWarning = `${pending} annonce(s) BODACC critique(s) non traitées — vous pouvez poursuivre (non bloquant).`;
        this.bodaccSectionOpen = true;
      } else {
        this.bodaccChecklistWarning = null;
      }

      const code = (this.m.code_client || this.codeClient || '').trim();
      if (!code) {
        this.submitError = 'Code client requis pour enregistrer le dossier.';
        return;
      }

      this.submitError = null;
      this.step1Saving = true;

      try {
        await this.persistStep1(code);
        this.stepIndex++;
      } catch (err: unknown) {
        console.error('Erreur sauvegarde intermédiaire étape 1 wizard LAB:', err);
        this.submitError = this.formatSubmitApiError(err);
      } finally {
        this.step1Saving = false;
      }
      return;
    }

    this.stepIndex++;
  }

  onBodaccProgressChange(pendingCritical: number): void {
    this.bodaccPendingCritical = pendingCritical;
  }

  goToWizardStep(stepId: string): void {
    this.stepIndex = 0;
    const anchor = this.sectionAnchorByWizardStep[stepId] ?? `section-${stepId}`;
    if (anchor === 'section-bodacc') {
      this.bodaccSectionOpen = true;
    }
    setTimeout(() => {
      document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  onBodaccSectionToggle(open: boolean): void {
    this.bodaccSectionOpen = open;
  }

  private isPersistedId(id: string): boolean {
    return /^\d+$/.test(String(id).trim());
  }

  private buildLabPayload(): LabCreateDossierRequest['lab'] & LabUpdateDossierRequest['lab'] {
    const periodicite = this.m.periodicite_revue_mois.trim()
      ? Number(this.m.periodicite_revue_mois)
      : undefined;
    const payload: LabCreateDossierRequest['lab'] & LabUpdateDossierRequest['lab'] = {
      statut_dossier: this.m.statut_dossier.trim() || 'Actif',
      statut_kyc: this.m.statut_kyc.trim() || 'Incomplet',
      id_responsable_lab: this.m.id_responsable_lab.trim() || null,
      date_entree_relation: this.m.date_entree_relation.trim() || null,
      periodicite_revue_mois: Number.isFinite(periodicite) ? periodicite : undefined,
    };
    if (!this.idRevue) {
      payload.date_derniere_revue = this.m.date_derniere_revue.trim() || null;
      payload.date_prochaine_revue = this.m.date_prochaine_revue.trim() || null;
    }
    return payload;
  }

  private buildClientPayload(): LabUpdateClientRequest {
    const capitalRaw = this.m.montant_capital_social.trim();
    const capital = capitalRaw ? Number(capitalRaw.replace(/\s/g, '').replace(',', '.')) : null;
    const moisRaw = this.m.mois_cloture.trim();
    const mois = moisRaw ? Number(moisRaw) : null;

    return {
      client: {
        siret: this.m.siret.trim() || null,
        raison_sociale: this.m.raison_sociale.trim() || null,
        forme_societe: this.m.forme_societe.trim() || null,
        rcs: this.m.rcs.trim() || null,
        ape: this.m.ape.trim() || null,
        activite: this.m.activite.trim() || null,
        nature: this.m.nature.trim() || null,
        tvaintracom: this.m.tvaintracom.trim() || null,
        montant_capital_social: capital != null && Number.isFinite(capital) ? capital : null,
        date_entree_cabinet: this.m.date_entree_cabinet.trim() || null,
        adr1_siege: this.m.adr1_siege.trim() || null,
        adr2_siege: this.m.adr2_siege.trim() || null,
        cpos_siege: this.m.cpos_siege.trim() || null,
        ville_siege: this.m.ville_siege.trim() || null,
        tel_fixe: this.m.tel_fixe.trim() || null,
        tel_portable: this.m.tel_portable.trim() || null,
        email: this.m.email.trim() || null,
        regime_fiscal: this.m.regime_fiscal.trim() || null,
        soumis_is: this.m.soumis_is.trim() || null,
        mois_cloture: mois != null && Number.isFinite(mois) ? mois : null,
        logiciel_compta: this.m.logiciel_compta.trim() || null,
      },
    };
  }

  private buildWizardSupplement(): LabWizardSupplement {
    const k = this.m.kyc;
    return {
      pays_siege: this.m.pays_siege.trim() || null,
      taille_entreprise: this.m.taille_entreprise.trim() || null,
      mission_comptabilite: this.m.mission_comptabilite,
      mission_audit: this.m.mission_audit,
      mission_sociale: this.m.mission_sociale,
      mission_juridique: this.m.mission_juridique,
      nature_relation_libre: this.m.nature_relation_libre.trim() || null,
      commentaire_revision: this.m.commentaire_revision.trim() || null,
      categorie_client: k.categorie_client || null,
      civilite: k.civilite.trim() || null,
      nom_physique: k.nom_physique.trim() || null,
      prenom_physique: k.prenom_physique.trim() || null,
      pays_residence_fiscale: k.pays_residence_fiscale.trim() || null,
    };
  }

  private buildKycPayload(): LabUpdateKycRequest {
    const k = this.m.kyc;
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
      pays_implantation: k.pays_implantation.trim() || this.m.zone_geographique_activite.trim() || undefined,
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
      volume_affaires_estime: this.m.volume_affaires_fourchette.trim() || undefined,
    };

    return {
      kyc,
      lab: {
        statut_kyc: this.m.statut_kyc.trim() || 'Incomplet',
      },
      options: {
        zone_geographique_activite: this.m.zone_geographique_activite.trim() || undefined,
        volume_affaires_fourchette: this.m.volume_affaires_fourchette.trim() || undefined,
        secteur_activite: secteurs[0],
        wizard_supplement: this.buildWizardSupplement(),
      },
    };
  }

  private mapBeToUpdate(row: WizardBeRow): LabUpdateBeneficiaireRequest {
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

  private mapPieceToUpdate(row: WizardPieceRow): LabUpdatePieceRequest {
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

  private getBeneficiairesToUpdate(): WizardBeRow[] {
    return this.beneficiaires.filter((row) => this.isPersistedId(row.id) && row.nom.trim());
  }

  private getPiecesToUpdate(): WizardPieceRow[] {
    return this.pieces.filter((row) => this.isPersistedId(row.id) && row.type_piece.trim());
  }

  private getBeneficiairesToCreate(): LabCreateBeneficiaireRequest[] {
    const code = (this.m.code_client || this.codeClient || '').trim();
    return this.beneficiaires
      .filter((row) => !this.isPersistedId(row.id) && row.nom.trim())
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

  private getPiecesToCreate(): LabCreatePieceRequest[] {
    const code = (this.m.code_client || this.codeClient || '').trim();
    return this.pieces
      .filter((row) => !this.isPersistedId(row.id) && row.type_piece.trim())
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

  private async persistStep1(codeClient: string): Promise<void> {
    await firstValueFrom(this.labService.updateClientLab(codeClient, this.buildClientPayload()));

    const lab = this.buildLabPayload();

    if (this.hasExistingLabDossier) {
      await firstValueFrom(this.labService.updateDossierLab(codeClient, { lab }));
    } else {
      const body: LabCreateDossierRequest = {
        code_client: codeClient,
        lab,
        options: { creer_evenement_entree: true },
      };
      await firstValueFrom(this.labService.createDossierLab(body));
      this.hasExistingLabDossier = true;
    }

    await firstValueFrom(this.labService.updateKycLab(codeClient, this.buildKycPayload()));

    for (const beId of this.deletedBeneficiaireIds) {
      await firstValueFrom(this.labService.deleteBeneficiaireLab(beId));
    }
    this.deletedBeneficiaireIds = [];

    for (const row of this.getBeneficiairesToUpdate()) {
      await firstValueFrom(this.labService.updateBeneficiaireLab(row.id, this.mapBeToUpdate(row)));
    }

    for (const be of this.getBeneficiairesToCreate()) {
      const res = await firstValueFrom(this.labService.createBeneficiaireLab(be));
      if (res.data?.beneficiaire?.id) {
        const match = this.beneficiaires.find((r) => r.nom.trim() === be.nom && !this.isPersistedId(r.id));
        if (match) match.id = res.data.beneficiaire.id;
      }
    }

    for (const pieceId of this.deletedPieceIds) {
      await firstValueFrom(this.labService.deletePieceLab(pieceId));
    }
    this.deletedPieceIds = [];

    for (const row of this.getPiecesToUpdate()) {
      await firstValueFrom(this.labService.updatePieceLab(row.id, this.mapPieceToUpdate(row)));
    }

    for (const piece of this.getPiecesToCreate()) {
      const res = await firstValueFrom(this.labService.createPieceLab(piece));
      if (res.data?.piece?.id) {
        const match = this.pieces.find((r) => r.type_piece.trim() === piece.type_piece && !this.isPersistedId(r.id));
        if (match) match.id = res.data.piece.id;
      }
    }
  }

  private async persistStep2(codeClient: string): Promise<void> {
    if (!this.evalRisque) {
      throw new Error('Évaluation du risque indisponible');
    }
    const payload = this.evalRisque.getSubmitPayload();
    payload.code_client = codeClient;
    await firstValueFrom(this.labService.saveArpecEvaluation(payload));
    try {
      localStorage.removeItem(`lab-arpec-eval:${codeClient}`);
    } catch {
      // ignore
    }
  }

  private formatSubmitApiError(err: unknown): string {
    const apiErr = err as { error?: { error?: string }; message?: string };
    return apiErr?.error?.error || apiErr?.message || 'Enregistrement impossible.';
  }

  private formatStep2SubmitError(err: unknown): string {
    const apiErr = err as { error?: { error?: string }; message?: string; status?: number };
    const message = this.formatSubmitApiError(err);
    const retryHint = 'Cliquez sur « Valider et ouvrir le plan de vigilance » pour réessayer.';
    if (apiErr?.status === 503) {
      return `${message} — Le dossier client est enregistré ; l’évaluation ARPEC nécessite le schéma lab_arpec_* en base. ${retryHint}`;
    }
    return `${message} — Le dossier client est enregistré ; corrigez l’évaluation du risque si besoin. ${retryHint}`;
  }

  get isRevisionSession(): boolean {
    return !!this.idRevue;
  }

  async annulerRevue(): Promise<void> {
    if (!this.idRevue || this.revueActionBusy) return;
    if (
      !confirm(
        'Annuler la revue ? Les modifications seront annulées et l\'état au lancement sera restauré.',
      )
    ) {
      return;
    }

    this.revueActionBusy = true;
    this.submitError = null;

    try {
      await firstValueFrom(this.labService.annulerRevueLab(this.idRevue));
      const code = (this.m.code_client || this.codeClient || '').trim();
      const queryParams: Record<string, string> = {};
      if (code) queryParams['code_client'] = code;
      if (this.returnTo) queryParams['returnTo'] = this.returnTo;
      await this.router.navigate(['/lab/dossier'], { queryParams });
    } catch (err: unknown) {
      console.error('Erreur annulation revue LAB:', err);
      this.submitError = this.formatSubmitApiError(err);
    } finally {
      this.revueActionBusy = false;
    }
  }

  async submitWizard(): Promise<void> {
    this.submitError = null;

    const pendingCritical = this.bodaccChecklist?.pendingCriticalCount ?? this.bodaccPendingCritical;
    if (pendingCritical > 0) {
      this.stepIndex = 0;
      this.bodaccSectionOpen = true;
      this.submitError =
        `${pendingCritical} annonce(s) BODACC critique(s) non traitées — validation impossible.`;
      return;
    }

    const evalCmp = this.evalRisque;
    if (!evalCmp?.validateEvaluation()) {
      this.stepIndex = this.steps.length - 1;
      this.submitError =
        evalCmp?.validationError ??
        'Complétez le questionnaire ARPEC (54 questions OUI/NON) avant de valider.';
      return;
    }

    const code = (this.m.code_client || this.codeClient || '').trim();
    if (!code) {
      this.submitError = 'Code client requis pour enregistrer le dossier.';
      return;
    }

    this.submitting = true;

    try {
      try {
        await this.persistStep1(code);
      } catch (err: unknown) {
        console.error('Erreur étape 1 wizard LAB:', err);
        this.submitError = this.formatSubmitApiError(err);
        return;
      }

      try {
        await this.persistStep2(code);
      } catch (err: unknown) {
        console.error('Erreur étape 2 wizard LAB (ARPEC):', err);
        this.stepIndex = this.steps.length - 1;
        this.submitError = this.formatStep2SubmitError(err);
        return;
      }

      if (this.idRevue) {
        try {
          await firstValueFrom(this.labService.cloturerRevueLab(this.idRevue, {
            commentaires_conclusion: this.m.commentaire_revision.trim() || null,
            options: {
              source: 'wizard_revision',
              bodacc_checklist: this.bodaccChecklist?.exportChecklistState() ?? {},
            },
          }));
        } catch (err: unknown) {
          console.error('Erreur clôture revue LAB:', err);
          this.submitError = this.formatSubmitApiError(err);
          return;
        }
      }

      const queryParams: Record<string, string> = { code_client: code };
      if (this.returnTo) queryParams['returnTo'] = this.returnTo;
      await this.router.navigate(['/lab/dossier'], { queryParams });
    } finally {
      this.submitting = false;
    }
  }

  /** Formate un nom de collaborateur (prénom + nom) — aligné sur lab-dossier. */
  formatCollaborateur(prenom: string | null | undefined, nom: string | null | undefined): string {
    const p = prenom != null ? String(prenom).trim() : '';
    const n = nom != null ? String(nom).trim() : '';
    const full = [p, n].filter((x) => x !== '').join(' ');
    return full !== '' ? full : '—';
  }
}
