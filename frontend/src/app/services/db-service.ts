import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DbService {
  private http = inject(HttpClient);
  
  VerifCollaborateur() {
    return this.http.post<{ collaborateur: any }>(`/api/db/verifCollaborateur`, {});
  }

  GetListeDossiers(id_sellsy: any, statut: any) {
    return this.http.get(`/api/db/getListeDossiers`, { params: { id_sellsy, statut } })
  }

  VerifDossier(code_client: any, dateFinEx: Date, dateDebutEx: Date) {
    return this.http.post<{ client: any }>(`/api/db/verifDossier`, { code_client, dateFinEx, dateDebutEx });
  };

  getCAData() {
    return this.http.get(`/api/db/caData`);
  }

  GetDossierInfos() {
    return this.http.get(`/api/db/getDossierInfos`)
  };

  GetInfoFiscale() {
    return this.http.get(`/api/db/getInfoFiscale`)
  };

  GetMontantCharges(comptes: any) {
    return this.http.get(`/api/db/getMontantCharges`, { params: { comptes: comptes.join(',') } })
  };
}
