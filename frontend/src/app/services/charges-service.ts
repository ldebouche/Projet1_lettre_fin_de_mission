import { Injectable } from '@angular/core';
import { of, forkJoin } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
import { DbService } from './db-service';
import { PdfService } from './pdf-service';


@Injectable({ providedIn: 'root' })
export class ChargesService {
  constructor(private db: DbService, private pdf: PdfService) {}

  loadEvoChargesWithComments(evoCharges: any[], code_client: any, datefinex: any) {
    const requests = evoCharges.map(ligne => {
      if (ligne.EC_comment) {
        return this.pdf.getComments(ligne.EC_numCompte, code_client, datefinex).pipe(
          switchMap((rawComment: any) => {
            let comptes: string[] = [];
            let comment_tab: any[] = [];

            if (rawComment?.comments?.length) {
              comptes = rawComment.comments.map((c: any) => c.compte);
              comment_tab = rawComment.comments.map((c: any) => {
                const libelle = c.libelle ? ` - ${c.libelle}` : '';
                const texte = c.commentaireReformule ? ` - ${c.commentaireReformule}` : '';
                return { compte: c.compte, texte: `${c.compte}${libelle}${texte}` };
              });
            }

            if (comptes.length) {
              return this.db.GetMontantCharges(comptes).pipe(
                map((montants: any) => {
                  const montantDict: any = {};
                  montants.forEach((m: any) => {
                    montantDict[m.CompteNum.trim()] = Number(Math.round(m.montant)).toLocaleString('fr-FR');
                  });

                  const final_comments = comment_tab.map((c: any) => {
                    const montant = montantDict[c.compte] ? ` - ${montantDict[c.compte]} €` : '';
                    return `${c.texte}${montant}`;
                  });

                  return { ...ligne, EC_comment_tab: final_comments };
                })
              );
            } else {
              return of({ ...ligne, EC_comment_tab: comment_tab });
            }
          }),
          catchError(() => of({ ...ligne, EC_comment_tab: [] }))
        );
      } else {
        return of({ ...ligne, EC_comment_tab: [] });
      }
    });

    return forkJoin(requests);
  }

  formatEvoCharges(obj: any[], form: any) {
    return obj.filter(ligne => {
      const prc = Number(ligne['EC_%Var']);
      const validPrc = !isNaN(prc) && Math.abs(prc) <= 100;

      const displayPrcVar =
        form.EC.montantVariationMinPourcentage === 0 ||
        (validPrc && Math.abs(prc) >= form.EC.montantVariationMinPourcentage);

      return (
        ligne.EC_valN >= form.EC.montantMinAffiché &&
        Math.abs(ligne.EC_valVar) >= form.EC.montantVariationMin &&
        displayPrcVar
      );
    });
  }
}
