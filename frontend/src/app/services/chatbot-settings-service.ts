import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class ChatbotSettingsService {
  private http = inject(HttpClient);

  GetTree() {
    return this.http.get(`/api/chatbot-settings/tree`)
  };

  DeleteItem(item: any, indexedItems: any[]) {
    return this.http.post(`/api/chatbot-settings/deleteItem`, { item, indexedItems });
  }

  CreateFolder(folderName: string, parentId: number | null, indexedItems: any[]) {
    return this.http.post(`/api/chatbot-settings/createFolder`, { folderName, parentId, indexedItems });
  }

  AddFile(payload: any) {
    return this.http.post(`/api/chatbot-settings/addFile`, payload);
  }

  CreateProcedureFromFiles(files: File[]) {
    const formData = new FormData();

    for (const file of files) {
      formData.append('files', file);
    }
    return this.http.post(`/api/chatbot-settings/createProcedureFromFiles`, formData);
  }

  CreateProcedureFromUrl(procedureName: string, externalLink: any) {
    return this.http.post(`/api/chatbot-settings/createProcedureFromUrl`, { procedureName, externalLink, });
  }

  GetProcedures(folderName: string) {
    return this.http.get(`/api/chatbot-settings/getProcedures`, { params: { folderName } });
  }

  AccepterProcedure(procedureName: string) {
    return this.http.post(`/api/chatbot-settings/accepterProcedure`, { procedureName });
  }

  RejeterProcedure(procedureName: string) {
    return this.http.post(`/api/chatbot-settings/rejeterProcedure`, { procedureName });
  }

  GetCompteurFichiers() {
    return this.http.get(`/api/chatbot-settings/compteurFichiers`);
  }

  GetProcedureText(folderName: string, procedureName: string) {
    return this.http.get(`/api/chatbot-settings/getProcedureText`, { params: { folderName, procedureName } });
  }

  UpdateProcedureText(folderName: string, procedureName: string, text: string) {
    return this.http.post(`/api/chatbot-settings/updateProcedureText`, { folderName, procedureName, text });
  }

  UploadProcedureImage(folderName: string, procedureName: string, file: File) {
    const form = new FormData();
    form.append('folderName', folderName);
    form.append('procedureName', procedureName);
    form.append('file', file);

    return this.http.post('/api/chatbot-settings/upload-procedure-image', form, { withCredentials: true });
  }

  EditFromChatbot(item: any) {
    return this.http.post('/api/chatbot-settings/edit-from-chatbot', { item });
  }

  MoveIndexerToAttente(nom: string) {
    return this.http.post('/api/chatbot-settings/indexer-to-attente', { nom });
  }
}
