import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { LabCarteComponent } from '../lab-carte/lab-carte';
import { LabShellComponent } from '../lab-shell/lab-shell';
import {
  LabAxeItem,
  LabParametreItem,
  LabParametrageResponse,
  LabQuestionItem,
  LabService,
  LabUpdateParametrageRequest,
} from '../../../services/lab-service';

type OuiNon = 'Oui' | 'Non';
type NiveauRisqueOui = 'Moyen' | 'Élevé';

const PARAMETRES_CABINET_CODES = new Set([
  'PERIODICITE_REVUE_FAIBLE_MOIS',
  'PERIODICITE_REVUE_MOYEN_MOIS',
  'PERIODICITE_REVUE_ELEVE_MOIS',
  'SLA_DILIGENCE_JOURS',
  'SLA_REVUE_ALERTE_JOURS',
  'VERSION_REFERENTIEL',
  'ARPEC_D3_3_1',
  'ARPEC_D3_3_2',
  'ARPEC_D3_3_3',
  'ARPEC_D3_3_4',
  'ARPEC_D3_3_5',
  'ARPEC_D3_3_6',
  'ARPEC_D4_8',
  'CHAT_CONSERVATION_MOIS',
]);

interface ParametreRow {
  code_param: string;
  libelle: string;
  valeur: string;
  version: number | null;
}

interface QuestionRow {
  id: number;
  code_question: string;
  libelle: string;
  est_declencheur: OuiNon;
  niveau_risque_si_oui: NiveauRisqueOui;
  ordre_affichage: number;
  actif: OuiNon;
}

interface AxeGroupe {
  code: string;
  libelle: string;
  ordre: number;
  questions: QuestionRow[];
}

@Component({
  selector: 'app-lab-parametrage',
  standalone: true,
  imports: [CommonModule, FormsModule, LabCarteComponent, LabShellComponent],
  templateUrl: './lab-parametrage.html',
  styleUrls: ['./lab-parametrage.scss'],
})
export class LabParametrageComponent implements OnInit {
  loading = false;
  saving = false;
  forbidden = false;
  canReadParametrage = false;
  canEditParametrage = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  parametres: ParametreRow[] = [];
  axesGroupes: AxeGroupe[] = [];

  constructor(private labService: LabService) {}

  ngOnInit(): void {
    this.loading = true;
    this.labService.getMeLab().subscribe({
      next: (res) => {
        this.canReadParametrage = !!res.data?.canReadParametrage;
        this.canEditParametrage = !!res.data?.canEditParametrage;
        if (!this.canReadParametrage) {
          this.forbidden = true;
          this.errorMessage = 'Accès réservé à l\'équipe LAB';
          this.loading = false;
          return;
        }
        this.loadParametrage();
      },
      error: () => {
        this.canReadParametrage = false;
        this.canEditParametrage = false;
        this.forbidden = true;
        this.errorMessage = 'Accès réservé à l\'équipe LAB';
        this.loading = false;
      },
    });
  }

  save(): void {
    if (!this.canEditParametrage || this.saving || this.forbidden) return;

    this.saving = true;
    this.successMessage = null;
    this.errorMessage = null;

    const body: LabUpdateParametrageRequest = {
      parametrage: this.parametres.map((p) => ({
        code_param: p.code_param,
        valeur: p.valeur ?? '',
      })),
      questions: this.axesGroupes.flatMap((g) =>
        g.questions.map((q) => ({
          id: q.id,
          est_declencheur: this.toOn(q.est_declencheur),
          niveau_risque_si_oui: q.niveau_risque_si_oui,
          actif: this.toOn(q.actif),
          ordre_affichage: Number(q.ordre_affichage) || 0,
          libelle: q.libelle ?? '',
        })),
      ),
    };

    this.labService.updateParametrageLab(body).subscribe({
      next: (res) => {
        this.applyData(res.data);
        this.successMessage = 'Les paramètres ont été enregistrés.';
        this.saving = false;
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        if (err?.status === 403) {
          this.forbidden = true;
          this.canEditParametrage = false;
          this.errorMessage = 'Accès réservé à l\'équipe LAB';
          return;
        }
        this.errorMessage = 'Impossible d\'enregistrer les paramètres. Réessayez.';
      },
    });
  }

  displayValue(value: string | null | undefined): string {
    const v = value != null ? String(value).trim() : '';
    return v || '—';
  }

  private loadParametrage(): void {
    this.loading = true;
    this.errorMessage = null;
    this.labService.getParametrageLab().subscribe({
      next: (res) => {
        this.applyData(res.data);
        this.loading = false;
      },
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        if (err?.status === 403) {
          this.forbidden = true;
          this.canEditParametrage = false;
          this.errorMessage = 'Accès réservé à l\'équipe LAB';
          return;
        }
        this.errorMessage = 'Impossible de charger la modulation cabinet.';
      },
    });
  }

  private applyData(data: LabParametrageResponse | null | undefined): void {
    this.parametres = this.pickLatestParams(data?.parametrage || []);
    this.axesGroupes = this.buildAxeGroupes(data?.axes || [], data?.questions || []);
  }

  private pickLatestParams(items: LabParametreItem[]): ParametreRow[] {
    const byCode = new Map<string, LabParametreItem[]>();
    for (const item of items) {
      const code = (item.code_param || '').trim();
      if (!code || !PARAMETRES_CABINET_CODES.has(code)) continue;
      const group = byCode.get(code) || [];
      group.push(item);
      byCode.set(code, group);
    }

    const rows: ParametreRow[] = [];
    for (const [code, group] of byCode) {
      const actifs = group.filter((p) => p.actif === 'Oui');
      const pool = actifs.length ? actifs : group;
      pool.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
      const picked = pool[0];
      rows.push({
        code_param: code,
        libelle: (picked.libelle || '').trim() || code,
        valeur: picked.valeur ?? '',
        version: picked.version,
      });
    }

    rows.sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
    return rows;
  }

  private buildAxeGroupes(axes: LabAxeItem[], questions: LabQuestionItem[]): AxeGroupe[] {
    const axeByCode = new Map(axes.map((a) => [a.code, a]));
    const groups = new Map<string, AxeGroupe>();

    const ensure = (code: string): AxeGroupe => {
      let group = groups.get(code);
      if (!group) {
        const axe = axeByCode.get(code);
        group = {
          code,
          libelle: axe?.libelle || code,
          ordre: axe?.ordre_affichage ?? 999,
          questions: [],
        };
        groups.set(code, group);
      }
      return group;
    };

    for (const question of questions) {
      const code = (question.axe_code || '').trim() || 'AUTRE';
      ensure(code).questions.push(this.toQuestionRow(question));
    }

    for (const group of groups.values()) {
      group.questions.sort((a, b) => a.ordre_affichage - b.ordre_affichage);
    }

    return [...groups.values()].sort(
      (a, b) => a.ordre - b.ordre || a.libelle.localeCompare(b.libelle, 'fr'),
    );
  }

  private toQuestionRow(question: LabQuestionItem): QuestionRow {
    return {
      id: question.id,
      code_question: (question.code_question || '').trim(),
      libelle: question.libelle ?? '',
      est_declencheur: this.toOuiNon(question.est_declencheur),
      niveau_risque_si_oui: this.toNiveau(question.niveau_risque_si_oui),
      ordre_affichage: Number(question.ordre_affichage) || 0,
      actif: this.toOuiNon(question.actif),
    };
  }

  private toOuiNon(value: string | null | undefined): OuiNon {
    const v = (value || '').trim().toUpperCase();
    if (v === 'OUI' || v === 'O' || v === 'TRUE' || v === '1') return 'Oui';
    return 'Non';
  }

  private toOn(value: OuiNon): 'O' | 'N' {
    return value === 'Oui' ? 'O' : 'N';
  }

  private toNiveau(value: string | null | undefined): NiveauRisqueOui {
    const v = (value || '').trim().toLowerCase();
    if (v === 'élevé' || v === 'eleve' || v === 'élevée' || v === 'elevee') return 'Élevé';
    return 'Moyen';
  }
}
