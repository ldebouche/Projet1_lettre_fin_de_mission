import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';


@Injectable({
  providedIn: 'root'
})
export class PdfService {
  private http = inject(HttpClient);
  baseUrl = 'http://localhost:4000/api/pdf';


  getDotations() {
    return this.http.get(`${this.baseUrl}/cumuls`);
  }

  getComments(compte: string): Observable<any> {
    return this.http.get<string>(`${this.baseUrl}/comments`, {
      params: { compte }
    });
  }

  getImmob() {
    return this.http.get(`${this.baseUrl}/immob`);
  }
}
