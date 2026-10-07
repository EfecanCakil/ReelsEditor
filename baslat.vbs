' Reels Editor'ý konsol penceresi göstermeden kaynak koddan baþlatýr (her açýlýþta son kod çalýþýr)
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
rc = sh.Run("cmd /c """"" & dir & "\baslat.bat"" /sessiz""", 0, True)
If rc <> 0 Then MsgBox "Reels Editor baþlatýlamadý. Hatayý görmek için " & dir & "\baslat.bat dosyasýný çift týklayýn.", 16, "Reels Editor"