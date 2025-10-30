import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DbService {
  private http = inject(HttpClient);
  baseUrl = 'http://localhost:4000/api/db';
  
  VerifDossier(code_client: any, dateFinEx: Date, dateDebutEx: Date) {
    return this.http.post<{ token: string }>(`${this.baseUrl}/verifDossier`, { code_client, dateFinEx, dateDebutEx });
  };

  getCAData() {
    const token = localStorage.getItem('token');

    return this.http.get(`${this.baseUrl}/caData`, { headers: { Authorization: `Bearer ${token}` } });
  }

  GetDossierInfos() {
    const token = localStorage.getItem('token');

    return this.http.get(`${this.baseUrl}/getDossierInfos`, { headers: { Authorization: `Bearer ${token}` } })
  };

  GetInfoFiscale() {
    const token = localStorage.getItem('token');

    return this.http.get(`${this.baseUrl}/getInfoFiscale`, { headers: { Authorization: `Bearer ${token}` } })
  };

  GetMontantCharges(comptes: any) {
    const token = localStorage.getItem('token');
    
    return this.http.get(`${this.baseUrl}/getMontantCharges`, { headers: { Authorization: `Bearer ${token}` }, params: { comptes: comptes.join(',') } })
  };
}
