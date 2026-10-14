!macro customInit
  StrCpy $INSTDIR "$PROGRAMFILES64\Taildesk"
!macroend

!macro customInstall
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\engine\manage-service.ps1" -Action Register'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Taildesk service registration failed. $1"
    Abort
  ${EndIf}
!macroend

!macro customUnInstall
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\engine\manage-service.ps1" -Action Unregister'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Taildesk could not safely stop/remove its own service. $1"
    Abort
  ${EndIf}
!macroend
