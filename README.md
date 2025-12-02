# Projet 1 : Lettre de fin de mission

## Description

**Qu'est-ce que c'est ?**

C'est une **application web** qui génère presque automatiquement des lettres de fin de mission personnalisées. Au lieu de remplir manuellement chaque lettre, cette application :
- Récupère les informations du client depuis la base de données
- Les organise automatiquement
- Génère un fichier Word prêt à être exporté en PDF et une présentation PowerPoint personnalisés

**Comment ça fonctionne ?**

L'application se divise en 3 parties principales :
1. **Interface de saisie** (site web) - où vous remplissez les informations
2. **Moteur de traitement** (serveur) - qui organise les données
3. **Base de données** - qui stocke les dossiers clients

---

## Technologies utilisées

### Frontend (Ce qui est affiché à l'écran)
- **Angular** — Framework qui gère l'interface web
- **TypeScript** — Langage de programmation utilisé pour Angular
- **HTML** — Structure de la page
- **SCSS** — Mise en forme et styles

### Backend (Ce qui fonctionne en arrière-plan)
- **Node.js avec Express** — Serveur qui reçoit les demandes et envoie les réponses
- **SQL Server** — Base de données où sont stockées les infos
- **JWT** — Système de sécurité
- **PDF-Parse + Python** — Outil pour extraire les informations des fichiers PDF

---

## Comprendre Angular et Node.js

### Qu'est-ce qu'Angular ?

**Angular** est un **framework web** (un ensemble d'outils) qui crée des applications web interactives.

**Concrètement ici :**
- Angular crée l'**interface web** que les utilisateurs voient sur leur écran
- Quand vous cliquez sur un bouton, Angular gère :
  - L'affichage/masquage d'éléments
  - L'envoi des données au serveur
  - La réception des réponses
  - L'affichage des résultats

### Qu'est-ce que Node.js ?

**Node.js** est un **serveur web** qui exécute du code JavaScript côté serveur.

**Concrètement ici :**
- Node.js crée le **serveur** qui reçoit les demandes d'Angular
- Le serveur :
  - Reçoit les données/demandes du frontend
  - Les vérifie
  - Va les chercher en base de données (optionnel)
  - Traite les données (ex : appels IA, extraction de PDF, génération de documents)
  - Renvoie la réponse à Angular

### Comment Angular et Node.js travaillent ensemble ?

**Exemple : L'utilisateur clique sur le bouton "Reformuler" dans le formulaire**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND (Angular) - Ce que vous voyez à l'écran                            │
│                                                                             │
│  1. L'utilisateur tape du texte dans une zone de texte (textarea)           │
│  2. L'utilisateur clique sur le bouton "Reformuler"                         │
│                                                                             │
│  3. Angular (composant bouton-textarea.ts) :                                │
│     - Détecte le clic sur le bouton                                         │
│     - Récupère le texte du textarea                                         │
│     - Appelle le service "aiService" avec le texte                          │
│     - Affiche un "Reformulation en cours..." pour indiquer à l'utilisateur  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
                    REQUÊTE HTTP (Angular → Node.js)
                    POST /api/ai/generate-comment
                    {
                      "type": "reformuler",
                      "contexte": texte à reformuler
                    }
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ BACKEND (Node.js) - Ce qui se passe en arrière-plan                         │
│                                                                             │
│  4. Node.js reçoit la requête sur la route /generate-comment                │
│                                                                             │
│  5. Express (serveur) envoie la requête au "commentController"              │
│                                                                             │
│  6. Le controller fait appel à "aiService" (service backend) qui :          │
│     - Récupère le type de requète et texte à reformuler                     │
│     - Appelle l'API Mistral (service d'IA)                                  │
│     - Reçoit le texte reformulé de Mistral                                  │
│     - Retourne le texte reformulé                                           │
│                                                                             │
│  7. Le controller prépare la réponse :                                      │
│     {                                                                       │
│       "comment": texte reformulé,                                           │
│       "json": utile uniquement lors du commentaire sur les investissements  │
│     }                                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
                     RÉPONSE HTTP (Node.js → Angular)
                    {
                      "comment": texte reformulé,
                      "json": null
                    }
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND (Angular) - Affichage du résultat                                  │
│                                                                             │
│  8. Angular reçoit la réponse du serveur                                    │
│                                                                             │
│  9. Angular (aiService) retourne le texte au composant                      │
│                                                                             │
│  10. Le composant bouton-textarea.ts :                                      │
│      - Arrête l'affichage "Reformulation en cours..."                       │
│      - Met à jour le textarea avec le texte reformulé                       │
│      - Affiche le nouveau texte à l'écran                                   │
│                                                                             │
│  11. L'utilisateur voit : texte reformulé                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Résumé du cycle complet :**
1. Utilisateur clique → Angular détecte
2. Angular envoie les données → Node.js traite
3. Node.js appelle l'IA → Mistral répond
4. Node.js renvoie le résultat → Angular affiche


### Où se trouve le code d'Angular et Node.js ?

**Angular** (Frontend) :
- Dossier : `/frontend/src/app/`
- Fichiers `.ts` (TypeScript) et `.html`
- C'est le code visible à l'écran

**Node.js** (Backend) :
- Dossier : `/backend/src/`
- Fichiers `.js` (JavaScript)
- C'est le code qui traite les demandes

### Comment les développeurs les utilisent ?

**Pour Angular :**
- Modifier l'interface = modifier les fichiers `.html` et `.scss`
- Ajouter une fonctionnalité = modifier les fichiers `.ts` (TypeScript)
- Appeler le serveur = utiliser les `services.ts`

**Pour Node.js :**
- Créer une nouvelle API = ajouter une route dans `/routes/`
- Traiter les données = ajouter un controller dans `/controllers/`
- Réutiliser du code = créer une fonction dans `/services/`

**Exemple : "Je veux ajouter un bouton pour télécharger la lettre en PDF"**

1. **Frontend (Angular)** :
   - Ajouter un bouton dans le `.html`
   - Ajouter une fonction dans le `.ts` qui appelle l'API

2. **Backend (Node.js)** :
   - Créer une route `/api/download-pdf`
   - Créer un controller qui convertit le Word en PDF
   - Renvoyer le fichier

### Base de données
- Table `Aggregats_FEC`:
   - C'est un résumé de la table FEC pour chaque couple **code_client/datefinex**.
   - Elle contient la majorité des informations nécessaires pour remplir la lettre de fin de mission.
   - Elle est mise à jour automatiquement lors de l'import de données dans la table **FEC**.
- Table `attente_fec`:
   - Contient les couples **code_client/datefinex** en attente de traitement.
   - Lorsque des données sont importées dasn la table **FEC**, leurs identifiants sont  stocké ici avant d'être traité et inséré dans la table **Aggregats_FEC** par un scipt **powershell**.
- Table `analyse_sectorielle`:
   - Contient les informations des analyses sectorielles pour chaque code NAF.

---

## Architecture du projet

```
.
├── frontend/                 # Application Angular
│   ├── src/
│   │   ├── app/
│   │   │   ├── pages/       # Pages principales
│   │   │   ├── services/    # Services (API, authentification)
│   │   │   ├── interceptor/ # Intercepteurs (authentification)
│   │   │   ├── directives/  # Directives personnalisées
│   │   │   ├── shared/      # Composants partagés
│   │   │   └── config/      # Configuration
│   │   └── styles/          # Styles globaux
│   └── angular.json
│
├── backend/                  # API Node.js / Express
│   ├── src/
│   │   ├── server.js        # Point d'entrée
│   │   ├── controllers/     # Logique métier
│   │   ├── services/        # Services (extraction, traitement)
│   │   ├── routes/          # Définition des routes API
│   │   ├── middlewares/     # Middlewares (authentification, etc.)
│   │   ├── config/          # Configuration (DB, prompts)
│   │   ├── templates/       # Templates (DOCM, PPTM)
│   │   ├── utils/           # Scripts Python et utilitaires
│   │   └── uploads/         # Fichiers uploadés temporaires
│   └── package.json
└── README.md                # Documentation du projet
```

---

## Installation et démarrage

### Prérequis (Avant de commencer)

Avant de lancer l'application, vous devez avoir installé :
- **Node.js** — [Télécharger ici](https://nodejs.org/)
- **SQL Server** — [Télécharger ici](https://www.microsoft.com/sql-server/)
- **Python** — [Télécharger ici](https://www.python.org/downloads/release/python-3137/)

### Vérifier l'installation

Ouvrez l'**invite de commande** (cmd ou PowerShell) et tapez :
```bash
node --version
npm --version
python --version
```

Vous devriez voir les numéros de version.

---

### Étape 1 : Télécharger le projet

```bash
git clone https://github.com/ldebouche/Projet1_lettre_fin_de_mission.git
cd Projet1_lettre_fin_de_mission
```

Cela télécharge tous les fichiers du projet sur votre ordinateur.

---

### Étape 2 : Configurer et démarrer le BACKEND

Le backend, c'est le serveur qui fait tourner l'application.

```bash
cd backend
npm install
```

Cela télécharge tous les outils nécessaires pour faire fonctionner le serveur.

**Ensuite, demandez moi le fichier `.env`** (fichier de configuration) :
- Copiez-le dans le dossier `backend/src`

**Puis démarrez le serveur :**
```bash
cd src
node server.js
```

Si vous voyez 
```bash
[dotenv@17.2.2] injecting env (17) from .env -- tip: 🛠️  run anywhere with `dotenvx run -- yourcommand`
[dotenv@17.2.2] injecting env (0) from .env -- tip: 📡 auto-backup env with Radar: https://dotenvx.com/radar
API disponible sur toutes les interfaces
Connexion SQL OK
```
C'est bon !

---

### Étape 3 : Configurer et démarrer le FRONTEND

Le frontend, c'est ce que vous voyez dans le navigateur.

**Ouvrez une NOUVELLE fenêtre d'invite de commande** et tapez :

```bash
cd frontend
npm install
```

Cela télécharge tous les outils pour l'interface.

**Puis démarrez l'interface :**
```bash
ng serve --host=0.0.0.0 --port=4200 --proxy-config proxy.conf.json
```

ça ouvre deux sessions :
- **intranet** : http://mon_ip:4200
- **localhost** : http://localhost:4200

Pour le moment il faut allez sur **http://localhost:4200** dans votre navigateur car il n'y a pas encore de serveur.

---

## Comment utiliser l'application (pour un utilisateur)

1. **Ouvrir l'application**
   - Aller sur : `http://localhost:4200` (ou l’URL intranet quand le serveur sera en place).

2. **Se connecter**
   - Utilisation de la connexion via **Microsoft** donc normalement il n'y a pas besoin de rentrer des identifiants.

3. **Sélectionner un dossier client**
   - Saisir le **code client**, la **date de début de mission** et la **date de fin de mission**.
   - L’application vérifie que le dossier existe dans la base SQL.
   - Si le dossier est trouvé -> redirection vers la gestion du dossier (début, milieu et fin de mission).

4. **Paramétrer la lettre de fin de mission**
   - Remplir le formulaire avec les informations demandées.
   - Les champs obligatoires sont indiqués.
   - Certains champs sont pré-remplis avec les données extraites de la base SQL.
   - Des commentaires et reformulations sont proposés grâce à l'ia pour aider à la rédaction.
   - Toujours vérifier les informations extraites et générées.

5. **Générer les documents**
   - Cliquer sur **“Enregistrer”** en bas à droite.
   - L’application :
     - Récupère les données du formulaire,
     - Remplit le modèle Word,
     - Remplit le modèle PowerPoint.
   - Les résultat sont disponibles à ce chemin d'accès : (rien pour le moment car pas de serveur).

6. **Exporter en PDF (optionnel)**
   - Ouvrir le `.docm`,
   - Un bouton est disponible pour exporter au format PDF. Il se trouve dans la barre d'outils accès rapide (à gauche du nom du fichier).
   
   ![alt text](/frontend/src/assets/image.png)


---

# Organisation du code (pour les développeurs)

## 1. Structure du frontend (Angular)

### `/frontend/src/`
Contient toute la logique de l'application Angular.

| Dossier | Rôle |
|--------|------|
| `app/pages/` | Contient les pages principales (accueil, sélection dossier, formulaire, récapitulatif). |
| `app/services/` | Contient les appels API et la logique métier côté client. |
| `app/interceptor/` | Intercepte les requêtes HTTP (authentification Microsoft + gestion des erreurs API). |
| `app/directives/` | Directives Angular personnalisées. |
| `app/shared/` | Composants réutilisables (boutons, barre de navigation). |
| `assets/` | Contient les images et logo. |
| `styles/` | Style global du projet (SCSS). |

### Comment les fichiers Angular s’articulent ?
- Une **page** utilise un ou plusieurs **services** pour appeler le backend.  
- Les services envoient des requêtes HTTP définies dans `proxy.conf.json`.  
- L’interceptor ajoute automatiquement :
  - le token Microsoft,
  - la gestion des erreurs API.


---

## 2. Structure du backend (Node.js / Express)

### `/backend/src/`

| Dossier / fichier | Rôle |
|------------------|------|
| `server.js` | Point d’entrée : création du serveur Express, configuration globale. |
| `routes/` | Définit les endpoints API (ex : `/api/dossier`, `/api/lettre`). |
| `controllers/` | Contient la logique métier déclenchée lors d’un appel API. |
| `services/` | Regroupe les fonctions réutilisables : extraction SQL, génération document, IA, etc. |
| `middlewares/` | Authentification JWT, vérification des droits, validation des données. |
| `config/` | Configuration générale : connexion SQL, prompts ia. |
| `templates/` | Modèles Word/PPT utilisés pour générer les documents finaux. |
| `utils/` | Scripts Python et helpers Node.js. |
| `uploads/` | Fichiers uploadés temporairement par l’utilisateur. |
| `.env` | Fichier de configuration avec les variables d’environnement (non versionné). |

**Exemple (l'utilisateur veut générer un commentaire via ia):**
1. L’utilisateur clique sur "générer un commentaire".
2. Angular envoie les données via `/api/generate-comment`.
3. La route appelle `CommentController.js`.
4. Le controller appelle :
   - `aiService.js` pour géré l'appel à l'ia via `callMistral` qui va générer le commentaire.
5. Les données générées sont renvoyés et affichées à l'écran.

### Principales routes API backend

| Route | Méthode | Description |
|------|---------|-------------|
| `/api/db/verifDossier` | POST | Vérifie qu’un dossier existe en base |
| `/api/db/getDossierInfos` | GET | Récupère une majorité des infos du dossier |
| `/api/ai/generate-comment` | POST | Appelle l’IA (Mistral) |
| `/api/word/generateWord` | POST | Génère les documents Word & PowerPoint |


### Rôle des services backend

- **dbService.js**  
  Gère toutes les requêtes SQL (Aggregats_FEC, analyse sectorielle, dossiers).

- **aiService.js**  
  Centralise les appels IA (Mistral), formats des prompts et réponses.

- **wordService.js**  
  Gère la création des fichiers Word/PPT à partir des données du formulaire.

- **pdfService.js**  
  Gère l'extraction des données des PDF.

---

## Problèmes connus et contournements

Voici les problèmes qui m'arrivent souvent lors du développement/déploiement, et comment les contourner rapidement.

- **Fichier `.env` manquant ou mal configuré**
   - Symptômes : erreurs au démarrage, connexion SQL KO, clés API manquantes.
   - Contournement : Vérifier que les valeurs du `.env` sont bonnes, puis redémarrer le serveur (`node server.js`).

- **Connexion SQL échoue**
   - Symptômes : timeout lors des requêtes.
   - Contournement : le problème vient de SQL il faut attendre.

- **Clé API IA manquante / quota atteint**
   - Symptômes : erreurs depuis `aiService`, réponses d'erreur de l'API Mistral
   - Contournement : remplacer `MISTRAL_MODEL` dans `.env` par un modèle plus léger (mistral-large-latest > mistral-medium-latest > mistral-small-latest), sinon attendre qu'il y ait moins de requètes en même temps.

- **Création WORD/Power Point qui échoue**
   - Symptômes : erreurs lors de la génération des documents
   - Contournement : vérifier que le fichier n'est pas déjà ouvert.

