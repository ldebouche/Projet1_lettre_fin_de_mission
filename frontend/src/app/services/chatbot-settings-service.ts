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

  AddFile(files: any, targetFolder: any | null) {
    const formData = new FormData();

    for (const file of files) {
      formData.append('files', file, file.name);
    }

    formData.append('targetFolder', JSON.stringify(targetFolder));

    return this.http.post(`/api/chatbot-settings/addFile`, formData);
  }
}
