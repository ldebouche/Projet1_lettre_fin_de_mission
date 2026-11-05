# Jobs LAB 5.3 — clôture + automatisations

Cible : DEV. Aucun cron dans `server.js` (décision D5.3-J).

**Phase 8.2** — surface interne vs cabinet : le scan n’est **pas** un bouton
d’écran. Production = Planificateur Windows. Recette / rattrapage = API
`isFull`. Runbook : `docs/ops/lab-surface-interne-vs-cabinet.md`.

## 5.3b — Pièces périmées (`PIECE_PERIMEE`)

Deux déclencheurs complémentaires :

| Déclencheur | Qui | Effet |
|---|---|---|
| `POST` / `PUT /api/lab/pieces` | Collaborateur du dossier (D14) | Si statut `Perimee` **ou** `date_echeance` &lt; aujourd’hui (hors `Non_requise`) → assure un événement `PIECE_PERIMEE` ouvert, criticité `Elevee`. |
| `PUT /api/lab/kyc` | Collaborateur du dossier (D14) | Sur **UPDATE** seulement, si au moins un champ significatif change → `CHANGEMENT_KYC`. Skip INSERT et si `options.creer_evenement_changement_kyc === false` (wizard acceptation). |
| `POST /api/lab/jobs/pieces-perimees` | `isFull` (admin / informatique / lab) | Scan cabinet : marque `Perimee`, crée les événements manquants. Idempotent. |
| `npm run lab:pieces-perimees` | Compte `JOB_LAB` | Même fonction, sans HTTP. |

Champs KYC significatifs (D5.3-H) : `est_pep`, `lien_pep`, `operations_internationales`, `pays_risque`, `secteur_activite`, `complexite_structure`.

Idempotence (D5.3-I) : un événement **ouvert** (`Ouvert` / `En_cours` / `A_VALIDER`) du même type par dossier. Le POST manuel `PIECE_PERIMEE` / `CHANGEMENT_KYC` reste autorisé.

Audit :

- `CREATION_EVENEMENT` avec `detail.source` = `auto_piece` | `auto_kyc` | `job_pieces_perimees`
- `MODIF_PIECE` quand le job passe le statut à `Perimee`

Réponse job :

```json
{
  "data": {
    "scanned": 12,
    "marked_perimee": 3,
    "events_created": 2,
    "events_skipped": 1,
    "ids": [101, 102]
  }
}
```

### Planificateur Windows (1×/jour)

Répertoire de travail = dossier `backend` (pour résoudre `node_modules` si besoin). Les variables `.env` sont chargées par `config/db.js`.

Exemple (à adapter aux chemins réels) :

```bat
schtasks /Create /TN "Avenia LAB pieces perimees" /SC DAILY /ST 02:15 /RU "SYSTEM" /TR "\"C:\Program Files\nodejs\node.exe\" C:\Delsia\Avenia\code_outils-avenia\DEV\code\backend\src\jobs\labPiecesPerimeesJob.js"
```

Ou via l’interface : Bibliothèque du Planificateur de tâches → Créer une tâche → Déclencheur quotidien → Action « Démarrer un programme » = `node.exe` avec argument le chemin du job.

## 5.3c — Revue annuelle (`REVUE_ANNUELLE`)

Livré. Événement seul (D5.3-K) : **pas** de session `lab_revues` En_cours, **pas** de notification push. L’alerte visuelle (KPI dashboard / filtre portefeuille `revue=late` / Plan & suivi) suffit.

| Déclencheur | Qui | Effet |
|---|---|---|
| `POST /api/lab/jobs/revue-annuelle` | `isFull` (admin / informatique / lab) | Scan cabinet, crée les `REVUE_ANNUELLE` manquants. Idempotent. |
| `npm run lab:revue-annuelle` | Compte `JOB_LAB` | Même fonction, sans HTTP. |

Critères d’éligibilité (tous requis) :

1. `lab_dossier.date_prochaine_revue` **dépassée** (`<` date du jour serveur, même règle que le KPI « revues en retard »)
2. Dossier **non clôturé** (`statut_dossier` ∉ Cloture / Clôturé / Cloturee)
3. Aucune revue `En_cours` sur le dossier
4. Aucun événement `REVUE_ANNUELLE` déjà ouvert (`Ouvert` / `En_cours` / `A_VALIDER`)

Effet si éligible : INSERT `lab_evenements` type `REVUE_ANNUELLE`, statut `Ouvert`, libellé « Revue périodique », criticité `Moyenne`. Pas de diligences auto (D5.3-L report). Pas de `lab_revues`.

Le collaborateur **lance la revue** depuis le Plan & suivi (`POST /api/lab/revues`) : la route **réutilise** l’événement ouvert au lieu d’en créer un second. La règle V5 reste inchangée (autres événements ouverts bloquent toujours le lancement).

Idempotence (D5.3-I) : un événement **ouvert** du même type par dossier. Relancer le job le même jour (ou plusieurs fois) ne crée pas de doublon.

Audit : `CREATION_EVENEMENT` avec `detail.source` = `job_revue_annuelle` et `date_prochaine_revue`. Compte CLI = `JOB_LAB`. Compte HTTP = `id_sellsy` de l’appelant isFull.

Réponse job :

```json
{
  "data": {
    "scanned": 8,
    "created": 3,
    "skipped": 5,
    "skipped_revue_en_cours": 1,
    "skipped_deja_ouvert": 4,
    "ids": [201, 202, 203]
  }
}
```

- `scanned` : dossiers à échéance dépassée, non clôturés
- `created` : événements réellement insérés
- `skipped` : déjà un `REVUE_ANNUELLE` ouvert, revue `En_cours`, ou dossier skippé
- `ids` : ids des événements **créés** (pas ceux réutilisés)

### Planificateur Windows (1×/jour)

Répertoire de travail = dossier `backend`. Les variables `.env` sont chargées par `config/db.js`. **Aucun cron dans `server.js`** (D5.3-J).

Exemple (à adapter aux chemins réels) :

```bat
schtasks /Create /TN "Avenia LAB revue annuelle" /SC DAILY /ST 02:30 /RU "SYSTEM" /TR "\"C:\Program Files\nodejs\node.exe\" C:\Delsia\Avenia\code_outils-avenia\DEV\code\backend\src\jobs\labRevueAnnuelleJob.js"
```

Ou via l’interface : Bibliothèque du Planificateur de tâches → Créer une tâche → Déclencheur quotidien → Action « Démarrer un programme » = `node.exe` avec argument le chemin du job.

Relance manuelle (depuis `backend/`) :

```bat
npm run lab:revue-annuelle
```

Hors périmètre : notification push, diligences auto, création de session revue, cron in-process.

## 5.3d — Détection opérations atypiques J-14 (`TRANSACTION_ATYPIQUE`)

Runbook détaillé : `backend/ops/lab-detection-j14.md`.

| Déclencheur | Qui | Effet |
|---|---|---|
| `POST /api/lab/jobs/detection-j14` | `isFull` | Scan J-14 (ou `codeClient` test) ; body `{ dryRun?, codeClients?, datefinex? }` |
| `npm run lab:detection-j14` | `JOB_LAB` | Même fonction CLI |
| Planificateur Windows | SYSTEM | `register-lab-detection-j14.bat` → quotidien 02:45 |

Idempotence : un `TRANSACTION_ATYPIQUE` **ouvert** par dossier. Modules COH / LCB / STAT sur FEC N.

```bat
schtasks /Create /F /TN "Avenia LAB detection J-14" /SC DAILY /ST 02:45 /RU "SYSTEM" /RL HIGHEST /TR "\"C:\Program Files\nodejs\node.exe\" C:\code_outils-avenia\PROD\code\backend\src\jobs\labDetectionJ14Job.js"
```

Ou : `backend\ops\register-lab-detection-j14.bat` (Administrateur).
