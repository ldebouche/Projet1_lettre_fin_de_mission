import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DbService {
  private http = inject(HttpClient);
  
  GetListeCollaborateurs(code : any): Observable<any[]> {
    return this.http.get<any[]>(`/api/db/getListeCollaborateurs`, { params : { code: code.toUpperCase()  }});
  }

  VerifCollaborateur(code: string) {
    return this.http.post<{ token: string, collaborateur: any }>(`/api/db/verifCollaborateur`, { code });
  }

  GetListeDossiers(id_sellsy: any, statut: any) {
    return this.http.get(`/api/db/getListeDossiers`, { params: { id_sellsy, statut } })
  }

  VerifDossier(code_client: any, dateFinEx: Date, dateDebutEx: Date) {
    return this.http.post<{ token: string }>(`/api/db/verifDossier`, { code_client, dateFinEx, dateDebutEx });
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
