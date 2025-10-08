import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WordService {
  private apiUrl = 'http://localhost:4000/api/word';

  constructor(private http: HttpClient) {}

  generateWord(variables: any, folderPath: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/generateWord`, { variables, folderPath });
  }
}
