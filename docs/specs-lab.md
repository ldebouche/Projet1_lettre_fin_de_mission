# Spécifications fonctionnelles — Module LAB / KYC
> Basé sur les Annexes 1 et 2 du contrat de développement AVENIA SOLUTIONS NUMERIQUES
> Version : 2 mars 2026

---

## 1. Périmètre fonctionnel

L'applicatif couvre les obligations LCB-FT (Lutte Contre le Blanchiment de Capitaux et le
Financement du Terrorisme) pour les cabinets d'expertise-comptable.

### Modules inclus
- Gestion des dossiers clients (personnes physiques et morales)
- Collecte et mise à jour des informations KYC
- Classification et suivi du risque LAB
- Gestion des événements et des diligences associées
- Revue périodique des dossiers
- Cartographie des risques et indicateurs de pilotage

### Exclusions explicites
- Pas d'intégration Microsoft Teams ou SharePoint
- Pas de gestion des diligences via tâches Teams/SharePoint
- Pas d'obligation d'utiliser Power BI ou outils externes

---

## 2. Référentiel clients et dossiers

### 2.1 Création et gestion des dossiers clients

Chaque dossier client contient au minimum :
- Identité et coordonnées (nom, forme juridique, adresse, contacts)
- Données d'identification légale (SIREN/SIRET, RCS, code APE)
- Informations fiscales et pays de résidence
- Nature de la relation (comptabilité, audit, mission sociale, juridique...)

Chaque dossier est rattaché à un cabinet et peut être associé à un ou plusieurs
interlocuteurs internes (collaborateur, associé, responsable LAB).

### 2.2 Bénéficiaires effectifs et parties liées

Le système gère les bénéficiaires effectifs (BO) :
- Fiche par bénéficiaire effectif : identité, nationalité, % détention/contrôle
- Possibilité de lier plusieurs BO au même client
- Historisation des modifications (ajout/suppression, changement de %)

---

## 3. Module KYC

### 3.1 Données KYC structurées

Pour chaque client, écrans de saisie et consultation comprenant :
- Profil et activité (secteur, taille, zone géographique, volume d'affaires)
- Origine des fonds et de la richesse (si requis)
- Niveau de complexité de la structure juridique
- Exposition à des pays ou zones à risques
- Statut PEP (Personne Politiquement Exposée) ou lien avec une PEP

### 3.2 Gestion documentaire KYC

L'applicatif permet de :
- Référencer les pièces KYC exigées (KBIS, statuts, pièces d'identité, justificatifs,
  organigrammes...)
- Indiquer pour chaque pièce : type, date de délivrance, date d'échéance, statut
  (reçue / manquante / périmée)
- Suivre les manquements documentaires via événements et diligences

> Les pièces peuvent être stockées dans un espace documentaire externe ou interne.
> L'applicatif gère au minimum les références (nom, filepath, état).

---

## 4. Classification du risque et cartographie

### 4.1 Référentiel de scoring

Modèle de scoring du risque client basé sur les exigences LCB-FT :

| Critère | Pondération |
|---|---|
| Pays / zones géographiques à risque | Élevée |
| Secteur d'activité sensible | Moyenne |
| Volume et nature des opérations | Normale |
| Complexité de la structure juridique | Moyenne |
| Présence PEP ou éléments particuliers | Très élevée |
| Historique des événements / alertes | Élevée |
| Présence sous sanctions / gel des avoirs | Maximum |

- Calcul d'un score global : **Faible / Moyen / Élevé**
- Modèle paramétrable (seuils, pondérations) par AVENIA ou le cabinet

### 4.2 Suivi du niveau de risque dans le temps

Historique conservé :
- Scores successifs de risque
- Éléments ayant conduit à une variation (événements déclencheurs)
- Alimentation de la cartographie des risques (répartition par niveau, secteur, zone)

---

## 5. Gestion des événements et diligences

### 5.1 Typologie d'événements

| Type | Description |
|---|---|
| `ENTREE_RELATION` | Entrée ou pré-entrée en relation |
| `PIECE_MANQUANTE` | Pièce KYC absente du dossier |
| `PIECE_PERIMEE` | Pièce KYC expirée |
| `CHANGEMENT_BE` | Nouveau bénéficiaire effectif ou modification détention |
| `CHANGEMENT_KYC` | Modification significative des données KYC |
| `CHANGEMENT_RISQUE` | Variation du niveau de risque |
| `TRANSACTION_ATYPIQUE` | Opération ou transaction suspecte |
| `REVUE_ANNUELLE` | Revue périodique du dossier |
| `AUTRE` | Autre fait générateur |

Chaque événement est enregistré avec :
- Un type, une date, un niveau de criticité
- Un état : `Ouvert` / `En_cours` / `Cloture`
- La liste des diligences associées

### 5.2 Diligences internes

Pour chaque événement, une ou plusieurs diligences internes :
- Intitulé (ex : "Demander KBIS à jour", "Vérifier origine des fonds")
- Responsable interne (utilisateur / rôle)
- Date d'échéance souhaitée
- Statut : `A_faire` / `En_cours` / `Realisee` / `Abandonnee`
- Commentaires et pièces associées

> Aucune intégration Teams/SharePoint. Tout est géré dans l'interface de l'applicatif.

---

## 6. Revue périodique des dossiers

### 6.1 Principe

- Récurrence de revue définie par dossier (annuelle par défaut)
- Date de prochaine revue calculée automatiquement
- À échéance : génération automatique d'un événement `REVUE_ANNUELLE`
  avec diligences associées (check-list)

### 6.2 Check-list de revue

La revue s'appuie sur un questionnaire interne :

| Code question | Libellé |
|---|---|
| `KYC_MAJ` | Vérification / mise à jour des informations KYC |
| `RISQUE_VERIFIE` | Contrôle du niveau de risque et des critères |
| `PIECES_COMPLETES` | Vérification complétude et actualité des pièces |
| `OPS_ATYPIQUES` | Analyse d'éventuelles opérations atypiques |
| `CONCLUSION` | Conclusions de la revue (maintien / augmentation / diminution) |

Les résultats sont historisés et alimentent le suivi du risque.

---

## 7. Indicateurs et tableaux de bord

Écrans de tableaux de bord affichant :
- Répartition des clients par niveau de risque
- Événements ouverts / en retard / critiques
- Dossiers dont la revue annuelle est à venir (dans les 90 jours) ou en retard
- Diligences à réaliser par collaborateur ou par cabinet

> Générés nativement dans l'interface. Exports CSV/Excel possibles en complément.

---

## 8. Traçabilité et journalisation

Actions tracées dans `lab_audit_log` :

| Action | Déclencheur |
|---|---|
| `CREATION_DOSSIER` | Nouveau dossier LAB créé |
| `MODIF_KYC` | Modification fiche KYC |
| `CHANGEMENT_RISQUE` | Variation du niveau de risque |
| `CREATION_EVENEMENT` | Nouvel événement LAB |
| `CLOTURE_EVENEMENT` | Événement clôturé |
| `CREATION_DILIGENCE` | Nouvelle diligence |
| `CLOTURE_DILIGENCE` | Diligence réalisée ou abandonnée |
| `CREATION_REVUE` | Nouvelle revue périodique |
| `CLOTURE_REVUE` | Revue clôturée |
| `MODIF_PARAMETRAGE` | Modification du paramétrage cabinet |

Pour chaque action : date, utilisateur, type d'action, entité impactée.

---

## 9. Exigences techniques

- Séparation environnements dev / test / production
- Gestion des habilitations par rôles (Administrateur, Responsable LAB, Collaborateur)
- Sauvegarde et restauration des données applicatives
- Documentation technique complète
- Pas d'intégration obligatoire Microsoft 365 pour les modules cœur

---

## 10. Annexe 2 — Cahier des écrans

### Principes généraux

- Toutes les données vivantes mises à jour en quasi temps réel dans les tableaux de bord
- Actions significatives journalisées
- Droits d'accès gérés par rôles : `Administrateur` / `Responsable LAB` / `Collaborateur`

---

### Écran 1 — Dashboard Cabinet

**Route Angular** : `/lab/dashboard`
**Rôles autorisés** : Responsable LAB, Associé/Direction, Administrateur

#### Données affichées
- Nombre total de clients ventilé par niveau de risque (Faible / Moyen / Élevé)
- Répartition des clients par secteur, pays, niveau de risque
- Nombre d'événements ouverts, en retard, critiques
- Nombre de diligences en retard par collaborateur
- Volume de revues annuelles à venir dans les 90 jours / en retard

#### Composants UI
- Tuiles KPI : nb clients, % risque élevé, événements ouverts, diligences en retard,
  revues en retard
- Graphiques : histogrammes par niveau de risque / secteur / pays
- Liste d'alertes : événements / revues / diligences critiques avec liens

#### Règles de gestion
- Indicateurs recalculés automatiquement après chaque modification structurante
- Filtrage possible par collaborateur, entité, période
- Seules les données agrégées visibles (conformément aux droits d'accès)

#### Événements système
- `OUVERTURE_DOSSIER` : clic sur un client dans la liste d'alertes
- `MISEAJOUR_INDICATEURS` : après actions sur risques / événements / diligences

---

### Écran 2 — Liste Clients

**Route Angular** : `/lab/clients`
**Rôles autorisés** : Tous les utilisateurs authentifiés

#### Données affichées par ligne client
- Raison sociale / nom
- SIREN / identifiant
- Niveau de risque avec code couleur (vert / orange / rouge)
- Responsable interne
- Date de dernière revue
- Statut documentaire KYC (Complet / Incomplet / Pièces périmées)

#### Règles de gestion
- Tri par défaut : niveau de risque décroissant, puis date de prochaine revue
- Filtres multiples : risque, secteur, responsable, statut KYC, statut client
- Clients clôturés masqués par défaut (option d'affichage)

#### Événements système
- `OUVERTURE_DOSSIER` : clic sur un client

---

### Écran 3 — Dossier Client Synthèse

**Route Angular** : `/lab/dossier/:code_client`
**Rôles autorisés** : Utilisateurs autorisés sur ce client

#### Sections affichées

1. **Identité et informations générales**
   - Dénomination, forme juridique, identifiants légaux, pays, secteur, responsable, statut

2. **KYC synthétique**
   - Statut KYC, PEP, pays à risque, secteurs sensibles, complexité

3. **Bénéficiaires effectifs**
   - Liste des BO : identité, nationalité, % détention/contrôle, statut PEP/sanctions

4. **Risque**
   - Niveau actuel, score global, dernière mise à jour, lien vers écran Classification

5. **Pièces documentaires**
   - Liste synthétique avec état (attendue / reçue / périmée / non requise)

6. **Événements récents**
   - Événements ouverts/récents : type, criticité, statut

7. **Diligences en cours**
   - Synthèse des diligences "à faire / en cours"

8. **Revues**
   - Dernière revue, date de prochaine revue, lien vers écran Revue annuelle

#### Actions principales
- Modifier les informations KYC
- Ajouter / modifier / supprimer un bénéficiaire effectif
- Accéder à l'écran Classification risque
- Gérer les pièces (marquer reçue / périmée / non requise)
- Créer un événement (par type)
- Lancer une revue annuelle

#### Règles de gestion
- Détection auto des pièces périmées → événement `PIECE_PERIMEE` automatique
- Changement KYC significatif → proposition d'événement `CHANGEMENT_KYC`
- Justification obligatoire si modification manuelle du niveau de risque

#### Événements système
- `CREATION_EVENEMENT_REVUE` : sur "lancer revue"

---

### Écran 4 — Bénéficiaires Effectifs

**Route Angular** : `/lab/dossier/:code_client/beneficiaires`
**Table BDD** : `lab_beneficiaires_effectifs`

#### Données
- Liste des BE : identité, liens de contrôle, % global estimé, statut PEP/sanctions/gel
- Indicateur de détention totale (signal si < 25% ou ≥ 25%)

#### Actions
- Ajouter un BE
- Modifier / supprimer un BE existant
- Historiser une version (ancien / nouveau BE, changements de %)

#### Règles
- Toute modification produit un événement `CHANGEMENT_BE`
- Les données BE alimentent le modèle de scoring risque

---

### Écran 5 — Classification Risque

**Route Angular** : `/lab/dossier/:code_client/risque`
**Tables BDD** : `lab_scores_risque`, `lab_scoring_criteres`

#### Données
- Scores par axe (pays, secteur, PEP, structure, historique...)
- Pondérations de chaque axe (paramétrage cabinet)
- Score global et niveau de risque (Faible / Moyen / Élevé)
- Historique des scores et modifications (versioning)

#### Actions
- Ajuster manuellement un critère ou le score global (override)
- Renseigner une justification textuelle
- Valider le niveau de risque

#### Règles
- Justification obligatoire pour tout override du score calculé
- Chaque validation crée une nouvelle version avec horodatage et utilisateur
- Augmentation de niveau → création automatique événement `CHANGEMENT_RISQUE`
- Stocker toutes les versions en BDD

#### Événements système
- `CHANGEMENT_RISQUE` : avec ancien / nouveau niveau

---

### Écran 6 — Événements

**Route Angular** : `/lab/evenements` (vue cabinet) ou `/lab/dossier/:code_client/evenements`
**Table BDD** : `lab_evenements`

#### Données
- Type, date de création, criticité, responsable, statut, échéance, lien dossier

#### Actions
- Créer un nouvel événement (choix du type)
- Modifier un événement (responsable, criticité, échéance)
- Clôturer un événement avec conclusion + preuve documentaire

#### Règles
- Statut `Cloture` uniquement si toutes les diligences sont `Realisee` ou `Abandonnee`
  avec motif, et si une conclusion est renseignée
- Pour `TRANSACTION_ATYPIQUE` : champ obligatoire TRACFIN déclaré (oui/non + commentaire)

---

### Écran 7 — Diligences

**Route Angular** : `/lab/diligences` (vue cabinet) ou par événement
**Table BDD** : `lab_diligences`

#### Données
- Type, événement parent, responsable, échéance, statut, commentaires, lien dossier

#### Actions
- Créer une diligence rattachée à un événement
- Changer le statut (A_faire / En_cours / Realisee / Abandonnee)
- Renseigner date de réalisation, motif d'abandon, joindre un justificatif

#### Règles
- Aucune tâche externe Teams/SharePoint — tout géré dans cet écran
- Les diligences alimentent le calcul du respect des SLA

---

### Écran 8 — Transactions Atypiques

**Route Angular** : `/lab/dossier/:code_client/transactions`
**Tables BDD** : `lab_transactions_atypiques`, `FEC_2024`, `FEC_2025`, `fec_2026`

#### Actions
- Marquer une transaction comme atypique
- Créer une diligence (analyse complémentaire, demande de justificatifs)
- Ignorer avec justification éventuelle

#### Événements système
- `TRANSACTION_SUSPECTE` : créé quand une transaction est marquée suspecte

---

### Écran 9 — TRACFIN

**Route Angular** : `/lab/tracfin`
**Table BDD** : `lab_tracfin`

#### Données
- Liens aux événements / transactions / clients concernés
- Questionnaire spécifique (points clés de la déclaration)
- Liste des diligences effectuées préalablement

#### Actions
- Renseigner / compléter le questionnaire
- Générer un rapport PDF de synthèse

#### Événements système
- `REVUE_COMPLETE` : dossier TRACFIN intégralement documenté

---

### Écran 10 — Revue Annuelle

**Route Angular** : `/lab/dossier/:code_client/revue`
**Tables BDD** : `lab_revues`, `lab_revues_reponses`

#### Données
- Questionnaire de revue (KYC à jour, pièces, risque, événements de l'année)
- Statut de la revue, date, responsable, conclusions

#### Actions
- Répondre au questionnaire
- Proposer maintien / relèvement / abaissement du niveau de risque
- Clôturer la revue (mise à jour de la prochaine échéance)

#### Règles
- La revue crée / clôture un événement de type `REVUE_ANNUELLE`
- L'historique des revues alimente l'historique de risque et la cartographie

---

### Écran 11 — Paramétrage Cabinet

**Route Angular** : `/lab/parametrage`
**Tables BDD** : `lab_parametrage`, `lab_scoring_criteres`, `lab_scoring_valeurs_ref`
**Rôles autorisés** : Administrateur uniquement

#### Modules de paramétrage
- Référentiel des risques (critères, pondérations, seuils)
- Référentiel pays (catégorisation par niveau de risque)
- Référentiel secteurs (sensibles / non sensibles)
- SLA et règles de délai pour diligences / revues

#### Règles
- Versioning du paramétrage (historique des jeux de paramètres)
- Modifications journalisées dans `lab_audit_log`

---

## 11. Sécurité et RBAC

| Rôle | Droits |
|---|---|
| `Administrateur` | Accès complet + paramétrage |
| `Responsable LAB` | Lecture/écriture tous dossiers + validation risques |
| `Collaborateur` | Lecture/écriture dossiers assignés uniquement |

- Chiffrement des données sensibles côté stockage
- Journalisation des actions critiques : connexion, modification paramétrage,
  changement risque, clôture événements TRACFIN

---

## 12. Routes API backend (référence)

Convention alignée sur le reste du projet (ex. `db-service.ts`) : les identifiants et filtres sont passés en **query string**, pas en segment d’URL (`?nom_param=valeur`).

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/lab/dossiers` | Liste des dossiers LAB |
| GET | `/api/lab/dossier?code_client=...` | Détail dossier synthèse |
| POST | `/api/lab/dossier` | Créer un dossier LAB |
| PUT | `/api/lab/dossier?code_client=...` | Modifier un dossier LAB |
| GET | `/api/lab/kyc?code_client=...` | Données KYC client |
| PUT | `/api/lab/kyc?code_client=...` | Mettre à jour KYC |
| GET | `/api/lab/beneficiaires?code_client=...` | Liste des BE |
| POST | `/api/lab/beneficiaires` | Ajouter un BE |
| PUT | `/api/lab/beneficiaires?id=...` | Modifier un BE |
| DELETE | `/api/lab/beneficiaires?id=...` | Supprimer un BE |
| GET | `/api/lab/scores?code_client=...` | Historique scores risque |
| POST | `/api/lab/scores` | Calculer / valider un score |
| GET | `/api/lab/evenements` | Liste événements (cabinet) |
| GET | `/api/lab/evenements?code_client=...` | Événements par client |
| POST | `/api/lab/evenements` | Créer un événement |
| PUT | `/api/lab/evenements?id=...` | Modifier un événement |
| POST | `/api/lab/evenements/cloturer?id=...` | Clôturer un événement |
| GET | `/api/lab/diligences` | Liste diligences (cabinet) |
| GET | `/api/lab/diligences?id_evenement=...` | Diligences par événement |
| POST | `/api/lab/diligences` | Créer une diligence |
| PUT | `/api/lab/diligences?id=...` | Modifier une diligence |
| GET | `/api/lab/pieces?code_client=...` | Pièces KYC client |
| POST | `/api/lab/pieces` | Référencer une pièce |
| PUT | `/api/lab/pieces?id=...` | Mettre à jour une pièce |
| GET | `/api/lab/revues?code_client=...` | Revues client |
| POST | `/api/lab/revues` | Créer une revue |
| PUT | `/api/lab/revues/cloturer?id=...` | Clôturer une revue |
| GET | `/api/lab/transactions?code_client=...` | Transactions atypiques |
| POST | `/api/lab/transactions` | Signaler une transaction |
| GET | `/api/lab/tracfin` | Dossiers TRACFIN |
| POST | `/api/lab/tracfin` | Créer un dossier TRACFIN |
| GET | `/api/lab/dashboard` | Indicateurs dashboard |
| GET | `/api/lab/parametrage` | Paramétrage cabinet |
| PUT | `/api/lab/parametrage` | Modifier paramétrage |
| GET | `/api/lab/audit?code_client=...` | Journal audit client |
