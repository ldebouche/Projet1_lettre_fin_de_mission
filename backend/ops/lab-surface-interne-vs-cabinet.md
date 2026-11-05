# Surface interne vs cabinet — Phase 8.2

Cible : `DEV/code`. Aucun cron dans `server.js`. Aucun bouton cabinet pour lancer un job.

Détail technique des scans (idempotence, JSON de réponse, SQL) :
`docs/ops/lab-jobs-5.3.md`.

---

## Règle

| Qui | Voit | Déclenche les jobs |
|---|---|---|
| Collaborateur / EC / CM | Alertes visuelles (KPI, portefeuille, plan & suivi, événements) | Non |
| Équipe LAB (`isFull` : admin / informatique / lab) | Même chose + API ops | Oui, **HTTP uniquement** (recette / rattrapage) |
| Planificateur Windows | — | Oui, **voie prod** (CLI 1×/jour) |

Le cabinet **consulte** les pièces périmées et les revues à échéance.
Il **ne lance pas** le scan. Relancer un job n’est pas une action métier.

`server.js`, `auth.js` et `db.js` ne sont pas concernés.

---

## Jobs

### 1. Pièces périmées — `PIECE_PERIMEE`

- **CLI prod** : `npm run lab:pieces-perimees` (depuis `backend/`, compte audit `JOB_LAB`)
- **HTTP ops** : `POST /api/lab/jobs/pieces-perimees` — `authMiddlewareCollaborateur` + **`isFull`** (sinon 403)
- **Effet** : statut `Perimee` + événement ouvert `PIECE_PERIMEE` (criticité `Elevee`), dossiers non clôturés, hors `Non_requise`
- **Aussi** (hors job) : un `POST`/`PUT /pieces` du dossier peut créer le même événement tout de suite
- **Idempotent** : un événement ouvert du type par dossier

### 2. Revue annuelle — `REVUE_ANNUELLE`

- **CLI prod** : `npm run lab:revue-annuelle` (compte `JOB_LAB`)
- **HTTP ops** : `POST /api/lab/jobs/revue-annuelle` — même garde `isFull`
- **Effet** : événement ouvert `REVUE_ANNUELLE` si `date_prochaine_revue` dépassée, dossier non clôturé, pas de revue `En_cours`, pas déjà un événement ouvert
- **Pas** de session `lab_revues`, **pas** de notification push
- Le collaborateur **lance la revue** depuis le plan & suivi (`POST /api/lab/revues`) : ce n’est **pas** le job. La route réutilise l’événement ouvert.

### 3. Détection atypiques J-14 — `TRANSACTION_ATYPIQUE`

- **CLI prod** : `npm run lab:detection-j14` (compte `JOB_LAB`)
- **HTTP ops** : `POST /api/lab/jobs/detection-j14` — même garde `isFull` / `canAccessTracfin`
- **Effet** : détection COH/LCB/STAT sur FEC N des dossiers à J-14 ; crée un événement ouvert + alertes (sauf `--dry-run`)
- **Idempotent** : un `TRANSACTION_ATYPIQUE` ouvert par dossier
- **Runbook** : `backend/ops/lab-detection-j14.md`

Fichiers :

| Rôle | Fichier |
|---|---|
| CLI pièces | `backend/src/jobs/labPiecesPerimeesJob.js` |
| CLI revue | `backend/src/jobs/labRevueAnnuelleJob.js` |
| CLI détection J-14 | `backend/src/jobs/labDetectionJ14Job.js` |
| Scan pièces | `backend/src/services/lab-pieces-service.js` → `scanPiecesPerimeesLab` |
| Scan revue | `backend/src/services/lab-revues-service.js` → `scanRevueAnnuelleLab` |
| Détection | `backend/src/services/lab-detection-*.js` |
| HTTP | `labRoutes.js` + `labController.js` (`postJobs*Lab`) |
| Planif détection | `backend/ops/register-lab-detection-j14.bat` |

---

## Planificateur Windows (production)

Décision D5.3-J : **pas** de `node-cron` dans le process Node (évite le double run avec nodemon).

Répertoire de travail = dossier `backend`. Les variables `.env` sont lues par `config/db.js`.

Exemple (adapter les chemins) :

```bat
schtasks /Create /TN "Avenia LAB pieces perimees" /SC DAILY /ST 02:15 /RU "SYSTEM" /TR "\"C:\Program Files\nodejs\node.exe\" C:\Delsia\Avenia\code_outils-avenia\DEV\code\backend\src\jobs\labPiecesPerimeesJob.js"

schtasks /Create /TN "Avenia LAB revue annuelle" /SC DAILY /ST 02:30 /RU "SYSTEM" /TR "\"C:\Program Files\nodejs\node.exe\" C:\Delsia\Avenia\code_outils-avenia\DEV\code\backend\src\jobs\labRevueAnnuelleJob.js"

schtasks /Create /F /TN "Avenia LAB detection J-14" /SC DAILY /ST 02:45 /RU "SYSTEM" /RL HIGHEST /TR "\"C:\Program Files\nodejs\node.exe\" C:\code_outils-avenia\PROD\code\backend\src\jobs\labDetectionJ14Job.js"
```

Ou enregistrement détection : `backend\ops\register-lab-detection-j14.bat` (Administrateur).

Relance manuelle ops (depuis `backend/`) :

```bat
npm run lab:pieces-perimees
npm run lab:revue-annuelle
npm run lab:detection-j14
npm run lab:detection-j14 -- --dry-run
```

Ou `POST` HTTP avec un compte `isFull` (Postman / recette), **jamais** depuis l’UI Angular.

---

## Ce que le cabinet voit (et ce qu’il ne voit pas)

**Visible**

- Dashboard : KPI / listes « revues en retard », événements critiques
- Portefeuille : filtre revue en retard / à venir ; statut pièces
- Plan & suivi : événement `PIECE_PERIMEE` ou `REVUE_ANNUELLE` ; bouton métier **Lancer une revue**
- Listes cabinet événements / diligences

**Absent d’Angular** (grep `jobs/` / `pieces-perimees` / `revue-annuelle` = 0 appel)

- Aucune méthode dans `lab-service.ts`
- Aucun bouton « Lancer le job », « Scanner les pièces », « Générer les revues du cabinet »

---

## Autres surfaces internes (même logique)

| Surface | Cabinet | Ops / interne | Décision 8.2 |
|---|---|---|---|
| `POST /api/lab/jobs/*` | Non | `isFull` + CLI | **Garder** l’API |
| `POST /api/lab/plan-vigilance/generer` | Pas de bouton (hook après ARPEC) | Méthode `genererPlanVigilanceLab()` dans `lab-service.ts` non câblée aux pages | **Garder** (pas de CTA) |
| `GET /api/lab/enrichissement` | Wizard (SIREN/SIRET) | — | Feature métier, pas un job |
| Redirects `/login-lab`, `/lab-dashboard-dossier` | Redirection portefeuille | — | **Garder** (signets) |
| `DEMO_AUTH` / `isDemo` | Pas un bouton | Filet recette ; **interdit en prod** | Ops : `DEMO_AUTH=false` |
| Filtre dashboard « Autre collaborateur… » | `isFull` seulement | Saisie d’un collaborateur | Conservé (copy 8.1, plus `id_sellsy` en placeholder) |

---

## Routes : inchangées

Les deux `POST /api/lab/jobs/*` restent montés dans `labRoutes.js` avec `authMiddlewareCollaborateur`.
Aucun retrait, aucun ajout, aucun changement de verbe ou de chemin dans cette vague.

---

## Checklist go-live

- [ ] Trois tâches Windows quotidiennes (pièces ~02:15, revue ~02:30, détection J-14 ~02:45)
- [ ] Premier run CLI OK (JSON `scanned` / `created` ou `marked_perimee` / `alerts_total`)
- [ ] Relance le même jour = pas de doublon d’événement ouvert
- [ ] Compte non-`isFull` → HTTP 403
- [ ] Aucun bouton job dans le parcours 00→03
- [ ] `DEMO_AUTH=false` en production
- [ ] `server.js` / `auth.js` / `db.js` non modifiés pour ces jobs
