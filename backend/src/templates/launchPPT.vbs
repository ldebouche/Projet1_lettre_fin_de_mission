' === launchPPT.vbs ===
Option Explicit
Dim pptApp, modelePath

' === Indique le chemin complet vers ton modèle PPTM ===
modelePath = "C:\Users\DEBOUCHELucas\Projets_stage\Projet1_lettre_fin_de_mission\backend\src\templates\modele_complet.pptm"

' === Lance PowerPoint ===
Set pptApp = CreateObject("PowerPoint.Application")
pptApp.Visible = True

' === Ouvre le modèle ===
pptApp.Presentations.Open modelePath

' === Exécute la macro de remplissage ===
pptApp.Run "modele_complet.pptm!LancerRemplissage"

WScript.Echo "Présentation générée avec succès !"

Set pptApp = Nothing

