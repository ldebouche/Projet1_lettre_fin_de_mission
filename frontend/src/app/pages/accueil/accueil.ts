import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

interface CarteAction {
  label: string;
  route?: string;
}

interface CartePrincipale {
  title: string;
  description: string;
  actions: CarteAction[];
  accentColor: 'blue-light' | 'blue-petrol' | 'sand';
}

@Component({
  selector: 'app-accueil',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './accueil.html',
  styleUrls: ['./accueil.scss']
})
export class AccueilComponent {

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
      title: 'Fin de mission',
      description: 'Clôturer, documenter et générer les livrables.',
      accentColor: 'sand',
      actions: [
        { label: 'Accéder au formulaire de fin de mission', route: '/formulaire' }
      ]
    }
  ];

  constructor(private router: Router) {}

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
  }

  getAccentColorClass(color: string): string {
    return `accent-${color}`;
  }
}
