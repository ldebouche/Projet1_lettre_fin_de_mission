import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WordService {

  constructor(private http: HttpClient) {}

  generateWord(variables: any, folderPath: string): Observable<any> {
    return this.http.post(`/api/word/generateWord`, { variables, folderPath });
  }
}
