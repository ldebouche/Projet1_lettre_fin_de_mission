import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';


@Injectable({
  providedIn: 'root'
})
export class PdfService {
  private http = inject(HttpClient);


  getDotations(code_client: any, datefinex: any) {
    console.log(code_client, datefinex);
    return this.http.get(`/api/pdf/cumuls`, { params: { code_client, datefinex } });
  }

  getComments(compte: string, code_client: any, datefinex: any): Observable<any> {
    return this.http.get<string>(`/api/pdf/comments`, { params: { compte, code_client, datefinex } });
  }

  getPointsImportants(code_client: any, datefinex: any) {
    return this.http.get(`/api/pdf/points-importants`, { params: { code_client, datefinex } });
  }

  getImmob(code_client: any, datefinex: any) {
    return this.http.get(`/api/pdf/immob`, { params: { code_client, datefinex } });
  }

  getEmprunts(code_client: any, datefinex: any) {
    return this.http.get(`/api/pdf/emprunts`, { params: { code_client, datefinex } });
  }

  getEcheancier(file: any): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post(`/api/pdf/echeancier`, formData);
  }
}
