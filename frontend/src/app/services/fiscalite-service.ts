import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FiscaliteService {
  getPhraseAcomptes(resEx: number, IS_tot: number): string {
    if (resEx < 0) {
      return 'Compte tenu du déficit constaté, aucun acompte d\'impôt sur les sociétés n\'est exigible au titre de l\'exercice à venir.';
    } else if (resEx >= 0 && IS_tot <= 3000) {
      return 'Le montant total de l\'impôt sur les sociétés dû au titre de cet exercice étant inférieur à 3000 €, aucun acompte n\'est exigible pour l\'exercice suivant.';
    }
    return '';
  }

  calculAffectation(data: any, capitalSocial: number, montantDividendesN1: number) {
    const result = {
      affectation: '',
      resLeg: 0,
      resOrd: 0,
      report: 0,
      affect: 0
    };

    if (data.forme_societe.startsWith('ASS')) {
      result.affectation = 'Fonds associatifs';
      result.affect = data.resEx;
    } else if (data.forme_societe === 'SCI' && data.categorie_revenu === 'rfonc') {
      result.affectation = 'Au prorata des comptes courants d’associés';
      if (data.resEx > 0) result.affect = data.resEx;
      else result.report = data.resEx;
    } else {
      result.affectation = 'Dividendes';
      result.affect = montantDividendesN1;

      if (data.resEx > 0) {
        const seuil = capitalSocial * 0.1;
        if (data.montantReserveLegale >= seuil) {
          result.resOrd = data.resEx;
        } else if (data.montantReserveLegale + data.resEx >= seuil) {
          result.resLeg = seuil - data.montantReserveLegale;
          result.resOrd = data.resEx - result.resLeg;
        } else {
          result.resLeg = data.resEx;
        }
      } else if (data.resEx < 0) {
        if (data.resEx + data.montantReserveOrdinaire >= 0) {
          result.resOrd = data.montantReserveOrdinaire + data.resEx;
        } else {
          result.report = data.resEx + data.montantReserveOrdinaire;
        }
      }
    }

    return result;
  }

  getMoisClotureArray(mois: number): string[] {
    const map: Record<number, string[]> = {
      1: ['03', '06', '09', '12'],
      2: ['03', '06', '09', '12'],
      3: ['06', '09', '12', '03'],
      4: ['06', '09', '12', '03'],
      5: ['06', '09', '12', '03'],
      6: ['09', '12', '03', '06'],
      7: ['09', '12', '03', '06'],
      8: ['09', '12', '03', '06'],
      9: ['12', '03', '06', '09'],
      10: ['12', '03', '06', '09'],
      11: ['12', '03', '06', '09'],
      12: ['03', '06', '09', '12'],
    };
    return map[mois] || [];
  }
}
