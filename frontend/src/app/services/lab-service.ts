import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, shareReplay } from 'rxjs';
import type {
  LabArpecEvaluationData,
  LabArpecQuestionnaireData,
  LabBeneficiaireEffectif,
  LabChatParentParams,
  LabClientBloc,
  LabCloturerEvenementRequest,
  LabCloturerRevueRequest,
  LabConversation,
  LabCreateBeneficiaireRequest,
  LabCreateDiligenceRequest,
  LabCreateDossierRequest,
  LabCreateEvenementRequest,
  LabCreatePieceRequest,
  LabCreateRevueRequest,
  LabCreateRevueResponse,
  LabDashboardQuery,
  LabDashboardResponse,
  LabDemanderClotureEvenementRequest,
  LabDiligenceListItem,
  LabDossierAttenteItem,
  LabDossierListItem,
  LabDossierResponse,
  LabDossiersAttenteQuery,
  LabDossiersQuery,
  LabEnrichissementResponse,
  LabEvenementListItem,
  LabKycBloc,
  LabListResponse,
  LabMeResponse,
  LabMessageChat,
  LabPagedResponse,
  LabParametrageResponse,
  LabPieceKyc,
  LabPieceUploadResponse,
  LabRefuserClotureEvenementRequest,
  LabRevueDetailItem,
  LabSaveArpecEvaluationRequest,
  LabSaveArpecEvaluationResponse,
  LabTracfinItem,
  LabTransactionItem,
  LabUpdateBeneficiaireRequest,
  LabUpdateClientRequest,
  LabUpdateDiligenceRequest,
  LabUpdateDossierRequest,
  LabUpdateEvenementRequest,
  LabUpdateKycRequest,
  LabUpdateParametrageRequest,
  LabUpdatePieceRequest,
} from './lab-models';

export * from './lab-models';

@Injectable({
  providedIn: 'root'
})
export class LabService {
  private http = inject(HttpClient);

  private static readonly EMPTY_ME: LabMeResponse = {
    isFull: false,
    id_sellsy: null,
    canAccessTracfin: false,
    canReadParametrage: false,
    canEditParametrage: false,
    isDemo: false,
  };

  /** Cache session : un seul GET /api/lab/me pour toutes les pages LAB. */
  private meCache$: Observable<{ data: LabMeResponse }> | null = null;

  getDossiersRisqueLab(codesClients: string[]): Observable<{ data: any }> {
    return this.http.post<{ data: any }>(`/api/lab/dossiers-risque`, { codes: codesClients });
  }

  getResumeLab(codeClient: string): Observable<{ data: any }> {
    return this.http.get<{ data: any }>(`/api/lab/resume`, {
      params: { code_client: String(codeClient).trim() }
    });
  }

  getDossierLab(codeClient: string): Observable<{ data: LabDossierResponse | null }> {
    return this.http.get<{ data: LabDossierResponse | null }>(`/api/lab/dossier`, {
      params: { code_client: String(codeClient).trim() }
    });
  }

  createDossierLab(body: LabCreateDossierRequest): Observable<{ data: LabDossierResponse }> {
    return this.http.post<{ data: LabDossierResponse }>(`/api/lab/dossier`, body);
  }

  updateDossierLab(
    codeClient: string,
    body: LabUpdateDossierRequest,
  ): Observable<{ data: LabDossierResponse }> {
    return this.http.put<{ data: LabDossierResponse }>(`/api/lab/dossier`, body, {
      params: { code_client: String(codeClient).trim() },
    });
  }

  updateClientLab(
    codeClient: string,
    body: LabUpdateClientRequest,
  ): Observable<{ data: LabClientBloc }> {
    return this.http.put<{ data: LabClientBloc }>(`/api/lab/client`, body, {
      params: { code_client: String(codeClient).trim() },
    });
  }

  updateKycLab(
    codeClient: string,
    body: LabUpdateKycRequest,
  ): Observable<{ data: { kyc: LabKycBloc | null; lab: { statut_kyc: string | null } | null } }> {
    return this.http.put<{ data: { kyc: LabKycBloc | null; lab: { statut_kyc: string | null } | null } }>(
      `/api/lab/kyc`,
      body,
      { params: { code_client: String(codeClient).trim() } },
    );
  }

  createBeneficiaireLab(
    body: LabCreateBeneficiaireRequest,
  ): Observable<{ data: { beneficiaire: LabBeneficiaireEffectif; evenement?: { id: number; type: string } | null } }> {
    return this.http.post<{ data: { beneficiaire: LabBeneficiaireEffectif; evenement?: { id: number; type: string } | null } }>(
      `/api/lab/beneficiaires`,
      body,
    );
  }

  updateBeneficiaireLab(
    id: string | number,
    body: LabUpdateBeneficiaireRequest,
  ): Observable<{ data: { beneficiaire: LabBeneficiaireEffectif; evenement?: { id: number; type: string } | null } }> {
    return this.http.put<{ data: { beneficiaire: LabBeneficiaireEffectif; evenement?: { id: number; type: string } | null } }>(
      `/api/lab/beneficiaires`,
      body,
      { params: { id: String(id).trim() } },
    );
  }

  deleteBeneficiaireLab(
    id: string | number,
  ): Observable<{ data: { id: string; code_client: string }; message: string }> {
    return this.http.delete<{ data: { id: string; code_client: string }; message: string }>(
      `/api/lab/beneficiaires`,
      { params: { id: String(id).trim() } },
    );
  }

  createPieceLab(
    body: LabCreatePieceRequest,
  ): Observable<{ data: { piece: LabPieceKyc } }> {
    return this.http.post<{ data: { piece: LabPieceKyc } }>(`/api/lab/pieces`, body);
  }

  uploadPieceKycFile(
    codeClient: string,
    file: File,
  ): Observable<{ data: LabPieceUploadResponse }> {
    const formData = new FormData();
    formData.append('code_client', String(codeClient).trim());
    formData.append('file', file, file.name);
    return this.http.post<{ data: LabPieceUploadResponse }>(`/api/lab/pieces/upload`, formData);
  }

  updatePieceLab(
    id: string | number,
    body: LabUpdatePieceRequest,
  ): Observable<{ data: { piece: LabPieceKyc } }> {
    return this.http.put<{ data: { piece: LabPieceKyc } }>(
      `/api/lab/pieces`,
      body,
      { params: { id: String(id).trim() } },
    );
  }

  deletePieceLab(
    id: string | number,
  ): Observable<{ data: { id: string; code_client: string }; message: string }> {
    return this.http.delete<{ data: { id: string; code_client: string }; message: string }>(
      `/api/lab/pieces`,
      { params: { id: String(id).trim() } },
    );
  }

  getArpecEvaluation(codeClient: string): Observable<{ data: LabArpecEvaluationData }> {
    return this.http.get<{ data: LabArpecEvaluationData }>(`/api/lab/arpec/evaluation`, {
      params: { code_client: codeClient.trim() },
    });
  }

  getArpecQuestionnaire(codeClient: string): Observable<{ data: LabArpecQuestionnaireData }> {
    return this.http.get<{ data: LabArpecQuestionnaireData }>(`/api/lab/arpec/questionnaire`, {
      params: { code_client: codeClient.trim() },
    });
  }

  saveArpecEvaluation(
    body: LabSaveArpecEvaluationRequest,
  ): Observable<{ data: LabSaveArpecEvaluationResponse }> {
    return this.http.post<{ data: LabSaveArpecEvaluationResponse }>(`/api/lab/arpec/evaluation`, body);
  }

  getDashboardLab(params: LabDashboardQuery = {}): Observable<{ data: LabDashboardResponse }> {
    const query: Record<string, string> = {};
    if (params.collaborateur?.trim()) query['collaborateur'] = params.collaborateur.trim();
    if (params.date_debut?.trim()) query['date_debut'] = params.date_debut.trim();
    if (params.date_fin?.trim()) query['date_fin'] = params.date_fin.trim();
    return this.http.get<{ data: LabDashboardResponse }>(`/api/lab/dashboard`, { params: query });
  }

  getDossiersLab(params: LabDossiersQuery = {}): Observable<LabPagedResponse<LabDossierListItem>> {
    const query: Record<string, string> = {};
    if (params.search?.trim()) query['search'] = params.search.trim();
    if (params.niveau) query['niveau'] = params.niveau;
    if (params.vigilance) query['vigilance'] = params.vigilance;
    if (params.revue) query['revue'] = params.revue;
    if (params.kyc) query['kyc'] = params.kyc;
    if (params.secteur?.trim()) query['secteur'] = params.secteur.trim();
    if (params.pays?.trim()) query['pays'] = params.pays.trim();
    if (params.page != null) query['page'] = String(params.page);
    if (params.pageSize != null) query['pageSize'] = String(params.pageSize);
    return this.http.get<LabPagedResponse<LabDossierListItem>>(`/api/lab/dossiers`, { params: query });
  }

  getDossiersAttenteLab(
    params: LabDossiersAttenteQuery = {},
  ): Observable<LabPagedResponse<LabDossierAttenteItem>> {
    const query: Record<string, string> = {};
    if (params.search?.trim()) query['search'] = params.search.trim();
    if (params.page != null) query['page'] = String(params.page);
    if (params.pageSize != null) query['pageSize'] = String(params.pageSize);
    return this.http.get<LabPagedResponse<LabDossierAttenteItem>>(`/api/lab/dossiers-attente`, {
      params: query,
    });
  }

  /**
   * Export portefeuille (PDF ou CSV) selon les filtres actifs — sans pagination.
   * Décision patron 13/08 : entier ou filtré.
   */
  exportPortefeuilleLab(
    params: LabDossiersQuery = {},
    format: 'pdf' | 'csv' = 'pdf',
  ): Observable<Blob> {
    const query: Record<string, string> = { format };
    if (params.search?.trim()) query['search'] = params.search.trim();
    if (params.niveau) query['niveau'] = params.niveau;
    if (params.vigilance) query['vigilance'] = params.vigilance;
    if (params.revue) query['revue'] = params.revue;
    if (params.kyc) query['kyc'] = params.kyc;
    if (params.secteur?.trim()) query['secteur'] = params.secteur.trim();
    if (params.pays?.trim()) query['pays'] = params.pays.trim();
    return this.http.get(`/api/lab/portefeuille/export`, {
      params: query,
      responseType: 'blob',
    });
  }

  getEvenementsLab(params: Record<string, string> = {}): Observable<LabListResponse<LabEvenementListItem>> {
    return this.http.get<LabListResponse<LabEvenementListItem>>(`/api/lab/evenements`, { params });
  }

  getDiligencesLab(params: Record<string, string> = {}): Observable<LabListResponse<LabDiligenceListItem>> {
    return this.http.get<LabListResponse<LabDiligenceListItem>>(`/api/lab/diligences`, { params });
  }

  getTransactionsLab(params: Record<string, string> = {}): Observable<LabListResponse<LabTransactionItem>> {
    return this.http.get<LabListResponse<LabTransactionItem>>(`/api/lab/transactions`, { params });
  }

  getTracfinLab(params: Record<string, string> = {}): Observable<LabListResponse<LabTracfinItem>> {
    return this.http.get<LabListResponse<LabTracfinItem>>(`/api/lab/tracfin`, { params });
  }

  getMeLab(): Observable<{ data: LabMeResponse }> {
    if (!this.meCache$) {
      this.meCache$ = this.http.get<{ data: LabMeResponse }>(`/api/lab/me`).pipe(
        shareReplay(1),
      );
    }
    return this.meCache$.pipe(
      catchError(() => {
        this.meCache$ = null;
        return of({ data: LabService.EMPTY_ME });
      }),
    );
  }

  getParametrageLab(): Observable<{ data: LabParametrageResponse }> {
    return this.http.get<{ data: LabParametrageResponse }>(`/api/lab/parametrage`);
  }

  updateParametrageLab(
    body: LabUpdateParametrageRequest,
  ): Observable<{ data: LabParametrageResponse }> {
    return this.http.put<{ data: LabParametrageResponse }>(`/api/lab/parametrage`, body);
  }

  getEnrichissementLab(params: {
    siret?: string;
    siren?: string;
    code_client?: string;
  }): Observable<{ data: LabEnrichissementResponse }> {
    const query: Record<string, string> = {};
    if (params.siret?.trim()) query['siret'] = params.siret.trim();
    if (params.siren?.trim()) query['siren'] = params.siren.trim();
    if (params.code_client?.trim()) query['code_client'] = params.code_client.trim();
    return this.http.get<{ data: LabEnrichissementResponse }>(`/api/lab/enrichissement`, { params: query });
  }

  createEvenementLab(body: LabCreateEvenementRequest): Observable<{ data: LabEvenementListItem }> {
    return this.http.post<{ data: LabEvenementListItem }>(`/api/lab/evenements`, body);
  }

  updateEvenementLab(
    id: string | number,
    body: LabUpdateEvenementRequest,
  ): Observable<{ data: LabEvenementListItem }> {
    return this.http.put<{ data: LabEvenementListItem }>(`/api/lab/evenements`, body, {
      params: { id: String(id).trim() },
    });
  }

  cloturerEvenementLab(
    id: string | number,
    body: LabCloturerEvenementRequest,
  ): Observable<{ data: LabEvenementListItem }> {
    return this.http.post<{ data: LabEvenementListItem }>(`/api/lab/evenements/cloturer`, body, {
      params: { id: String(id).trim() },
    });
  }

  demanderClotureEvenementLab(
    id: string | number,
    body: LabDemanderClotureEvenementRequest,
  ): Observable<{ data: LabEvenementListItem }> {
    return this.http.post<{ data: LabEvenementListItem }>(`/api/lab/evenements/demander-cloture`, body, {
      params: { id: String(id).trim() },
    });
  }

  refuserClotureEvenementLab(
    id: string | number,
    body: LabRefuserClotureEvenementRequest,
  ): Observable<{ data: LabEvenementListItem }> {
    return this.http.post<{ data: LabEvenementListItem }>(`/api/lab/evenements/refuser-cloture`, body, {
      params: { id: String(id).trim() },
    });
  }

  createDiligenceLab(body: LabCreateDiligenceRequest): Observable<{ data: LabDiligenceListItem }> {
    return this.http.post<{ data: LabDiligenceListItem }>(`/api/lab/diligences`, body);
  }

  updateDiligenceLab(
    id: string | number,
    body: LabUpdateDiligenceRequest,
  ): Observable<{ data: LabDiligenceListItem }> {
    return this.http.put<{ data: LabDiligenceListItem }>(`/api/lab/diligences`, body, {
      params: { id: String(id).trim() },
    });
  }

  createRevueLab(body: LabCreateRevueRequest): Observable<{ data: LabCreateRevueResponse }> {
    return this.http.post<{ data: LabCreateRevueResponse }>(`/api/lab/revues`, body);
  }

  getRevuesLab(codeClient: string): Observable<LabListResponse<LabRevueDetailItem>> {
    return this.http.get<LabListResponse<LabRevueDetailItem>>(`/api/lab/revues`, {
      params: { code_client: String(codeClient).trim() },
    });
  }

  cloturerRevueLab(
    id: string | number,
    body: LabCloturerRevueRequest,
  ): Observable<{ data: unknown }> {
    return this.http.put<{ data: unknown }>(`/api/lab/revues/cloturer`, body, {
      params: { id: String(id).trim() },
    });
  }

  annulerRevueLab(id: string | number): Observable<{ data: unknown }> {
    return this.http.post<{ data: unknown }>(`/api/lab/revues/annuler`, {}, {
      params: { id: String(id).trim() },
    });
  }

  /**
   * Régénère le plan de vigilance (diligences auto) pour un dossier.
   * Usage futur / debug — pas de CTA obligatoire dans l’UI MVP.
   */
  genererPlanVigilanceLab(
    code_client: string,
  ): Observable<{ data: unknown }> {
    return this.http.post<{ data: unknown }>(`/api/lab/plan-vigilance/generer`, {
      code_client: String(code_client).trim(),
    });
  }

  getConversationLab(params: LabChatParentParams): Observable<{ data: LabConversation }> {
    const query: Record<string, string> = {};
    if (params.code_client != null && String(params.code_client).trim() !== '') {
      query['code_client'] = String(params.code_client).trim();
    }
    if (params.id_evenement != null && String(params.id_evenement).trim() !== '') {
      query['id_evenement'] = String(params.id_evenement).trim();
    }
    if (params.id_diligence != null && String(params.id_diligence).trim() !== '') {
      query['id_diligence'] = String(params.id_diligence).trim();
    }
    if (params.id_conversation != null && String(params.id_conversation).trim() !== '') {
      query['id_conversation'] = String(params.id_conversation).trim();
    }
    return this.http.get<{ data: LabConversation }>(`/api/lab/conversation`, {
      params: query,
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
  }

  getMessagesLab(
    params: LabChatParentParams & {
      since_id?: string | number;
      before_id?: string | number;
      limit?: number;
      inclure_supprimes?: boolean | string;
    } = {},
  ): Observable<LabListResponse<LabMessageChat>> {
    const query: Record<string, string> = {};
    if (params.code_client != null && String(params.code_client).trim() !== '') {
      query['code_client'] = String(params.code_client).trim();
    }
    if (params.id_evenement != null && String(params.id_evenement).trim() !== '') {
      query['id_evenement'] = String(params.id_evenement).trim();
    }
    if (params.id_diligence != null && String(params.id_diligence).trim() !== '') {
      query['id_diligence'] = String(params.id_diligence).trim();
    }
    if (params.id_conversation != null && String(params.id_conversation).trim() !== '') {
      query['id_conversation'] = String(params.id_conversation).trim();
    }
    if (params.since_id != null) query['since_id'] = String(params.since_id);
    if (params.before_id != null) query['before_id'] = String(params.before_id);
    if (params.limit != null) query['limit'] = String(params.limit);
    if (params.inclure_supprimes != null) query['inclure_supprimes'] = String(params.inclure_supprimes);
    return this.http.get<LabListResponse<LabMessageChat>>(`/api/lab/messages`, {
      params: query,
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
  }

  createMessageLab(
    body: LabChatParentParams & { contenu: string },
  ): Observable<{ data: LabMessageChat }> {
    return this.http.post<{ data: LabMessageChat }>(`/api/lab/messages`, body);
  }

  updateMessageLab(
    id: string | number,
    body: { contenu: string },
  ): Observable<{ data: LabMessageChat }> {
    return this.http.put<{ data: LabMessageChat }>(`/api/lab/messages`, body, {
      params: { id: String(id).trim() },
    });
  }

  deleteMessageLab(id: string | number): Observable<{ data: { id: number; supprime: boolean } }> {
    return this.http.delete<{ data: { id: number; supprime: boolean } }>(`/api/lab/messages`, {
      params: { id: String(id).trim() },
    });
  }
}
