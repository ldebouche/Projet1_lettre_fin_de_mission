' === launchPPT.vbs ===
Option Explicit
Dim pptApp, modelePath, outputPath
Dim fso, tempFile, f

' === Indique le chemin complet vers ton modèle PPTM ===
modelePath = "C:\Users\DEBOUCHELucas\Projets_stage\Projet1_lettre_fin_de_mission\backend\src\templates\modele_complet.pptm"

' === Obtient l'argument passé au script ===
If WScript.Arguments.Count > 0 Then
    outputPath = CStr(WScript.Arguments(0))
Else
    outputPath = ""
End If

' === Crée un fichier temporaire pour transmettre outputPath ===
Set fso = CreateObject("Scripting.FileSystemObject")
tempFile = fso.GetSpecialFolder(2) & "\lfm_output_path.txt"

Set f = fso.CreateTextFile(tempFile, True)
f.Write outputPath
f.Close

' === Lance PowerPoint ===
Set pptApp = CreateObject("PowerPoint.Application")
pptApp.Visible = True

' === Ouvre le modèle ===
pptApp.Presentations.Open modelePath

' === Exécute la macro de remplissage ===
pptApp.Run "modele_complet.pptm!LancerRemplissage"

WScript.Echo "Présentation générée avec succès !"

Set pptApp = Nothing

