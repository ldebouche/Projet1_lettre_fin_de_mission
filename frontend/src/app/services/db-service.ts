import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DbService {
  private http = inject(HttpClient);
  
  VerifDossier(code_client: any, dateFinEx: Date, dateDebutEx: Date) {
    return this.http.post<{ token: string }>(`/api/db/verifDossier`, { code_client, dateFinEx, dateDebutEx });
  };

  getCAData() {
    const token = localStorage.getItem('token');

    return this.http.get(`/api/db/caData`, { headers: { Authorization: `Bearer ${token}` } });
  }

  GetDossierInfos() {
    const token = localStorage.getItem('token');

    return this.http.get(`/api/db/getDossierInfos`, { headers: { Authorization: `Bearer ${token}` } })
  };

  GetInfoFiscale() {
    const token = localStorage.getItem('token');

    return this.http.get(`/api/db/getInfoFiscale`, { headers: { Authorization: `Bearer ${token}` } })
  };

  GetMontantCharges(comptes: any) {
    const token = localStorage.getItem('token');
    
    return this.http.get(`/api/db/getMontantCharges`, { headers: { Authorization: `Bearer ${token}` }, params: { comptes: comptes.join(',') } })
  };
}
