@echo off
REM Enregistre la tache Windows quotidienne : detection operations atypiques J-14.
REM A lancer en Administrateur depuis ce dossier (ou avec chemin complet).
REM Pas de --dry-run : ecriture BDD (evenement + alertes) quand des dossiers sont a J-14.

setlocal
set "TASK_NAME=Avenia LAB detection J-14"
set "NODE_EXE=C:\Program Files\nodejs\node.exe"
set "JOB_JS=%~dp0..\src\jobs\labDetectionJ14Job.js"
set "WORK_DIR=%~dp0.."

if not exist "%NODE_EXE%" (
  echo ERREUR: node.exe introuvable: %NODE_EXE%
  exit /b 1
)
if not exist "%JOB_JS%" (
  echo ERREUR: job introuvable: %JOB_JS%
  exit /b 1
)

REM Quotidien 02:45 — apres pieces (~02:15) et revue (~02:30)
schtasks /Create /F /TN "%TASK_NAME%" /SC DAILY /ST 02:45 /RU "SYSTEM" /RL HIGHEST ^
  /TR "\"%NODE_EXE%\" \"%JOB_JS%\""

if errorlevel 1 (
  echo Echec schtasks. Relancer ce .bat en Administrateur.
  exit /b 1
)

echo OK: tache "%TASK_NAME%" creee / mise a jour.
echo Working directory recommande pour logs manuels: %WORK_DIR%
echo Test dry-run:  cd /d "%WORK_DIR%" ^&^& npm run lab:detection-j14 -- --dry-run
echo Run reel:      cd /d "%WORK_DIR%" ^&^& npm run lab:detection-j14
endlocal
