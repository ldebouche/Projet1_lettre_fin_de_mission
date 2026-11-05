# Job LAB — détection opérations atypiques (J-14)

Cible : PROD / DEV. **Aucun cron** dans `server.js` (D5.3-J).

Écriture BDD = événement `TRANSACTION_ATYPIQUE` + alertes COH / LCB / STAT  
quand le job tourne **sans** `--dry-run` (planif Windows ou CLI ops).  
Pas d’UI cabinet pour lancer le scan (Phase 8.2).

## Déclencheurs

| Déclencheur | Qui | Effet |
|---|---|---|
| `npm run lab:detection-j14` | Compte audit `JOB_LAB` | Scan dossiers `date_prochaine_revue` = J+14, détection FEC N, persist si pas dry-run |
| `POST /api/lab/jobs/detection-j14` | `isFull` (admin / informatique / lab) | Même scan ; body optionnel `{ dryRun, codeClient(s), datefinex }` |
| Planificateur Windows | SYSTEM | CLI sans dry-run, 1×/jour |

Override test (ignore le filtre J-14) :

```bat
npm run lab:detection-j14 -- --dry-run --code-client 00542
npm run lab:detection-j14 -- --dry-run --code-client 02186 --datefinex 2025-12-31
```

## Modules

| Famille | Fichier | Rôle |
|---|---|---|
| Orchestration | `lab-detection-service.js` | Charge FEC, lance modules, persist événement |
| FEC | `lab-detection-fec.js` | Tables annuelles `FEC_YYYY`, colonnes dont lettrage |
| Journaux | `lab-detection-journals.js` | ACH / VEN / BQ / CAI / OD / AN |
| COH | `lab-detection-coh.js` | Cohérence FEC (Caseware-like) |
| LCB | `lab-detection-lcb.js` | LCB-03/04/05/07/12 |
| STAT | `lab-detection-stat.js` | Benford STAT-01 (1 synthèse / famille) |
| Params | `lab-detection-params.js` | Seuil k€, k risque |
| CLI | `jobs/labDetectionJ14Job.js` | Entrée planif / npm |

Idempotence : un événement **ouvert** `TRANSACTION_ATYPIQUE` par dossier → skip.

Audit : `CREATION_EVENEMENT`, `detail.source` = `job_detection_j14`.

## Planificateur Windows

Script d’enregistrement (Administrateur) :

```bat
backend\ops\register-lab-detection-j14.bat
```

Équivalent manuel (adapter le chemin PROD) :

```bat
schtasks /Create /F /TN "Avenia LAB detection J-14" /SC DAILY /ST 02:45 /RU "SYSTEM" /RL HIGHEST /TR "\"C:\Program Files\nodejs\node.exe\" C:\code_outils-avenia\PROD\code\backend\src\jobs\labDetectionJ14Job.js"
```

Créneau proposé : **02:45** (après pièces 02:15 et revue 02:30).

## Fichiers HTTP

- Route : `POST /api/lab/jobs/detection-j14` (`authMiddlewareCollaborateur` + `canAccessTracfin`)
- Controller : `postJobsDetectionJ14Lab`

## Checklist

- [ ] Tâche Windows créée (`register-lab-detection-j14.bat`)
- [ ] Dry-run CLI OK sur un petit dossier
- [ ] Relance même jour = pas de doublon d’événement ouvert
- [ ] Compte non-`isFull` → HTTP 403
- [ ] Aucun bouton job dans Angular
- [ ] UI accordéon alertes (lot suivant) — pas bloquant pour la planif
