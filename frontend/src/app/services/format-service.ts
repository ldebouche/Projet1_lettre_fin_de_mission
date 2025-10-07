import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FormatService {
  formatPayload(obj: any, parentKey?: string): any {
    const formatNumber = (val: any, key?: string) => {
      if (typeof val === 'boolean') return val;
      if (typeof val !== 'number' || isNaN(val)) return val;

      if (key && key.includes('%')) {
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
}