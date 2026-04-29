import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FiscaliteService {
  getPhraseAcomptes(resEx: number, IS_tot: number): string {
    if (resEx < 0 && IS_tot === 0) {
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

    if (data.client.isAssoc) {
      result.affectation = 'Fonds associatifs';
      result.report = data.resEx;
    } else if (data.client.isSciIr) {
      result.affectation = 'Au prorata des comptes courants d’associés';
      if (data.resEx > 0) result.affect = data.resEx;
      else result.report = data.resEx;
    } else if (data.client.isSciIs) {
      result.affectation = 'Dividendes';
      if (data.resEx > 0) {
        result.resOrd = data.resEx;
      } else {
        result.report = data.resEx;
      }
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
      } else {
        if (- data.montantReserveOrdinaire >= data.resEx) {
          result.resOrd = - data.montantReserveOrdinaire;
          result.report = data.resEx - result.resOrd;
        } else {
          result.resOrd = data.resEx;
        }
      }
    }

    return result;
  }

  getMoisClotureArray(mois: number): string[] {
    const map: Record<number, string[]> = {
      1: ['03', '06', '09', '12', '05'],
      2: ['03', '06', '09', '12', '06'],
      3: ['06', '09', '12', '03', '07'],
      4: ['06', '09', '12', '03', '08'],
      5: ['06', '09', '12', '03', '09'],
      6: ['09', '12', '03', '06', '10'],
      7: ['09', '12', '03', '06', '11'],
      8: ['09', '12', '03', '06', '12'],
      9: ['12', '03', '06', '09', '01'],
      10: ['12', '03', '06', '09', '02'],
      11: ['12', '03', '06', '09', '03'],
      12: ['03', '06', '09', '12', '05'],
    };
    return map[mois] || [];
  }
}
