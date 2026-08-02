import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray } from '@angular/forms';

@Injectable({ providedIn: 'root' })
export class WordService {

  constructor(private http: HttpClient) {}

  checkConditions(form: any, validateAffectation = true) {
    const PAvalues = form.get('PA').value;
    const PAtotal = (PAvalues.resLeg || 0) + (PAvalues.resOrd || 0) + (PAvalues.report || 0) + (PAvalues.affect || 0);

    const Tvalues = form.get('T').value;
    const Tcalculee =
      (Tvalues.tresoN1 || 0) +
      (Tvalues.CAF || 0) +
      (Tvalues.RF_apport || 0) +
      (Tvalues.RF_emprunts || 0) +
      (Tvalues.RF_invest || 0) +
      (Tvalues.RF_autre || 0) -
      (Tvalues.EF_invest || 0) -
      (Tvalues.EF_emprunts || 0) -
      (Tvalues.EF_retraits || 0) -
      (Tvalues.EF_divi || 0) -
      (Tvalues.V_stock || 0) -
      (Tvalues.V_creances || 0) +
      (Tvalues.V_dettes || 0) -
      (Tvalues.V_autresCreances || 0) +
      (Tvalues.V_autresDettes || 0);

    const BFR =
      (Tvalues.RF_apport || 0) +
      (Tvalues.RF_emprunts || 0) +
      (Tvalues.RF_invest || 0) +
      (Tvalues.RF_autre || 0) -
      (Tvalues.EF_invest || 0) -
      (Tvalues.EF_emprunts || 0) -
      (Tvalues.EF_retraits || 0) -
      (Tvalues.EF_divi || 0);

    const FRNG = 
      - (Tvalues.V_stock || 0) -
      (Tvalues.V_creances || 0) +
      (Tvalues.V_dettes || 0) -
      (Tvalues.V_autresCreances || 0) +
      (Tvalues.V_autresDettes || 0);

    form.get('T').patchValue(
      {
        frng: FRNG,
        bfr: BFR
      },
      { emitEvent: false }
    );

    if (validateAffectation && PAtotal != PAvalues.resEx) {
      return "La somme des affectations diffère du résultat de l'exercice !";
    } else if (Tcalculee != Tvalues.tresoN) {
      return "Le solde de la trésorerie calculé est différent du solde de la trésorerie théorique !";
    } else {
      return "";
    }
  }

  generateWord(variables: any, folderPath: string, modeLFM: string | null): Observable<any> {
    return this.http.post(`/api/word/generateWord`, { variables, folderPath, modeLFM });
  }

  getJobStatus(jobId: string) {
    return this.http.get<{ status: string }>(`/api/word/job-status`, { params: { jobId } });
  }
}
