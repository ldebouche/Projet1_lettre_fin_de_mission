import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DataService } from '../../services/data-service';
import { ModalComponent } from '../../shared/modal/modal';
import { ListeHistoriqueComponent } from '../../shared/liste-historique/liste-historique';

interface CarteAction {
  label: string;
  route?: string;
  onClick?: () => void;
}

interface CartePrincipale {
  title: string;
  description: string;
  actions: CarteAction[];
  accentColor: 'blue-light' | 'blue-petrol' | 'sand';
}

@Component({
  selector: 'app-accueil-mission',
  standalone: true,
  imports: [
    CommonModule,
    ListeHistoriqueComponent,
    ModalComponent
  ],
  templateUrl: './accueil-mission.html',
  styleUrls: ['./accueil-mission.scss']
})
export class AccueilMissionComponent {
  collaborateur: any | null = localStorage.getItem('collaborateur') ? JSON.parse(localStorage.getItem('collaborateur')!) : null;
  codeClient: string | null = localStorage.getItem('codeClient');
  nomEntreprise: string = '';

  hoverIndex: number | null = null;

  cartes: CartePrincipale[] = [
    {
      title: 'Début de mission',
      description: 'Préparer et cadrer le démarrage des missions.',
      accentColor: 'blue-light',
      actions: [
        { label: 'Outil test 1' },
        { label: 'Outil test 2' },
        { label: 'Préparation du dossier' },
        { label: 'Validation du cadrage' }
      ]
    },
    {
      title: 'Diligences',
      description: 'Suivre l\'avancement et les contrôles.',
      accentColor: 'blue-petrol',
      actions: [
        { label: 'Outil test A' },
        { label: 'Outil test B' },
        { label: 'Suivi des contrôles' },
        { label: 'Rapport d\'avancement' }
      ]
    },
    {
      title: 'Fin d\'exercice',
      description: 'Clôturer, documenter et générer les livrables.',
      accentColor: 'sand',
      actions: [
        { label: 'Historique des fichiers pour fin d\'exercice', onClick: () => this.consulterHistorique() },
        { label: 'Accéder au formulaire de fin d\'exercice', route: '/lettre-fin-mission' }
      ]
    }
  ];

  isHistoriqueModalOpen = false;
  selectedCodeClient: string | null = null;

  constructor(
    private router: Router,
    private dataService: DataService
  ) {
    this.nomEntreprise = this.dataService.getNomEntreprise() || '';
  }

  onEnter(i: number) {
    this.hoverIndex = i;
  }

  onLeave() {
    this.hoverIndex = null;
  }

  onAction(action: CarteAction, event: MouseEvent) {
    event.stopPropagation();
    if (action.route) {
      this.router.navigate([action.route]);
    }
    else if (action.onClick) {
      action.onClick();
    }
  }

  getAccentColorClass(color: string): string {
    return `accent-${color}`;
  }

  getCollabNom(): string {
    return this.collaborateur ? `${this.collaborateur.prenom} ${this.collaborateur.nom}` : '';
  }

  consulterHistorique() {
    this.selectedCodeClient = this.codeClient;
    this.isHistoriqueModalOpen = true;
  }

  closeHistoriqueModal() {
    this.isHistoriqueModalOpen = false;
    this.selectedCodeClient = null;
  }
}
