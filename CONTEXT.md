# CONTEXT - Projet Avenia

## 1) Stack technique

### Frontend
- **Framework**: Angular `20.2.x` (standalone components, pas de NgModule applicatif).
  - `@angular/core`, `@angular/router`, `@angular/common` en `^20.2.0`
  - Angular CLI/build en `^20.2.1`
- **Langage**: TypeScript `~5.9.2`
- **HTTP**: `HttpClient` Angular + intercepteur custom + MSAL
- **Auth côté frontend**: `@azure/msal-angular` `^3.1.0` et `@azure/msal-browser` `^3.30.0`
- **Autres libs importantes**: `rxjs`, `quill`, `marked`

Extrait (`frontend/package.json`):
```json
{
  "dependencies": {
    "@angular/core": "^20.2.0",
    "@angular/router": "^20.2.0",
    "@azure/msal-angular": "^3.1.0",
    "@azure/msal-browser": "^3.30.0"
  },
  "devDependencies": {
    "@angular/cli": "^20.2.1",
    "typescript": "~5.9.2"
  }
}
```

### Backend
- **Framework HTTP**: Express `^5.1.0` (ESM, fichiers `.js` modernes avec `import/export`)
- **Runtime**: Node.js
- **Auth/JWT**: `jsonwebtoken`, `jwks-rsa`, `cookie-parser`
- **Upload**: `multer`
- **Appels externes**: `axios`, `axios-retry`
- **Traitement documents**: `pdf-parse-fork`, `docxtemplater`, `jszip`, `puppeteer`

Extrait (`backend/package.json`):
```json
{
  "type": "module",
  "dependencies": {
    "express": "^5.1.0",
    "jsonwebtoken": "^9.0.2",
    "jwks-rsa": "^3.2.0",
    "mssql": "^12.0.0",
    "better-sqlite3": "^12.5.0"
  }
}
```

### Base(s) de données utilisée(s)
- **Principale métier**: **Microsoft SQL Server** via package `mssql` et `ConnectionPool`.
- **Secondaire (RAG/chatbot)**: **SQLite local** via `better-sqlite3`, fichier `vector_store.db` (table `embeddings` + colonne `roles`).

Extrait pool SQL Server (`backend/src/config/db.js`):
```js
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_HOST,
  database: process.env.DB_NAME,
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

export const poolPromise = new mssql.ConnectionPool(dbConfig).connect();
```

Extrait SQLite vector store (`backend/src/config/vectorStore.js`):
```js
export const db = new Database(dbPath);
db.prepare(`
  CREATE TABLE IF NOT EXISTS embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT,
    file_name TEXT,
    content TEXT,
    vector TEXT
  )
`).run();
```

## 2) Structure des dossiers

### Racine
- `frontend/`: application Angular
- `backend/`: API Express
- `data/`: données applicatives (ex: stockage vectoriel/documents via `PATHS`)

### Frontend (`frontend/src/app`)
- `pages/`: pages fonctionnelles (dashboard, login, settings, etc.)
- `shared/`: composants UI réutilisables
- `services/`: services Angular (HTTP, état local, utilitaires métier)
- `interceptor/`: intercepteurs HTTP (auth token)
- `directives/`: directives Angular custom
- `config/`: configuration frontend spécifique
- `app.routes.ts`, `app.config.ts`, `app.ts`: bootstrap, routing, providers

**Où sont les composants Angular ?**
- Principalement dans `frontend/src/app/pages/**` et `frontend/src/app/shared/**`
- Chaque composant est généralement un triplet: `xxx.ts`, `xxx.html`, `xxx.scss`

### Backend (`backend/src`)
- `routes/`: définition des endpoints Express par domaine (`dbRoutes`, `pdfRoutes`, `aiRoutes`, etc.)
- `controllers/`: orchestration request/response, validation entrée, gestion codes HTTP
- `services/`: logique métier et accès aux données externes/BDD
- `middlewares/`: middlewares d’authentification (`auth.js`)
- `config/`: configs d’infra (`db.js`, `paths.js`, `vectorStore.js`)
- `utils/`: utilitaires (JWT local, mapping, builders)
- `server.js`: composition de l’app Express et montage des routes

**Où sont les routes/controllers backend ?**
- Routes: `backend/src/routes`
- Controllers: `backend/src/controllers`

**Où sont les modèles/services ?**
- **Services**: `backend/src/services` et `frontend/src/app/services`
- **Modèles backend ORM**: pas de dossier `models` détecté (pas d’ORM classique). Le modèle de données est porté par SQL + objets JS retournés par services/controllers.

## 3) Conventions de code

### Nommage des fichiers
- **Frontend Angular**:
  - Majoritairement **kebab-case**: `dashboard.ts`, `chatbot-settings-service.ts`
  - Certaines pages historiques en **snake_case**: `lettre_fin_mission`
- **Backend**:
  - Mélange **camelCase + suffixe de rôle**: `authController.js`, `dbRoutes.js`, `chatbotSettingsService.js`
  - Convention par couche:
    - route: `*Route(s).js`
    - controller: `*Controller.js`
    - service: `*Service.js`

### Nommage des composants Angular
- Sélecteur standard préfixé `app-...`:
```ts
@Component({
  selector: 'app-accueil-intranet',
  templateUrl: './accueil-intranet.html',
  styleUrl: './accueil-intranet.scss'
})
export class AccueilIntranet implements OnInit {}
```

- Les classes de composants suivent le style `PascalCase` avec suffixe `Component` dans la plupart des cas (`DashboardComponent`, `ModalComponent`), avec quelques exceptions legacy (`AccueilIntranet`).

### Structure type d’un composant existant
Pattern observé:
1. Imports Angular + services + composants partagés
2. Décorateur `@Component` (`standalone: true` souvent activé)
3. Propriétés d’état
4. Méthodes lifecycle (`ngOnInit`)
5. Méthodes UI/métier locales

Extrait (`frontend/src/app/pages/dashboard/dashboard.ts`):
```ts
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, ListeHistoriqueComponent, ModalComponent],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class DashboardComponent implements OnInit {
  constructor(private router: Router, private db: DbService) {}
  ngOnInit(): void { this.loadData(); }
}
```

### Structure type d’une route backend existante
Pattern observé:
1. `express.Router()`
2. Import controllers (+ middlewares éventuels)
3. Déclaration endpoints REST
4. `export default router`

Extrait (`backend/src/routes/dbRoutes.js`):
```js
const router = express.Router();

router.post('/verifCollaborateur', authMiddlewareCollaborateur, VerifCollaborateur);
router.get('/getListeDossiers', authMiddlewareCollaborateur, GetListeDossiers);
router.post('/verifDossier', authMiddlewareCollaborateur, VerifDossier);

export default router;
```

### Gestion des appels HTTP (service Angular existant)
- Les services Angular appellent majoritairement des URLs **relatives** `/api/...`
- Paramètres en query via `{ params: { ... } }`
- Payload JSON en `post(...)`

Extrait (`frontend/src/app/services/db-service.ts`):
```ts
VerifCollaborateur() {
  return this.http.post<{ collaborateur: any }>(`/api/db/verifCollaborateur`, {});
}

GetListeDossiers(id_sellsy: any, statut: any) {
  return this.http.get(`/api/db/getListeDossiers`, { params: { id_sellsy, statut } });
}
```

## 4) Architecture

### Comment Angular appelle le backend
- **URL de base frontend -> backend**: via proxy Angular en dev (`proxy.conf.js`) sur le préfixe `/api`.
- Le frontend n’encode pas de domaine dans les services; il utilise `/api/...`.
- `app.config.ts` active `provideHttpClient(withInterceptorsFromDi())`.
- `AuthInterceptor` injecte `Authorization: Bearer <token MSAL>` sur les requêtes.

Extrait proxy (`frontend/proxy.conf.js`):
```js
module.exports = {
  '/api': {
    target: process.env.API_PROXY_TARGET || 'http://localhost:4000',
    changeOrigin: true
  }
};
```

Extrait intercepteur (`frontend/src/app/interceptor/auth.interceptor.ts`):
```ts
const clone = req.clone({
  setHeaders: { Authorization: `Bearer ${token}` }
});
return next.handle(clone);
```

### Comment le backend se connecte à la BDD
- **SQL Server**: `mssql.ConnectionPool` singleton (`poolPromise`) dans `config/db.js`.
- **Requêtes**: SQL majoritairement **brutes** dans `services/dbService.js` avec paramètres nommés (`@param`).
- Pas d’ORM type Prisma/Sequelize/TypeORM.
- **SQLite** en complément pour embeddings RAG (`config/vectorStore.js`).

Extrait query paramétrée (`backend/src/services/dbService.js`):
```js
const request = pool.request();
for (const [key, value] of Object.entries(params)) {
  request.input(key, value instanceof Date ? sql.Date : sql.NVarChar, value);
}
const result = await request.query(query);
```

### Gestion de l’authentification et des rôles
- **Collaborateur**:
  - Backend vérifie un JWT Azure AD via `jwks-rsa` (middleware `authMiddlewareCollaborateur`).
  - Le token est attendu dans `Authorization: Bearer ...`.
- **Dossier**:
  - À la vérification dossier, backend génère un JWT interne (`generateToken`) stocké en cookie `jwt_dossier`.
  - Les endpoints dossier s’appuient sur `authMiddlewareDossier` qui lit ce cookie.
- **Rôles**:
  - Propagés via `req.user.roles` (MS token / mode demo) et utilisés notamment côté chatbot RAG.

Extrait middleware (`backend/src/middlewares/auth.js`):
```js
if (!auth) return res.status(401).json({ error: "Missing Authorization header" });
jwt.verify(token, getKey, { audience: "api://.../access_as_user" }, (err, decoded) => {
  if (err) return res.status(401).json({ error: "Invalid token" });
  req.user = decoded;
  next();
});
```

### Gestion des erreurs
- Style dominant:
  - `try/catch` dans controllers
  - log `console.error(...)`
  - retour HTTP structuré (`400`, `401`, `404`, `500`)
  - JSON d’erreur avec clé `error` ou `message`
- Il n’y a pas (dans les fichiers parcourus) de middleware global unique de gestion d’erreur Express.

Extrait (`backend/src/controllers/pdfController.js`):
```js
if (!code_client || !datefinex) {
  return res.status(400).json({ error: "code_client et datefinex requis" });
}
...
} catch (err) {
  console.error("Erreur extraction PDF:", err);
  res.status(500).json({ error: "Impossible d'extraire les commentaires" });
}
```

## 5) Patterns détectés

### Pattern de création d’un nouveau module Angular
Pattern concret à suivre dans ce repo:
1. Créer un dossier dédié dans `pages/` ou `shared/`
2. Ajouter `nom.ts`, `nom.html`, `nom.scss`
3. Déclarer composant standalone (`@Component`, `imports`, `templateUrl`, `styleUrl(s)`)
4. Ajouter la route dans `app.routes.ts` si c’est une page
5. Ajouter un service dans `services/` si des appels backend sont nécessaires

Exemple route ajoutée (`frontend/src/app/app.routes.ts`):
```ts
{ path: 'chatbot-settings', component: ChatbotSettingsComponent, canActivate: [MsalGuard] }
```

### Pattern de création d’une nouvelle route backend
Pattern concret à suivre:
1. Ajouter endpoint dans un fichier de `backend/src/routes/*Routes.js`
2. Implémenter handler dans `backend/src/controllers/*Controller.js`
3. Déléguer logique lourde à `backend/src/services/*Service.js`
4. Monter le routeur dans `server.js` sous `/api/<module>`

Exemple montage global (`backend/src/server.js`):
```js
app.use('/api/db', dbRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/ai', aiRoutes);
```

### Style des réponses API (format JSON retourné)
- **Pas de format unique global** de type `{ success, data, error }`.
- Styles observés:
  - Objets métier: `{ collaborateur }`, `{ dossiers, dossiersEquipe }`, `{ client }`
  - Objets mixtes: `{ compte, comments: withAI }`
  - Messages action: `{ message: "..." }`
  - Erreurs: `{ error: "..." }` ou `{ message: "..." }`
  - Parfois `null` explicite en 200 (`res.status(200).json(null)`), selon la sémantique métier.

Exemples:
```js
res.json({ collaborateur });
res.json({ dossiers, dossiersEquipe });
res.status(500).json({ error: 'Erreur SQL' });
res.status(200).json(null);
```

---

## Remarques de cohérence technique
- Le backend déclare `build` TypeScript mais le code source principal est en `.js` ESM.
- Le projet contient des dépendances DB supplémentaires (`mysql2`, `tedious`) mais les flux métier observés utilisent surtout `mssql` + `better-sqlite3`.
- Les conventions de nommage sont majoritairement cohérentes mais mélangent kebab/snake/camel selon l’historique des modules.

---

## 6) MODULE LAB/KYC — Règles spécifiques

### Nommage des fichiers LAB
- Frontend : préfixe `lab-` → `lab-dashboard.ts`, `lab-evenements.ts`
- Backend routes : `labRoutes.js`
- Backend controller : `labController.js`
- Backend service : `labService.js`
- Montage serveur : `app.use('/api/lab', labRoutes)`

### Structure des dossiers LAB
```
frontend/src/app/pages/lab/
  ├── lab-dashboard/
  │   ├── lab-dashboard.ts
  │   ├── lab-dashboard.html
  │   └── lab-dashboard.scss
  ├── lab-clients/
  ├── lab-dossier/
  ├── lab-evenements/
  ├── lab-diligences/
  ├── lab-revues/
  ├── lab-tracfin/
  └── lab-parametrage/

frontend/src/app/services/
  └── lab-service.ts        ← service Angular unique pour le module LAB

backend/src/routes/
  └── labRoutes.js

backend/src/controllers/
  └── labController.js

backend/src/services/
  └── labService.js
```

### Règles BDD pour le module LAB
- Toutes les tables LAB commencent par `lab_`
- FK client : `code_client NCHAR(10)` → référence `clients.code_client`
- FK collaborateur : `id_sellsy NCHAR(20)` → référence `collaborateurs.id_sellsy`
- PK : `INT IDENTITY(1,1)`
- Schéma complet : voir `docs/schema-bdd-lab.sql`

### Auth pour les routes LAB
- Toutes les routes LAB utilisent `authMiddlewareCollaborateur` (même pattern que dbRoutes)
- Les rôles LAB sont gérés via `req.user.roles` existant

### Format des réponses API LAB
Suivre un format cohérent sur tout le module :
```js
// Succès liste
res.json({ data: [...], total: n })

// Succès objet unique
res.json({ data: { ... } })

// Succès action
res.json({ message: "Opération réussie" })

// Erreur
res.status(400).json({ error: "Message explicite" })
```

### Specs fonctionnelles
- Annexe 1 (fonctionnel) : voir `docs/specs-lab.md`
- Annexe 2 (écrans) : voir `docs/specs-lab.md`
- Schéma BDD : voir `docs/schema-bdd-lab.sql`
```