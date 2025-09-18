import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';


@Injectable({
  providedIn: 'root'
})
export class PdfService {
  private http = inject(HttpClient);
  baseUrl = 'http://localhost:4000/api/pdf';


  getDotations() {
    return this.http.get(`${this.baseUrl}/cumuls`);
  }
}
