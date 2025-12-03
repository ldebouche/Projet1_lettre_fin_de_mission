
# Projet 1 : Lettre de Fin de Mission

## 1.1 Principe général

```
[Collaborateur]
     ↓
[Frontend Angular]
     ↓  (MSAL – Authentification Microsoft)
     ↓
[Backend Node.js (Express)]
     ↓  (Validation token Microsoft + JWT interne dossier)
     ↓
[Base SQL Server] ←→ [IA Mistral] ←→ [Génération Word/PPTX]
```

Chaque requête envoyée par Angular peut contenir :

- un **token Microsoft** (obligatoire pour les endpoints protégés),
- un **cookie interne jwt_dossier** (si un dossier a été validé).

Ces informations permettent au backend :

- d'identifier le collaborateur,
- de valider les droits,
- de charger les informations du dossier sélectionné.

-------------------------------------------------------------------------------

# 2. Structure du frontend Angular

```
frontend/src/app/
├── pages/              # Pages principales
│   ├── accueil/
│   ├── login/
│   ├── dashboard/
│   └── lettre_fin_mission/
│       ├── sections/    ← Sections du formulaire  
│       └── formulaire.ts    ← Formulaire principal
├── services/           # Services d'appels API
│   ├── ai-service.ts
│   ├── auth-service.ts
│   ├── db-service.ts
│   ├── word-service.ts
│   ├── pdf-service.ts
│   └── ...
├── interceptor/
│   └── auth.interceptor.ts  ← Ajoute le token microsoft à chaque requête
├── directives/
│   └── zero-if-empty.ts
└── shared/             # Composants réutilisables
    ├── bouton-textarea/
    └── navbar/
```

## 2.1 Rôle des dossiers

- **pages/**  
  Contient les pages principales.  
  Exemple : dashboard, sélection dossier, formulaire complet.

- **services/**  
  Encapsule toute la logique métier du frontend :
  - appel API,
  - stockages centralisés,
  - formatages de données,
  - interactions avec l’IA.

- **interceptor/**  
  Injection automatique du token Microsoft dans chaque requête HTTP.

- **directives/**  
  Petits comportements réutilisables, comme l’affichage de zéro si aucune donnée.

- **shared/**  
  Composants génériques : navbar, boutons IA.

-------------------------------------------------------------------------------

# 3. Angular

## 3.1 Composants Angular – Fondements théoriques

Un composant Angular est constitué de :

1. un template HTML (vue),
2. un fichier SCSS (style isolé),
3. un fichier TypeScript (logique)

```ts
@Component({
  selector: 'app-exemple',
  templateUrl: './exemple.component.html',
  styleUrls: ['./exemple.component.scss']
})
export class ExempleComponent implements OnInit {
  @Input() titre: string = '';
  @Output() onChange = new EventEmitter<string>();

  value = '';

  ngOnInit() {
    console.log("Composant initialisé");
  }

  notifier() {
    this.onChange.emit(this.value);
  }
}
```

### Points importants

- `@Input()` permet au parent de passer des données.
- `@Output()` renvoie des événements au parent.
- `ngOnInit()` est le point d’entrée logique du composant.

-------------------------------------------------------------------------------

## 3.2 Data Binding – Explications approfondies

### 3.2.1 Interpolation
Permet d'afficher des valeurs :

```html
<p>{{ client.nom }}</p>
```

### 3.2.2 Property Binding
Permet de lier des propriétés HTML à des variables TypeScript :

```html
<input [disabled]="loading">
```

### 3.2.3 Event Binding
Permet de lier des événements HTML à des méthodes TypeScript :

```html
<button (click)="valider()">Envoyer</button>
```

### 3.2.4 Two-Way Binding
Permet de synchroniser une variable TypeScript avec un champ HTML :

```html
<input [(ngModel)]="texte">
```

-------------------------------------------------------------------------------

## 3.3 Directives

### 3.3.1 *ngIf

```html
<div *ngIf="dossierCharge; else enAttente">
  Le dossier est prêt.
</div>
<ng-template #enAttente>
  Chargement...
</ng-template>
```

### 3.3.2 *ngFor

```html
<li *ngFor="let element of liste">{{ element }}</li>
```

-------------------------------------------------------------------------------

## 3.4 Services Angular

Un service Angular est une classe instanciée via le système d’injection de dépendances.

Rôle :

- appel API (HttpClient),
- stockage local (mais pas persistant),
- communication entre composants.

```ts
@Injectable({ providedIn: 'root' })
export class AiService {
  private http = inject(HttpClient);

  generateComment(type: string, contexte: any) {
    return this.http.post('/api/ai/generate-comment', { type, contexte });
  }
}
```

-------------------------------------------------------------------------------

## 3.5 Observables et RxJS

RxJS est une librairie réactive utilisée partout dans Angular.  
Un Observable représente un flux de données :

```ts
this.db.getDossierInfos().subscribe({
  next: data => console.log(data),
  error: err => console.error(err),
  complete: () => console.log("Terminé")
});
```

Principaux opérateurs utiles dans ce projet :

- `map()` : transformation,
- `catchError()` : gestion d’erreurs,
- `switchMap()` : enchaînement d'appels API,
- `tap()` : exécuter une action intermédiaire.

-------------------------------------------------------------------------------

## 3.6 Routing Angular

Angular utilise un système de routes déclaratives.

```ts
export const routes: Routes = [
  { path: '', component: AccueilComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'formulaire', component: FormulaireComponent }
];
```

Une route est associée à un composant (une page).

-------------------------------------------------------------------------------

## 3.7 Formulaires (Reactive Forms)

Le projet utilise principalement les Reactive Forms pour :

- la validation stricte,
- la réactivité avancée,
- le patch automatique des données SQL.

```ts
this.form = this.fb.group({
  titre: ['', Validators.required],
  commentaire: ['']
});
```

-------------------------------------------------------------------------------

## 3.8 Interceptor HTTP – Injection du Token Microsoft

Tous les appels API du frontend passent par l’interceptor :

```ts
const cloned = req.clone({
  setHeaders: {
    Authorization: `Bearer ${token}`
  }
});
```

Cela garantit que toutes les requêtes privées sont authentifiées.

-------------------------------------------------------------------------------

# 4. Authentification Microsoft via MSAL


## 4.1 Fonctionnement détaillé de MSAL

### Étape 1 – Vérification initiale

Lorsqu’un utilisateur arrive sur l’application, Angular interroge MSAL :

- MSAL vérifie si un compte est déjà chargé,
- sinon MSAL tente une connexion silencieuse (SSO),
- si non possible → ouverture popup.

### Étape 2 – Popup Microsoft

L’utilisateur sélectionne son compte professionnel.  
Azure AD génère ensuite :

- un **ID Token** (identité),
- un **Access Token** pour appeler les APIs autorisées.

### Étape 3 – Stockage MSAL

Les tokens ne sont jamais stockés dans localStorage.  
MSAL utilise une mémoire interne et chiffrée.

### Étape 4 – Interceptor Angular

Avant chaque requête :

- récupération du compte actif,
- appel `acquireTokenSilent()`,
- ajout du header Authorization.

### Étape 5 – Validation backend

Node.js valide :

- signature cryptographique,
- issuer Azure AD,
- audiences autorisées.

-------------------------------------------------------------------------------

## 4.2 Configuration MSAL

```ts
export const msalConfig: MsalConfiguration = {
  auth: {
    clientId: "67336009-376f-424b-882b-8662f86e5eed",
    authority: "https://login.microsoftonline.com/f7f506f7-c551-4a8a-8c5a-b7d339828e4b",
    redirectUri: "http://localhost:4200"
  },
  cache: { cacheLocation: "sessionStorage" }
};
```

-------------------------------------------------------------------------------

# 5. Backend Node.js

## 5.1 Structure du projet

```
backend/src/
├── server.js              # Point d'entrée
├── routes/                # Endpoints API
│   ├── dbRoutes.js
│   ├── aiRoutes.js
│   ├── wordRoute.js
│   ├── pdfRoutes.js
│   └── dashboardRoute.js
├── controllers/           # Logique métier
│   ├── dbController.js
│   ├── commentController.js
│   ├── wordController.js
│   ├── pdfController.js
│   └── ...
├── services/             # Fonctions réutilisables
│   ├── dbService.js
│   ├── aiService.js
│   ├── wordService.js
│   ├── pdfService.js
│   └── ...
├── config/               # Configuration
│   ├── db.js
│   └── prompts.json
├── templates/            # Templates Word/PowerPoint
├── utils/                # Scripts Python, helpers
└── uploads/              # Fichiers générés
```

## 5.2 server.js

```js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import dbRoutes from './routes/dbRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import wordRoutes from './routes/wordRoute.js';
import pdfRoutes from './routes/pdfRoutes.js';

dotenv.config();
const app = express();

app.use(cors({ origin: "http://10.25.10.143:4200", credentials: true }));
app.use(express.json());

app.use('/api/db', dbRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/word', wordRoutes);
app.use('/api/pdf', pdfRoutes);

app.listen(process.env.PORT || 4000, "0.0.0.0", () => {
  console.log("API disponible sur toutes les interfaces");
});
```

## 5.3 Routes - Endpoints API

**Exemple : `routes/dbRoutes.js`**

```js
import express from 'express';
import dbController from '../controllers/dbController.js';

const router = express.Router();

router.get('/getDossierInfos', dbController.getDossierInfos);
router.post('/verifDossier', dbController.verifDossier);

export default router;
```

## 5.4 Controllers - Traiter les requêtes

**Exemple : `controllers/commentController.js`**

```js
export const generateComment = async (req, res) => {
  try {
    const { type, contexte } = req.body;
    const result = await aiService.generateComment(type, contexte);
    res.json({ success: true, comment: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

## 5.5 Services - Logique réutilisable

**Exemple : `services/aiService.js`**

```js
import { Mistral } from '@mistralai/mistralai';

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

export const generateComment = async (type, contexte) => {
  const prompt = type === 'reformuler' 
    ? `Reformulez ce texte:\n${contexte}`
    : `Analysez ce texte:\n${contexte}`;

  const response = await client.chat.complete({
    model: process.env.MISTRAL_MODEL || 'mistral-large-latest',
    messages: [{ role: 'user', content: prompt }]
  });

  return response.choices[0].message.content;
};
```

-------------------------------------------------------------------------------

# 6. Cycles techniques complets

-------------------------------------------------------------------------------

### Cycle 1 : **Génération d'un commentaire IA (Reformuler)**

```
1. Frontend (Angular) - src/app/services/ai-service.ts
   ↓ Utilisateur clique "Reformuler" dans le formulaire
   ↓ Le composant appelle aiService.generateComment('reformuler', { texte: '...' })
   ↓ ai-service.ts fait POST /api/ai/generate-comment
   ↓ Header: Authorization: Bearer <token_microsoft> (ajouté par auth.interceptor.ts)

2. Backend (Node.js) - Express Server (server.js)
   ↓ Requête reçue sur /api/ai/generate-comment
   ↓ Express route /api/ai → routes/aiRoutes.js
   ↓ aiRoutes.js appelle generateComment (controllers/commentController.js)

3. Controller & Service (Node.js) - commentController.js → aiService.js
   ↓ commentController.generateComment() reçoit { type: 'reformuler', contexte: { texte: '...' } }
   ↓ Appelle aiService.generateAIComment('reformuler', contexte)
   ↓ aiService.generateAIComment() :
     • Charge les prompts depuis config/prompts.json
     • Sélectionne template.generateComment.reformuler
     • Appelle fillTemplate() pour remplacer les variables
     • Appelle callMistral(prompt) via axios

4. Appel API Mistral
   ↓ callMistral() POST ${MISTRAL_BASE_URL}/chat/completions
   ↓ Body: { model: MISTRAL_MODEL, messages: [...], temperature: 0.5 }
   ↓ Header: Authorization: Bearer ${MISTRAL_API_KEY}
   ↓ axios-retry active : 3 tentatives, retry-after 429, délai 2s
   ↓ Mistral retourne le texte reformulé

5. Traitement Réponse - aiService.js
   ↓ callMistral() retourne { comment: '...', json: null }
   ↓ Si la réponse contient "<<<JSON>>>" → parse et sépare commentaire + JSON
   ↓ Retour à commentController

6. Backend → Frontend
   ↓ commentController retourne res.json({ comment: '...', json: null })
   ↓ HTTP 200 + Contenu-Type: application/json

7. Frontend (Angular) - Composant
   ↓ ai-service.ts subscribe() reçoit { comment: '...', json: null }
   ↓ Affiche le résultat dans le formulaire
   ↓ Utilisateur peut copier/modifier le texte
```

---

### Cycle 2 : **Authentification Microsoft (Collaborateur) et Vérification**

```
1. Frontend (Angular) - MSAL Authentication
   ↓ Utilisateur arrive sur la page
   ↓ MSAL (@azure/msal-angular) vérifie s'il est connecté
   ↓ Si non : affiche popup login Microsoft
   ↓ L'utilisateur s'authentifie (ou SSO automatique)
   ↓ MSAL récupère access token pour scope: "api://67336009-376f-424b-882b-8662f86e5eed/access_as_user"
   ↓ Token stocké en mémoire MSAL (pas localStorage direct)

2. Interceptor HTTP - auth.interceptor.ts
   ↓ À chaque requête POST/GET du composant
   ↓ auth.interceptor.ts intercept() :
     • Récupère activeAccount via msal.instance.getActiveAccount()
     • Appelle msal.acquireTokenSilent({ scopes: [...], account: activeAccount })
     • Token acquis ou refresh automatiquement
     • Clône la requête avec Header Authorization: Bearer ${token}
   ↓ Requête envoyée avec token au backend

3. Vérification Collaborateur - Backend
   ↓ POST /api/db/verifCollaborateur
   ↓ Header: Authorization: Bearer ${token_microsoft}
   ↓ server.js → dbRoutes.js → VerifCollaborateur (controllers/authController.js)
   ↓ authMiddlewareCollaborateur (middlewares/auth.js) valide AVANT le controller

4. Middleware de Validation - authMiddlewareCollaborateur
   ↓ Lit header Authorization et extrait le token
   ↓ jwksClient.getSigningKey() → vérifie la signature
   ↓ jwt.verify() avec :
     • JWKS URI: https://login.microsoftonline.com/f7f506f7-c551-4a8a-8c5a-b7d339828e4b/discovery/v2.0/keys
     • audience: "api://67336009-376f-424b-882b-8662f86e5eed"
     • issuer: "https://sts.windows.net/f7f506f7-c551-4a8a-8c5a-b7d339828e4b/"
   ↓ Si erreur → HTTP 401 "Invalid token"
   ↓ Si OK → req.user = decoded_jwt_payload, next()

5. Controller Vérification - authController.js
   ↓ VerifCollaborateur() :
     • Email (hardcodé temporairement: "prondot@lacomptabilite.fr")
     • Appelle dbService.GetCollaborateur(email)
     • Requête SQL table Collaborateurs WHERE email = @email
   ↓ Si collaborateur existe : res.json({ collaborateur: {...} })
   ↓ Sinon : HTTP 404 "Collaborateur introuvable"

6. Frontend Réaction
   ↓ db-service.ts VerifCollaborateur() reçoit la réponse
   ↓ Composant sait que le collaborateur est vérifié
   ↓ Peut procéder aux étapes suivantes (accès au dashboard, etc.)
```

---

### Cycle 3 : **Extraction des données d'un dossier (getDossierInfos)**

```
1. Frontend (Angular) - Sélection Dossier
   ↓ Utilisateur saisit :
     • code_client (ex: "12345")
     • dateFinEx (ex: "2023-12-31")
     • dateDebutEx (ex: "2023-01-01")
   ↓ Clique "Ouvrir dossier"

2. Vérification Dossier - POST /api/db/verifDossier
   ↓ db-service.ts appelle VerifDossier(code_client, dateFinEx, dateDebutEx)
   ↓ POST /api/db/verifDossier
   ↓ Body: { code_client, dateFinEx, dateDebutEx }
   ↓ Header: Authorization: Bearer ${token_microsoft}

3. Backend Vérification - authController.js
   ↓ POST /api/db/verifDossier → VerifDossier()
   ↓ Pas de middleware spécial (verifDossier est public)
   ↓ VerifDossier() :
     • Extrait { code_client, dateFinEx, dateDebutEx } de req.body
     • Appelle dbService.GetDossier(code_client, dateFinEx)
     • Requête SQL :
       - SELECT code_client FROM FEC WHERE code_client = @code_client AND datefinex = @dateFinEx
       - SELECT * FROM clients WHERE code_client = @code_client
   ↓ Si dossier EXISTE :
     • Crée JWT local : generateToken({ code_client, dateFinEx, dateDebutEx })
     • Cookie httpOnly jwt_dossier (durée: 4 heures)
     • res.cookie("jwt_dossier", token, { httpOnly: true, sameSite: "lax", maxAge: 14400000 })
     • Retourne res.json({ client: {...} })
   ↓ Sinon HTTP 404

4. Frontend Stockage Cookie
   ↓ Browser reçoit Set-Cookie: jwt_dossier = ...
   ↓ Cookie stocké automatiquement (httpOnly = inaccessible depuis JS)
   ↓ Sera envoyé automatiquement dans les prochaines requêtes

5. Extraction Données - GET /api/db/getDossierInfos
   ↓ Composant appelle db-service.ts GetDossierInfos()
   ↓ GET /api/db/getDossierInfos
   ↓ Cookie jwt_dossier envoyé automatiquement avec la requête
   ↓ Header: Authorization: Bearer ${token_microsoft}

6. Middleware Protection - authMiddlewareDossier
   ↓ Route enregistrée : router.get('/getDossierInfos', authMiddlewareDossier, GetDossierInfos)
   ↓ authMiddlewareDossier (middlewares/auth.js) :
     • Lit req.cookies.jwt_dossier
     • Appelle verifyToken(token) (utils/jwt.js)
     • jwt.verify(token, process.env.JWT_SECRET) avec la clé locale
     • Si valide → req.user = { code_client, dateFinEx, dateDebutEx }
     • Si invalide → HTTP 401 "Token invalide"

7. Controller Principal - dbController.js GetDossierInfos()
   ↓ Requête arrivée sécurisée : req.user = { code_client, dateFinEx, dateDebutEx }
   ↓ Calcule anneeN = new Date(dateFinEx).getFullYear()
   ↓ Parallélise 4 appels SQL (Promise.all) :

   A) dbService.GetInfoClients(code_client)
      ↓ SELECT c.ape, c.soumis_is, c.mois_cloture, c.raison_sociale, ...
        FROM clients c JOIN collaborateurs ON chef_de_mission
      ↓ Retourne infos générales client

   B) dbService.GetSignataire(code_client)
      ↓ SELECT collabExp.nom, collabExp.prenom, collabRev.nom, collabRev.prenom
        FROM clients JOIN collaborateurs (expert + réviseur)
      ↓ Retourne noms du cabinet

   C) dbService.GetAggregats(code_client, dateFinEx)
      ↓ SELECT * FROM Aggregats_FEC
        WHERE code_client = @code_client
        AND datefinex IN (@dateFinEx, MAX(previous_year))
        ORDER BY datefinex DESC
      ↓ Retourne aggN (année N) et aggN1 (année N-1)

   D) dbService.GetAnaSectorielle("9602A")
      ↓ SELECT * FROM analyse_sectorielle
        WHERE code_ape = "9602A"
        AND millesime = MAX(millesime)
      ↓ Retourne benchmarks sectoriels

8. Traitement & Composition Réponse
   ↓ dbController assemble un JSON massif :
     • Infos générales : anneeN, anneeN1, I_classe2, MD_salaries, forme_societe, ...
     • Client : code_client, nomEntreprise, adresses, signataire, ...
     • Chiffres clés : CA, marge, EBE, résultats, variations %
     • Evolution charges : regroupé par compte (606%, 611%, 622%, 623%, etc.)
       + Calcul poids (% du total) et variation (%)
       + Flag EC_comment = true si poids > 30% OU (variation > 10% ET impact > 6%)
     • Charges personnel : CP_N, CP_N1, ratio CA, ratio marge, VA/MS
     • Impôt société : IS_tot, crédits, acomptes
     • Autofinancement : Capacité, dotations, cessions, remboursements, dividendes
     • Trésorerie : treso, flux de trésorerie, variations BFR
     • Ratios exploitation : jours crédit client, jours crédit fournisseur
     • Analyse sectorielle : tranches 1-5 par indicateur (CA, marge, etc.)

9. Backend → Frontend
   ↓ HTTP 200 avec res.json({
       anneeN1Existe: boolean,
       I_classe2: number,
       client: { code_client, nomEntreprise, ... },
       chiffreCles: { CC_caN, CC_caN1, CC_margeN, ... },
       evolutionCharges: [ { EC_lib, EC_valN, EC_valN1, EC_comment, ... }, ... ],
       chargesPersonnel: { CP_N, CP_N1, ... },
       impotSociete: { IS_tot, IS_credit, ... },
       autofinancement: { AF_resEx, AF_dota, ... },
       anaSectorielle: { valeurs: [...], commentaire: [...] },
       tresorerie: { tresoN, RF_apport, ... },
       ratiosExploitation: { credClientN, credFournN, ... }
     })

10. Frontend Réception & Affichage
    ↓ db-service.ts subscribe() reçoit le JSON massif
    ↓ Composant formulaire pré-remplit les champs :
      • Titre, adresses du client
      • Chiffres clés (CA, marge, EBE, résultat)
      • Charges mentionnées (via EC_comment = true)
      • Info signataires
    ↓ Utilisateur peut parcourir, modifier, générer commentaires supplémentaires
    ↓ Génère les documents Word via POST /api/word/generateWord
```
-------------------------------------------------------------------------------

# 7. Base SQL Server 
- Table `Aggregats_FEC`:
   - C'est un résumé de la table FEC pour chaque couple **code_client/datefinex**.
   - Elle contient la majorité des informations nécessaires pour remplir la lettre de fin de mission.
   - Elle est mise à jour automatiquement lors de l'import de données dans la table **FEC**.
- Table `attente_fec`:
   - Contient les couples **code_client/datefinex** en attente de traitement.
   - Lorsque des données sont importées dasn la table **FEC**, leurs identifiants sont  stocké ici avant d'être traité et inséré dans la table **Aggregats_FEC** par un scipt **powershell**.
- Table `analyse_sectorielle`:
   - Contient les informations des analyses sectorielles pour chaque code NAF.

-------------------------------------------------------------------------------

# 8. Problèmes connus

- **Token Microsoft expiré**
   - Symptômes : HTTP 401 "Invalid token" depuis le backend.
   - Contournement : se reconnecter via MSAL (Angular gère automatiquement).

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

-------------------------------------------------------------------------------

# 9. Guide utilisateur

1. Ouvrir l’application.  
2. Se connecter via Microsoft.  
3. Vérifier qu’un collaborateur existe.  
4. Séectionner un dossier.
5. Saisir un code client + dates.  
6. Charger le dossier.  
7. Préremplir le formulaire.  
8. Demander des reformulations IA.  
9. Générer les fichiers Word/PPTX.  
10. Exporter en PDF via Word.

-------------------------------------------------------------------------------

# 10. Notes techniques importantes

- **Tokens & Cookies** :
  - Token Microsoft (Bearer) : stocké en mémoire MSAL, dure ~1h, réutilisable pour n'importe quelle requête
  - Cookie JWT local (jwt_dossier) : httpOnly, durée 4h, session dossier spécifique

- **Parallélisation** :
  - GetDossierInfos utilise `Promise.all()` pour lancer 4 requêtes SQL en parallèle (plus rapide)

- **Retry Logic** :
  - aiService utilise `axios-retry` : si Mistral retourne 429 (rate limit), réessaie 3x avec délai exponentiel

- **Sécurité** :
  - Collaborateur routes : protection Microsoft JWT via JWKS
  - Dossier routes : protection cookie JWT local + vérification table SQL
  - Les deux tokens sont indépendants