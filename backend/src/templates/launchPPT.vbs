' === launchPPT.vbs ===
Option Explicit
Dim pptApp, modelePath, outputPath
Dim fso, tempFile, f

' === Récupère le chemin du fichier de sortie ===
If WScript.Arguments.Count > 0 Then
    outputPath = CStr(WScript.Arguments(0))
Else
    WScript.Quit
End If

' === Chemin du modèle PPTM (arg2 prioritaire, sinon dossier du script) ===
If WScript.Arguments.Count > 1 Then
    modelePath = CStr(WScript.Arguments(1))
Else
    Set fso = CreateObject("Scripting.FileSystemObject")
    modelePath = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "modele_complet.pptm")
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
