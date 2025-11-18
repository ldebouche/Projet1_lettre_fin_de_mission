import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';


@Injectable({
  providedIn: 'root'
})
export class PdfService {
  private http = inject(HttpClient);


  getDotations() {
    return this.http.get(`/api/pdf/cumuls`);
  }

  getComments(compte: string): Observable<any> {
    return this.http.get<string>(`/api/pdf/comments`, {
      params: { compte }
    });
  }

  getPointsImportants() {
    return this.http.get(`/api/pdf/points-importants`);
  }

  getImmob() {
    return this.http.get(`/api/pdf/immob`);
  }

  getEmprunts() {
    return this.http.get(`/api/pdf/emprunts`);
  }

  getEcheancier(file: any): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post(`/api/pdf/echeancier`, formData);
  }
}
