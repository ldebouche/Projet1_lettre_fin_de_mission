import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LabCarteComponent } from './components/lab-carte/lab-carte';

type Statut = 'actif' | 'ferme' | 'inconnu';

type Etablissement = {
  libelle: string;
  siret: string;
  statut: Statut;
  adresse: string;
};

type Dirigeant = {
  nom: string;
  role: string;
  depuis?: string;
};

type Chiffres = {
  annee: string;
  effectif: string;
  ca: string;
  resultat: string;
};

@Component({
  selector: 'app-lab-dashboard-dossier',
  standalone: true,
  imports: [CommonModule, LabCarteComponent],
  templateUrl: './lab-dashboard-dossier.html',
  styleUrls: ['./lab-dashboard-dossier.scss'],
})
export class LabDashboardDossierComponent {
  entreprise = {
    nom: 'Facebook France',
    forme: 'SAS',
    statut: 'actif' as Statut,

    siren: '530 085 802',
    siretSiege: '530 085 802 00013',
    rcs: 'Paris B 530 085 802',
    tva: 'FR 53 530085802',

    adresseSiege: '6 rue Ménars, 75002 Paris',
    activite: 'Portails Internet (NAF 6312Z)',
    creation: '08/02/2011',
    capital: '1 000 000 €',
    effectif: '250–499 (estimation)',
  };

  identite = [
    { label: 'Dénomination', value: 'Facebook France' },
    { label: 'Forme', value: 'SAS' },
    { label: 'SIREN', value: '530 085 802' },
    { label: 'SIRET (siège)', value: '530 085 802 00013' },
    { label: 'RCS', value: 'Paris B 530 085 802' },
    { label: 'TVA', value: 'FR 53 530085802' },
    { label: 'Capital', value: '1 000 000 €' },
    { label: 'Création', value: '08/02/2011' },
    { label: 'Activité', value: 'Portails Internet (NAF 6312Z)' },
    { label: 'Adresse siège', value: '6 rue Ménars, 75002 Paris' },
  ];

  etablissements: Etablissement[] = [
    {
      libelle: 'Siège / établissement principal',
      siret: '530 085 802 00013',
      statut: 'actif',
      adresse: '6 rue Ménars, 75002 Paris',
    },
    {
      libelle: 'Établissement secondaire',
      siret: '530 085 802 00021',
      statut: 'actif',
      adresse: '2 avenue Exemple, 69000 Lyon',
    },
    {
      libelle: 'Établissement secondaire',
      siret: '530 085 802 00039',
      statut: 'ferme',
      adresse: '10 rue Test, 13000 Marseille',
    },
  ];

  dirigeants: Dirigeant[] = [
    { nom: 'Jean Dupont', role: 'Président', depuis: '2022' },
    { nom: 'Marie Martin', role: 'Directrice générale', depuis: '2021' },
    { nom: 'Lucas Bernard', role: 'Directeur financier', depuis: '2020' },
  ];

  chiffres: Chiffres[] = [
    { annee: '2023', effectif: '250–499', ca: '—', resultat: '—' },
    { annee: '2022', effectif: '200–249', ca: '—', resultat: '—' },
    { annee: '2021', effectif: '200–249', ca: '—', resultat: '—' },
  ];

  resumeCartes = [
    { titre: 'Statut', valeur: 'En activité', detail: 'Données test' },
    { titre: 'Création', valeur: this.entreprise.creation, detail: 'Date d’immatriculation' },
    { titre: 'Activité', valeur: '6312Z', detail: 'Portails Internet' },
    { titre: 'Effectif', valeur: this.entreprise.effectif, detail: 'Estimation' },
  ];

  onOuvrirDossier() {
    console.log('Ouvrir dossier');
  }

  onExporter() {
    console.log('Exporter');
  }
}
