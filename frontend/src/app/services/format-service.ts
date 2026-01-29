import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FormatService {
  formatPayload(obj: any, parentKey?: string): any {
    const formatNumber = (val: any, key?: string) => {
      if (typeof val === 'boolean') return val;
      if (typeof val !== 'number' || isNaN(val)) return val;

      if (key && (key.includes('%') || key.includes('VA/MS') || key.includes('pct'))) {
        if (val < -100 || val > 100) return 'NS';
        return Number(val.toFixed(2)).toLocaleString('fr-FR');
      }

      return Math.round(val).toLocaleString('fr-FR');
    };

    if (Array.isArray(obj)) {
      return obj.map(item => this.formatPayload(item, parentKey));
    } else if (typeof obj === 'object' && obj !== null) {
      return Object.keys(obj).reduce((acc, key) => {
        acc[key] = this.formatPayload(obj[key], key);
        return acc;
      }, {} as any);
    } else {
      return formatNumber(obj, parentKey);
    }
  }

  texteRefactor(texte: any): string {
    if (!texte) return '';

    // Si c’est un tableau de texte, on fusionne tout en une seule chaîne
    if (Array.isArray(texte)) {
      texte = texte.join('\n');
    }

    if (typeof texte !== 'string') return '';

    return texte.replace(/ - /g, '\n - ').trim();
  }

  formatPointsImportants(pointsImportants: any[]) {
    return pointsImportants.map((p: any) => {
      const commentaire = p.commentaire ? ` - ${p.commentaire}` : '';
      return `${commentaire}`;
    }).join('\n');
  }

  formatCP(cp: any) {
    return {
      annee: cp.annee ?? null,
      echeanciers: (cp.echeanciers || []).map((ech: any) => ({
        caisse: ech.caisse ?? null,
        lignes: (ech.lignes || []).map((ligne: any) => ({
          periode: ligne.periode ?? null,
          date: ligne.date ?? null,
          montant: ligne.montant ?? null,
        })),
        total: ech.total ?? null,
      })),
      totalAnnee: cp.totalAnnee ?? null,
    };
  }

  formatEmprunts(data: any, dateDebutEx: any, dateFinEx: any): any {
    const parseDate = (str: string): Date | null => {
      if (!str) return null;
      str = str.trim();

      if (str.includes("-")) {
        const [y, m, d] = str.split("-").map((x) => parseInt(x, 10));
        return new Date(y, m - 1, d);
      }

      if (str.includes("/")) {
        const [d, m, yRaw] = str.split("/").map((x) => parseInt(x, 10));
        let y = yRaw;
        if (y < 100) y += y < 50 ? 2000 : 1900;
        return new Date(y, m - 1, d);
      }

      return null;
    };

    const debutEx = parseDate(dateDebutEx)!;
    const finEx = parseDate(dateFinEx)!;

    const inRange = (d: Date | null): boolean =>
      d !== null && d >= debutEx && d <= finEx;

    const initSynthese = (): any => ({
      totalMontantEmprunt: 0,
      totalRemboursN1: 0,
      nbEmprunts: 0,
      emprunts: [],
    });

    const commences = initSynthese();
    const termines = initSynthese();
    const autres = initSynthese();

    for (const e of data.emprunts) {
      const debut = parseDate(e.T_date_debut);
      const fin = parseDate(e.T_date_fin);
      const montant = parseFloat(e.T_montant_emprunt);
      const rembN1 = parseFloat(e.T_remboursN1);
      let cible;
      if (inRange(debut)) cible = commences;
      else if (inRange(fin)) cible = termines;
      else cible = autres;

      cible.totalMontantEmprunt += montant;
      cible.totalRemboursN1 += rembN1;
      cible.nbEmprunts++;
    }

    data.totalMontantEmprunt = Math.round(commences.totalMontantEmprunt + termines.totalMontantEmprunt + autres.totalMontantEmprunt);
    data.totalRemboursN1 = Math.round(commences.totalRemboursN1 + termines.totalRemboursN1 + autres.totalRemboursN1);
    data.nbEmprunts = commences.nbEmprunts + termines.nbEmprunts + autres.nbEmprunts;

    return {
      global: data,
      commencesDansExercice: commences,
      terminesDansExercice: termines,
      autres: autres,
    };
  }
}