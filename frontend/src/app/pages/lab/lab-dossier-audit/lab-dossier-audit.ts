import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LabAuditItem } from '../../../services/lab-service';

@Component({
  selector: 'app-lab-dossier-audit',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lab-dossier-audit.html',
  styleUrls: ['../lab-dossier/lab-dossier.scss', './lab-dossier-audit.scss'],
})
export class LabDossierAuditComponent {
  @Input() audit: LabAuditItem[] = [];

  getAuditActionLabel(action: string | null | undefined): string {
    const key = action != null ? String(action).trim() : '';
    const labels: Record<string, string> = {
      CREATION_DOSSIER: 'Création du dossier',
      MODIF_DOSSIER: 'Modification du dossier',
      MODIF_CLIENT: 'Modification du client',
      CREATION_KYC: 'Création KYC',
      MODIF_KYC: 'Modification KYC',
      CREATION_BE: 'Ajout d’un bénéficiaire effectif',
      MODIF_BE: 'Modification d’un bénéficiaire effectif',
      SUPPRESSION_BE: 'Suppression d’un bénéficiaire effectif',
      CREATION_PIECE: 'Ajout d’une pièce',
      MODIF_PIECE: 'Modification d’une pièce',
      SUPPRESSION_PIECE: 'Suppression d’une pièce',
      CHANGEMENT_RISQUE: 'Changement de risque',
      GENERATION_PLAN_VIGILANCE: 'Génération du plan de vigilance',
      CREATION_EVENEMENT: 'Création d’un événement',
      DEMANDE_CLOTURE_EVENEMENT: 'Demande de clôture d’un événement',
      CLOTURE_EVENEMENT: 'Clôture d’un événement',
      REFUS_CLOTURE_EVENEMENT: 'Refus de clôture d’un événement',
      CREATION_DILIGENCE: 'Création d’une diligence',
      CLOTURE_DILIGENCE: 'Clôture d’une diligence',
      CREATION_REVUE: 'Lancement d’une revue',
      CLOTURE_REVUE: 'Clôture d’une revue',
      ANNULATION_REVUE: 'Annulation d’une revue',
      CREATION_CONVERSATION: 'Ouverture d’une discussion',
      CREATION_MESSAGE: 'Message de discussion',
      MODIF_MESSAGE: 'Modification d’un message',
      SUPPRESSION_MESSAGE: 'Suppression d’un message',
      ACTION_LAB: 'Action LAB',
    };
    return labels[key] || this.humanizeCode(key) || 'Action';
  }

  getAuditEntityLabel(entite: string | null | undefined): string {
    const raw = entite != null ? String(entite).trim() : '';
    if (!raw) return '';
    const match = raw.match(/^(lab_[a-z0-9_]+)\s*#?\s*(\d+)?$/i);
    const table = match?.[1] ?? raw.split(/\s+/)[0];
    const id = match?.[2] ?? (raw.includes('#') ? raw.split('#').pop()?.trim() : undefined);
    const tableLabels: Record<string, string> = {
      lab_dossier: 'Dossier',
      lab_kyc: 'KYC',
      lab_evenements: 'Événement',
      lab_diligences: 'Diligence',
      lab_revues: 'Revue',
      lab_pieces_kyc: 'Pièce',
      lab_beneficiaires_effectifs: 'Bénéficiaire effectif',
      lab_arpec_evaluations: 'Évaluation ARPEC',
      lab_conversations: 'Discussion',
      lab_messages: 'Message',
      clients: 'Client',
      lab: 'LAB',
    };
    const label = tableLabels[table] || this.humanizeCode(table);
    return id ? `${label} n°${id}` : label;
  }

  getAuditDetailsLabel(details: string | null | undefined): string {
    const raw = details != null ? String(details).trim() : '';
    if (!raw || raw === 'Action journalisée') return '';

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const parts: string[] = [];
        for (const [key, value] of Object.entries(parsed)) {
          if (value == null || value === '') continue;
          if (typeof value === 'object') continue;
          const field = this.auditDetailFieldLabel(key);
          const formatted = this.auditDetailValueLabel(key, value);
          if (field && formatted) parts.push(`${field} : ${formatted}`);
        }
        if (parts.length) return parts.join(' · ');
      }
    } catch {
      // texte libre
    }

    return raw;
  }

  private auditDetailFieldLabel(key: string): string {
    const labels: Record<string, string> = {
      type_evenement: 'Type',
      libelle: 'Libellé',
      criticite: 'Criticité',
      statut: 'Statut',
      intitule: 'Intitulé',
      type_diligence: 'Origine',
      date_echeance: 'Échéance',
      niveau_risque: 'Niveau de risque',
      vigilance: 'Vigilance',
      modulation: 'Modulation',
      type_revue: 'Type de revue',
      nb_creees: 'Diligences créées',
      nb_sautees: 'Déjà présentes',
      id_evaluation: 'Évaluation',
      motif_cloture: 'Motif de clôture',
      motif_refus: 'Motif de refus',
      conclusion: 'Conclusion',
      conclusion_risque: 'Conclusion',
    };
    return labels[key] || this.humanizeCode(key);
  }

  private auditDetailValueLabel(key: string, value: unknown): string {
    const text = String(value).trim();
    if (!text) return '';

    const valueLabels: Record<string, string> = {
      AUTRE: 'Autre',
      PIECE_MANQUANTE: 'Pièce manquante',
      PIECE_PERIMEE: 'Pièce périmée',
      CHANGEMENT_KYC: 'Changement KYC',
      CHANGEMENT_BE: 'Changement BE',
      CHANGEMENT_RISQUE: 'Changement de risque',
      TRANSACTION_ATYPIQUE: 'Transaction atypique',
      REVUE_ANNUELLE: 'Revue annuelle',
      PLAN_VIGILANCE: 'Plan de vigilance',
      ENTREE_RELATION: 'Entrée en relation',
      Ouvert: 'Ouvert',
      Cloture: 'Clôturé',
      En_cours: 'En cours',
      A_VALIDER: 'À valider',
      A_faire: 'À faire',
      Realisee: 'Réalisée',
      Abandonnee: 'Abandonnée',
      Moyenne: 'Moyenne',
      Elevee: 'Élevée',
      Faible: 'Faible',
      Standard: 'Standard',
      Renforcee: 'Renforcée',
      Manuelle: 'Manuelle',
      Annuelle: 'Annuelle',
      Hausse: 'Hausse',
      Baisse: 'Baisse',
      Conforme: 'Conforme',
      Élevé: 'Élevé',
      Eleve: 'Élevé',
    };

    if (key === 'type_diligence' || key === 'vigilance' || key === 'criticite' || key === 'statut' || key === 'type_evenement' || key === 'modulation' || key === 'niveau_risque' || key === 'type_revue') {
      return valueLabels[text] || this.humanizeCode(text);
    }
    return valueLabels[text] || text;
  }

  private humanizeCode(code: string): string {
    const clean = String(code || '').trim();
    if (!clean) return '';
    return clean
      .replace(/^lab_/i, '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase());
  }
}
