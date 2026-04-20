import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private http = inject(HttpClient)

  getDossiersHistorique(code_client: any) {
    return this.http.get(`/api/dashboard/historique`, { params: { code_client } });
  }

  checkHistorique(code_client: any, millesime: string) {
    return this.http.get(`/api/dashboard/check-historique`, { params: { code_client, millesime } });
  }
}
