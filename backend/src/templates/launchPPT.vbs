' === launchPPT.vbs ===
Option Explicit
Dim pptApp, modelePath, outputPath
Dim fso, tempFile, f

' === Chemin du modèle PPTM ===
modelePath = "C:\code_outils-avenia\PROD\code\backend\src\templates\modele_complet.pptm"

' === Récupère le chemin du fichier de sortie ===
If WScript.Arguments.Count > 0 Then
    outputPath = CStr(WScript.Arguments(0))
Else
    WScript.Quit
End If

' === Fichier temporaire contenant le chemin de sortie ===
Set fso = CreateObject("Scripting.FileSystemObject")
tempFile = fso.GetSpecialFolder(2) & "\lfm_output_path.txt"

Set f = fso.CreateTextFile(tempFile, True)
f.Write outputPath
f.Close

' === Lance PowerPoint ===
Set pptApp = CreateObject("PowerPoint.Application")
pptApp.Visible = True
pptApp.WindowState = 2
pptApp.DisplayAlerts = 0

' === Ouvre le modèle ===
pptApp.Presentations.Open modelePath

' === Exécute la macro principale ===
pptApp.Run "modele_complet.pptm!LancerRemplissage"

Set pptApp = Nothing
