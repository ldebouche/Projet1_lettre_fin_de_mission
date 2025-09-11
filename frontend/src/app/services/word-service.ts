import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WordService {
  private apiUrl = 'http://localhost:4000/api/word';

  constructor(private http: HttpClient) {}

  generateWord(data: any): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/generate`, data, {responseType: 'blob'});
  }
}
