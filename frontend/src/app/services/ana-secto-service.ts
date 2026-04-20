import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface AnaSectoMeta {
  id: number;
  dbId: number;
  dateCreation: string;
  dateModification: string;
  creePar: string;
  nomFichier: string;
  tailleMo: number;
  pdfUrl: string;
  codeAPE: string;
  millesime: number;
  texte: string;
  isFolder: boolean;
  idParent: number | null;
  isExpanded: boolean;
  relativePdfPath: string;
  relativePath: string;
  nomAnaSecto: string;
  statut: 'attente' | 'indexee';
}

@Injectable({
  providedIn: 'root'
})
export class AnaSectoService {
  private http = inject(HttpClient);

  GetTree() {
    return this.http.get(`/api/ana-secto-settings/tree`)
  };

  DeleteItem(item: any) {
    return this.http.post(`/api/ana-secto-settings/deleteItem`, { item });
  }

  AddFile(payload: any) {
    return this.http.post(`/api/ana-secto-settings/addFile`, payload);
  }

  CreateAnaSectoFromFiles(files: File[]) {
    const formData = new FormData();

    for (const file of files) {
      formData.append('files', file);
    }
    return this.http.post(`/api/ana-secto-settings/createAnaSectoFromFiles`, formData);
  }

  GetAnaSecto(folderName: string) {
    return this.http.get<{fichiers : AnaSectoMeta[]}>(`/api/ana-secto-settings/getAnaSecto`, { params: { folderName } });
  }

  UpdateAnaSecto(anaSectoMeta: any) {
    return this.http.post(`/api/ana-secto-settings/updateAnaSecto`, { anaSectoMeta });
  }

  AccepterAnaSecto(anaSectoMeta: any) {
    return this.http.post(`/api/ana-secto-settings/accepterAnaSecto`, { anaSectoMeta });
  }

  RejeterAnaSecto(nomFichier: string, code_ape: string) {
    return this.http.post(`/api/ana-secto-settings/rejeterAnaSecto`, { nomFichier, code_ape });
  }

  GetCompteurFichiers() {
    return this.http.get(`/api/ana-secto-settings/compteurFichiers`);
  }

  //-----------------------------------

  GetProcedureText(folderName: string, procedureName: string) {
    return this.http.get(`/api/chatbot-settings/getProcedureText`, { params: { folderName, procedureName } });
  }

  UpdateProcedureText(folderName: string, procedureName: string, text: string) {
    return this.http.post(`/api/chatbot-settings/updateProcedureText`, { folderName, procedureName, text });
  }

  EditFromTree(item: any) {
    return this.http.post('/api/ana-secto-settings/edit-from-tree', { item });
  }
}
