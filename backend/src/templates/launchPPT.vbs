' === launchPPT.vbs ===
Option Explicit
Dim pptApp, pres, modelePath

' === Indique le chemin complet vers ton modèle PPTM ===
modelePath = "C:\Users\DEBOUCHELucas\Projets_stage\Projet1_lettre_fin_de_mission\backend\src\templates\modele_complet.pptm"

' === Lance PowerPoint ===
Set pptApp = CreateObject("PowerPoint.Application")
pptApp.Visible = True

' === Ouvre le modèle ===
Set pres = pptApp.Presentations.Open(modelePath)

' === Exécute la macro de remplissage ===
pptApp.Run "modele_complet.pptm!LancerRemplissage"

' === Attends un peu pour laisser la macro finir (3 secondes par précaution) ===
WScript.Sleep 3000

' === Ferme la présentation et PowerPoint ===
'pres.Close
'pptApp.Quit

Set pres = Nothing
Set pptApp = Nothing

WScript.Echo "✅ Présentation générée avec succès !"
