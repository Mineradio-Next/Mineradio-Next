!ifndef MUI_BGCOLOR
  !define MUI_BGCOLOR "FFFFFF"
!endif
!ifndef MUI_TEXTCOLOR
  !define MUI_TEXTCOLOR "111217"
!endif
!ifndef MUI_DIRECTORYPAGE_BGCOLOR
  !define MUI_DIRECTORYPAGE_BGCOLOR "FFFFFF"
!endif
!ifndef MUI_DIRECTORYPAGE_TEXTCOLOR
  !define MUI_DIRECTORYPAGE_TEXTCOLOR "111217"
!endif
!ifndef MUI_INSTFILESPAGE_COLORS
  !define MUI_INSTFILESPAGE_COLORS "55DDB5 101719"
!endif
!ifndef MUI_FINISHPAGE_LINK_COLOR
  !define MUI_FINISHPAGE_LINK_COLOR "168B77"
!endif
!ifndef MUI_HEADERIMAGE
  !define MUI_HEADERIMAGE
!endif
!ifndef MUI_HEADERIMAGE_BITMAP_STRETCH
  !define MUI_HEADERIMAGE_BITMAP_STRETCH "FitControl"
!endif
!ifndef MUI_HEADERIMAGE_UNBITMAP_STRETCH
  !define MUI_HEADERIMAGE_UNBITMAP_STRETCH "FitControl"
!endif
!ifndef BUILD_UNINSTALLER
  !ifndef MUI_CUSTOMFUNCTION_GUIINIT
    !define MUI_CUSTOMFUNCTION_GUIINIT MineradioGuiInit
  !endif
!endif

!include LogicLib.nsh
!include FileFunc.nsh
!include StdUtils.nsh
!include nsDialogs.nsh
!include WinMessages.nsh

!ifndef MINERADIO_INSTALL_DIR_NAME
  !define MINERADIO_INSTALL_DIR_NAME "Mineradio-Next"
!endif
!ifndef MINERADIO_INSTALL_DIR_NAME_LOWER
  !define MINERADIO_INSTALL_DIR_NAME_LOWER "mineradio-next"
!endif
!ifndef MINERADIO_LEGACY_INSTALL_DIR_NAME
  !define MINERADIO_LEGACY_INSTALL_DIR_NAME "Mineradio"
!endif
!ifndef MINERADIO_LEGACY_INSTALL_DIR_NAME_LOWER
  !define MINERADIO_LEGACY_INSTALL_DIR_NAME_LOWER "mineradio"
!endif
!ifndef MINERADIO_INSTALL_MARKER
  !define MINERADIO_INSTALL_MARKER ".mineradio-install-root"
!endif
!ifndef MINERADIO_MARKER_APP_ID
  !define MINERADIO_MARKER_APP_ID "com.mineradio.next"
!endif
!ifndef MINERADIO_INSTALL_BRAND
  !define MINERADIO_INSTALL_BRAND "MINERADIO"
!endif
!ifndef MINERADIO_INSTALL_TITLE
  !define MINERADIO_INSTALL_TITLE "Mineradio Next 安装"
!endif
!ifndef MINERADIO_INSTALL_NOTICE
  !define MINERADIO_INSTALL_NOTICE ""
!endif

!ifndef BUILD_UNINSTALLER
  Var MineradioWelcomePage
  Var MineradioHeroFont
  Var MineradioTitleFont
  Var MineradioBodyFont
  Var MineradioSmallFont
  Var MineradioDirectoryPage
  Var MineradioDirectoryInput
  Var MineradioDesktopShortcutControl
  Var MineradioDesktopShortcutEnabled
  Var MineradioInstallOptionsControl
  Var MineradioInstallOptionsEnabled
  Var MineradioInstallDirInitialized
  Var MineradioWelcomeBitmapHandle
!endif

!macro customInit
  !ifndef BUILD_UNINSTALLER
    StrCpy $MineradioDesktopShortcutEnabled "1"
    StrCpy $MineradioInstallOptionsEnabled "0"
    StrCpy $MineradioInstallDirInitialized "0"
    Call MineradioUsePreferredInstallDir
    ${If} ${Silent}
      ${GetParameters} $R0
      ClearErrors
      ${GetOptions} $R0 "/MINERADIO-NO-DESKTOP" $R1
      ${IfNot} ${Errors}
        StrCpy $MineradioDesktopShortcutEnabled "0"
      ${EndIf}
      Call MineradioValidateInstallDir
    ${Else}
      Call MineradioLaunchInstallerShell
    ${EndIf}
  !endif
!macroend

!macro customInstall
  !ifndef BUILD_UNINSTALLER
    ${If} $MineradioDesktopShortcutEnabled != "1"
      Delete "$newDesktopLink"
    ${EndIf}
  !endif
  SetOutPath "$INSTDIR"
  FileOpen $0 "$INSTDIR\${MINERADIO_INSTALL_MARKER}" w
  ${IfNot} ${Errors}
    FileWrite $0 "Mineradio install root$\r$\n"
    FileWrite $0 "appId=${MINERADIO_MARKER_APP_ID}$\r$\n"
    FileClose $0
  ${EndIf}
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"
!macroend

!macro customRemoveFiles
  Call un.MineradioRemoveInstalledFiles
!macroend

!macro customWelcomePage
  Page custom MineradioWelcomeShow MineradioWelcomeLeave
!macroend

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customPageAfterChangeDir
  Page custom MineradioDirectoryShow MineradioDirectoryLeave
!macroend

!macro customFinishPage
  !ifndef HIDE_RUN_AFTER_FINISH
    Function MineradioFinishStartApp
      ${If} ${isUpdated}
        StrCpy $1 "--updated"
      ${Else}
        StrCpy $1 ""
      ${EndIf}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "MineradioFinishStartApp"
  !endif
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW MineradioTintCommonControls
  !insertmacro MUI_PAGE_FINISH
!macroend

!ifndef BUILD_UNINSTALLER
Function MineradioGuiInit
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4) i .r0'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 19, *i 1, i 4) i .r0'
  Call MineradioTintCommonControls
FunctionEnd

Function MineradioTintCommonControls
  SetCtlColors $HWNDPARENT "111217" "FFFFFF"

  GetDlgItem $0 $HWNDPARENT 1
  ${If} $0 <> 0
    SetCtlColors $0 "111217" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 2
  ${If} $0 <> 0
    SetCtlColors $0 "111217" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 3
  ${If} $0 <> 0
    SetCtlColors $0 "111217" "FFFFFF"
  ${EndIf}

  GetDlgItem $0 $HWNDPARENT 1028
  ${If} $0 <> 0
    SetCtlColors $0 "4B5263" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1256
  ${If} $0 <> 0
    SetCtlColors $0 "4B5263" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1034
  ${If} $0 <> 0
    SetCtlColors $0 "" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1035
  ${If} $0 <> 0
    SetCtlColors $0 "" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1037
  ${If} $0 <> 0
    SetCtlColors $0 "111217" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1038
  ${If} $0 <> 0
    SetCtlColors $0 "4B5263" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1039
  ${If} $0 <> 0
    SetCtlColors $0 "" "FFFFFF"
  ${EndIf}

  FindWindow $0 "#32770" "" $HWNDPARENT
  ${If} $0 <> 0
    SetCtlColors $0 "111217" "FFFFFF"

    GetDlgItem $1 $0 1000
    ${If} $1 <> 0
      SetCtlColors $1 "111217" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1001
    ${If} $1 <> 0
      SetCtlColors $1 "111217" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1004
    ${If} $1 <> 0
      SetCtlColors $1 "3257F7" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1006
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1016
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1019
    ${If} $1 <> 0
      SetCtlColors $1 "111217" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1020
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1023
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1024
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1027
    ${If} $1 <> 0
      SetCtlColors $1 "111217" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1201
    ${If} $1 <> 0
      SetCtlColors $1 "111217" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1202
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1203
    ${If} $1 <> 0
      SetCtlColors $1 "111217" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1204
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function MineradioUsePreferredInstallDir
  ${If} $MineradioInstallDirInitialized == "1"
    Return
  ${EndIf}
  StrCpy $MineradioInstallDirInitialized "1"
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/MINERADIO-SHELL" $R1
  ${IfNot} ${Errors}
    Push "$INSTDIR"
    Call MineradioNormalizeInstallDir
    Pop $INSTDIR
    Return
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/D=" $R1
  ${IfNot} ${Errors}
  ${AndIf} $R1 != ""
    StrCpy $INSTDIR "$R1"
  ${Else}
    Call MineradioUseRegisteredInstallDir
    Pop $R2
    ${If} $R2 != "1"
      Call MineradioUseStandardInstallDir
    ${EndIf}
  ${EndIf}
  Push "$INSTDIR"
  Call MineradioNormalizeInstallDir
  Pop $INSTDIR
FunctionEnd

Function MineradioUseStandardInstallDir
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${MINERADIO_INSTALL_DIR_NAME}"
FunctionEnd

Function MineradioLaunchInstallerShell
  InitPluginsDir
  File /oname=$PLUGINSDIR\mineradio-installer-shell.ps1 "${__FILEDIR__}\installer-shell.ps1"
  CopyFiles /SILENT "$PLUGINSDIR\mineradio-installer-shell.ps1" "$TEMP\mineradio-next-installer-shell.ps1"
  System::Call 'kernel32::GetCurrentProcessId() i.r0'
  HideWindow
  Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$TEMP\mineradio-next-installer-shell.ps1" -InstallerPath "$EXEPATH" -ParentProcessId $0'
  SetErrorLevel 0
  Quit
FunctionEnd

Function MineradioNormalizeInstallDir
  Exch $0
  Push "$0"
  Call MineradioTrimInstallDir
  Pop $0
  StrLen $4 "${MINERADIO_INSTALL_DIR_NAME}"
  StrLen $1 "$0"
  ${If} $1 == 2
    StrCpy $2 "$0" 1 1
    ${If} $2 == ":"
      StrCpy $0 "$0\${MINERADIO_INSTALL_DIR_NAME}"
    ${EndIf}
  ${ElseIf} $1 == 3
    StrCpy $2 "$0" 1 1
    StrCpy $3 "$0" 1 2
    ${If} $2 == ":"
    ${AndIf} $3 == "\"
      StrCpy $0 "$0${MINERADIO_INSTALL_DIR_NAME}"
    ${EndIf}
  ${EndIf}

  StrLen $1 "$0"
  IntOp $5 $4 + 1
  StrCpy $2 "$0" $5 -$5
  StrLen $6 "${MINERADIO_LEGACY_INSTALL_DIR_NAME}"
  IntOp $6 $6 + 1
  StrCpy $3 "$0" $6 -$6
  ${If} $1 < $5
  ${OrIf} $2 != "\${MINERADIO_INSTALL_DIR_NAME}"
  ${AndIf} $2 != "\${MINERADIO_INSTALL_DIR_NAME_LOWER}"
    ${If} $1 < $6
    ${OrIf} $3 != "\${MINERADIO_LEGACY_INSTALL_DIR_NAME}"
    ${AndIf} $3 != "\${MINERADIO_LEGACY_INSTALL_DIR_NAME_LOWER}"
      StrCpy $0 "$0\${MINERADIO_INSTALL_DIR_NAME}"
    ${EndIf}
  ${EndIf}
  Exch $0
FunctionEnd

Function MineradioTrimInstallDir
  Exch $0

  trim:
    StrLen $1 "$0"
    ${If} $1 > 3
      StrCpy $2 "$0" 1 -1
      ${If} $2 == "\"
        StrCpy $0 "$0" -1
        Goto trim
      ${EndIf}
    ${EndIf}

  Exch $0
FunctionEnd

Function MineradioInstallDirLooksOwned
  Exch $0
  StrCpy $1 "0"

  IfFileExists "$0\${MINERADIO_INSTALL_MARKER}" 0 +2
    StrCpy $1 "1"
  IfFileExists "$0\resources\${MINERADIO_INSTALL_MARKER}" 0 +2
    StrCpy $1 "1"

  StrCpy $0 "$1"
  Exch $0
FunctionEnd

Function MineradioExistingInstallPathCanBeAdopted
  Exch $0
  StrCpy $1 "0"

  ${If} $0 == ""
    Goto done
  ${EndIf}

  Push "$0"
  Call MineradioTrimInstallDir
  Pop $2
  ${If} $2 == ""
    Goto done
  ${EndIf}

  Push "$2"
  Call MineradioNormalizeInstallDir
  Pop $3
  ${If} $2 != $3
    Goto done
  ${EndIf}

  IfFileExists "$2\*.*" 0 done
  IfFileExists "$2\${MINERADIO_INSTALL_MARKER}" adopt 0
  IfFileExists "$2\resources\${MINERADIO_INSTALL_MARKER}" adopt 0
  IfFileExists "$2\${PRODUCT_FILENAME}.exe" adopt 0
  IfFileExists "$2\resources\app.asar" adopt 0
  IfFileExists "$2\resources\app\package.json" adopt 0
  IfFileExists "$2\resources\app\server.js" adopt 0
  Goto done

  adopt:
    StrCpy $1 "1"

  done:
    StrCpy $0 "$1"
    Exch $0
FunctionEnd

Function MineradioUseRegisteredInstallDir
  ReadRegStr $0 HKCU "Software\${APP_GUID}" InstallLocation
  Push "$0"
  Call MineradioExistingInstallPathCanBeAdopted
  Pop $1
  ${If} $1 == "1"
    Push "$0"
    Call MineradioNormalizeInstallDir
    Pop $INSTDIR
    Push "1"
    Return
  ${EndIf}

  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" InstallLocation
  Push "$0"
  Call MineradioExistingInstallPathCanBeAdopted
  Pop $1
  ${If} $1 == "1"
    Push "$0"
    Call MineradioNormalizeInstallDir
    Pop $INSTDIR
    Push "1"
    Return
  ${EndIf}

  ReadRegStr $0 HKLM "Software\${APP_GUID}" InstallLocation
  Push "$0"
  Call MineradioExistingInstallPathCanBeAdopted
  Pop $1
  ${If} $1 == "1"
    Push "$0"
    Call MineradioNormalizeInstallDir
    Pop $INSTDIR
    Push "1"
    Return
  ${EndIf}

  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" InstallLocation
  Push "$0"
  Call MineradioExistingInstallPathCanBeAdopted
  Pop $1
  ${If} $1 == "1"
    Push "$0"
    Call MineradioNormalizeInstallDir
    Pop $INSTDIR
    Push "1"
    Return
  ${EndIf}

  Push "0"
FunctionEnd

Function MineradioRegisteredInstallDirCanBeAdopted
  Exch $0
  StrCpy $1 "0"

  ${If} $0 == ""
    Goto done
  ${EndIf}

  Push "$0"
  Call MineradioNormalizeInstallDir
  Pop $2

  ReadRegStr $3 HKCU "Software\${APP_GUID}" InstallLocation
  Push "$3"
  Call MineradioExistingInstallPathCanBeAdopted
  Pop $4
  ${If} $4 == "1"
    Push "$3"
    Call MineradioNormalizeInstallDir
    Pop $5
    ${If} $5 == $2
      StrCpy $1 "1"
      Goto done
    ${EndIf}
  ${EndIf}

  ReadRegStr $3 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" InstallLocation
  Push "$3"
  Call MineradioExistingInstallPathCanBeAdopted
  Pop $4
  ${If} $4 == "1"
    Push "$3"
    Call MineradioNormalizeInstallDir
    Pop $5
    ${If} $5 == $2
      StrCpy $1 "1"
      Goto done
    ${EndIf}
  ${EndIf}

  ReadRegStr $3 HKLM "Software\${APP_GUID}" InstallLocation
  Push "$3"
  Call MineradioExistingInstallPathCanBeAdopted
  Pop $4
  ${If} $4 == "1"
    Push "$3"
    Call MineradioNormalizeInstallDir
    Pop $5
    ${If} $5 == $2
      StrCpy $1 "1"
      Goto done
    ${EndIf}
  ${EndIf}

  ReadRegStr $3 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" InstallLocation
  Push "$3"
  Call MineradioExistingInstallPathCanBeAdopted
  Pop $4
  ${If} $4 == "1"
    Push "$3"
    Call MineradioNormalizeInstallDir
    Pop $5
    ${If} $5 == $2
      StrCpy $1 "1"
      Goto done
    ${EndIf}
  ${EndIf}

  done:
    StrCpy $0 "$1"
    Exch $0
FunctionEnd

Function MineradioInstallDirIsEmpty
  Exch $0
  FindFirst $1 $2 "$0\*.*"
  StrCpy $3 "1"

  loop:
    StrCmp $2 "" done
    StrCmp $2 "." next
    StrCmp $2 ".." next
    StrCpy $3 "0"
    Goto done

  next:
    FindNext $1 $2
    Goto loop

  done:
    FindClose $1
    StrCpy $0 "$3"
    Exch $0
FunctionEnd

Function MineradioValidateInstallDir
  Push "$INSTDIR"
  Call MineradioNormalizeInstallDir
  Pop $INSTDIR

  Push "$INSTDIR"
  Call MineradioRegisteredInstallDirCanBeAdopted
  Pop $3

  Push "$INSTDIR"
  Call MineradioExistingInstallPathCanBeAdopted
  Pop $4

  StrLen $0 "$INSTDIR"
  StrLen $2 "${MINERADIO_INSTALL_DIR_NAME}"
  IntOp $2 $2 + 1
  StrCpy $1 "$INSTDIR" $2 -$2
  StrLen $5 "${MINERADIO_LEGACY_INSTALL_DIR_NAME}"
  IntOp $5 $5 + 1
  StrCpy $6 "$INSTDIR" $5 -$5
  ${If} $0 < $2
  ${OrIf} $1 != "\${MINERADIO_INSTALL_DIR_NAME}"
  ${AndIf} $1 != "\${MINERADIO_INSTALL_DIR_NAME_LOWER}"
    ${If} $0 < $5
    ${OrIf} $6 != "\${MINERADIO_LEGACY_INSTALL_DIR_NAME}"
    ${AndIf} $6 != "\${MINERADIO_LEGACY_INSTALL_DIR_NAME_LOWER}"
      MessageBox MB_ICONSTOP|MB_OK "安装目录必须是独立的 Mineradio-Next 文件夹。请选择一个上级目录，安装器会自动创建 Mineradio-Next 子文件夹。"
      Abort
    ${EndIf}
  ${EndIf}

  IfFileExists "$INSTDIR\*.*" 0 valid

  Push "$INSTDIR"
  Call MineradioInstallDirLooksOwned
  Pop $0
  ${If} $0 == "1"
    Goto valid
  ${EndIf}

  ${If} $3 == "1"
    Goto valid
  ${EndIf}

  ${If} $4 == "1"
    Goto valid
  ${EndIf}

  Push "$INSTDIR"
  Call MineradioInstallDirIsEmpty
  Pop $0
  ${If} $0 == "1"
    Goto valid
  ${EndIf}

  MessageBox MB_ICONSTOP|MB_OK "为避免卸载时误删其它文件，Mineradio 不能安装到已有文件的非专属目录。请新建或选择一个空的 Mineradio 文件夹。$\r$\n$\r$\n当前路径：$INSTDIR"
  Abort

  valid:
FunctionEnd
Function MineradioWelcomeShow
  Call MineradioUsePreferredInstallDir

  nsDialogs::Create 1018
  Pop $MineradioWelcomePage
  ${If} $MineradioWelcomePage == error
    Abort
  ${EndIf}

  SetCtlColors $MineradioWelcomePage "111217" "F6F8F8"
  CreateFont $MineradioHeroFont "Microsoft YaHei UI" 19 700
  CreateFont $MineradioTitleFont "Microsoft YaHei UI" 11 700
  CreateFont $MineradioBodyFont "Microsoft YaHei UI" 9 400
  CreateFont $MineradioSmallFont "Microsoft YaHei UI" 8 400

  InitPluginsDir
  File /oname=$PLUGINSDIR\mineradio-installer-panel.bmp "${__FILEDIR__}\installerSidebar.bmp"
  ${NSD_CreateBitmap} 0 0 104u 184u ""
  Pop $0
  ${NSD_SetStretchedImage} $0 "$PLUGINSDIR\mineradio-installer-panel.bmp" $MineradioWelcomeBitmapHandle

  ${NSD_CreateLabel} 122u 18u 148u 10u "MINERADIO NEXT"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MineradioSmallFont 1
  SetCtlColors $0 "168B77" "F6F8F8"

  ${NSD_CreateLabel} 122u 40u 148u 24u "安装 Mineradio Next"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MineradioHeroFont 1
  SetCtlColors $0 "111217" "F6F8F8"

  ${NSD_CreateLabel} 122u 70u 28u 2u ""
  Pop $0
  SetCtlColors $0 "" "55DDB5"

  ${NSD_CreateLabel} 122u 84u 148u 30u "Windows 桌面音乐播放器。支持多来源播放、本地曲库、歌词与桌面模式。"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MineradioBodyFont 1
  SetCtlColors $0 "4B5263" "F6F8F8"

  ${NSD_CreateLabel} 122u 121u 148u 18u "安装位置：$INSTDIR"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MineradioSmallFont 1
  SetCtlColors $0 "5D686D" "F6F8F8"

  ${NSD_CreateCheckBox} 122u 146u 148u 18u "安装选项（位置与桌面快捷方式）"
  Pop $MineradioInstallOptionsControl
  SendMessage $MineradioInstallOptionsControl ${WM_SETFONT} $MineradioSmallFont 1
  ${If} $MineradioInstallOptionsEnabled == "1"
    ${NSD_Check} $MineradioInstallOptionsControl
  ${Else}
    ${NSD_Uncheck} $MineradioInstallOptionsControl
  ${EndIf}
  ${NSD_OnClick} $MineradioInstallOptionsControl MineradioWelcomeOptionsChanged

  !ifdef MINERADIO_INTERNAL_BETA
    ${NSD_CreateLabel} 122u 166u 148u 16u "${MINERADIO_INSTALL_NOTICE}"
    Pop $0
    SendMessage $0 ${WM_SETFONT} $MineradioSmallFont 1
    SetCtlColors $0 "B42318" "F6F8F8"
  !endif

  Call MineradioWelcomeRefreshNextButton
  nsDialogs::Show
FunctionEnd

Function MineradioWelcomeOptionsChanged
  Pop $0
  ${NSD_GetState} $MineradioInstallOptionsControl $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $MineradioInstallOptionsEnabled "1"
  ${Else}
    StrCpy $MineradioInstallOptionsEnabled "0"
  ${EndIf}
  Call MineradioWelcomeRefreshNextButton
FunctionEnd

Function MineradioWelcomeRefreshNextButton
  GetDlgItem $0 $HWNDPARENT 1
  ${If} $MineradioInstallOptionsEnabled == "1"
    SendMessage $0 ${WM_SETTEXT} 0 "STR:下一步"
  ${Else}
    SendMessage $0 ${WM_SETTEXT} 0 "STR:安装"
  ${EndIf}
FunctionEnd

Function MineradioWelcomeLeave
  ${NSD_GetState} $MineradioInstallOptionsControl $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $MineradioInstallOptionsEnabled "1"
  ${Else}
    StrCpy $MineradioInstallOptionsEnabled "0"
    Call MineradioValidateInstallDir
  ${EndIf}
FunctionEnd

Function MineradioDirectoryBrowse
  nsDialogs::SelectFolderDialog "选择 ${PRODUCT_NAME} 安装文件夹" "$INSTDIR"
  Pop $0
  ${If} $0 != error
  ${AndIf} $0 != ""
    Push "$0"
    Call MineradioNormalizeInstallDir
    Pop $0
    StrCpy $INSTDIR "$0"
    SendMessage $MineradioDirectoryInput ${WM_SETTEXT} 0 "STR:$INSTDIR"
  ${EndIf}
FunctionEnd

Function MineradioDirectoryShow
  Call MineradioUsePreferredInstallDir

  ${If} $MineradioInstallOptionsEnabled != "1"
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $MineradioDirectoryPage
  ${If} $MineradioDirectoryPage == error
    Abort
  ${EndIf}

  SetCtlColors $MineradioDirectoryPage "111217" "FFFFFF"
  CreateFont $MineradioTitleFont "Microsoft YaHei UI" 15 700
  CreateFont $MineradioBodyFont "Microsoft YaHei UI" 9 400
  CreateFont $MineradioSmallFont "Microsoft YaHei UI" 8 500

  ${NSD_CreateLabel} 22u 12u 238u 20u "选择安装位置"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MineradioTitleFont 1
  SetCtlColors $0 "111217" "FFFFFF"

  ${NSD_CreateLabel} 22u 40u 238u 24u "你可以使用默认路径，也可以选择其它磁盘或文件夹。安装器会自动创建缺失的目录。"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MineradioBodyFont 1
  SetCtlColors $0 "4B5263" "FFFFFF"

  ${NSD_CreateLabel} 22u 76u 238u 10u "安装目录"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MineradioSmallFont 1
  SetCtlColors $0 "3257F7" "FFFFFF"

  ${NSD_CreateText} 22u 94u 178u 15u "$INSTDIR"
  Pop $MineradioDirectoryInput
  SendMessage $MineradioDirectoryInput ${WM_SETFONT} $MineradioBodyFont 1
  SetCtlColors $MineradioDirectoryInput "111217" "FFFFFF"

  ${NSD_CreateBrowseButton} 210u 93u 50u 17u "浏览..."
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MineradioSmallFont 1
  ${NSD_OnClick} $0 MineradioDirectoryBrowse

  ${NSD_CreateCheckBox} 22u 122u 238u 18u "创建桌面快捷方式"
  Pop $MineradioDesktopShortcutControl
  SendMessage $MineradioDesktopShortcutControl ${WM_SETFONT} $MineradioSmallFont 1
  ${If} $MineradioDesktopShortcutEnabled == "1"
    ${NSD_Check} $MineradioDesktopShortcutControl
  ${Else}
    ${NSD_Uncheck} $MineradioDesktopShortcutControl
  ${EndIf}

  ${NSD_CreateLabel} 22u 150u 238u 20u "旧版用户将继续使用已识别的安装位置；账号、歌单和设置保存在独立的数据目录中。"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MineradioSmallFont 1
  SetCtlColors $0 "6B7280" "FFFFFF"

  nsDialogs::Show
FunctionEnd

Function MineradioDirectoryLeave
  ${NSD_GetText} $MineradioDirectoryInput $0
  ${If} $0 == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "请选择安装文件夹。"
    Abort
  ${EndIf}
  Push "$0"
  Call MineradioNormalizeInstallDir
  Pop $0
  StrCpy $INSTDIR "$0"
  SendMessage $MineradioDirectoryInput ${WM_SETTEXT} 0 "STR:$INSTDIR"
  ${NSD_GetState} $MineradioDesktopShortcutControl $1
  ${If} $1 == ${BST_CHECKED}
    StrCpy $MineradioDesktopShortcutEnabled "1"
  ${Else}
    StrCpy $MineradioDesktopShortcutEnabled "0"
  ${EndIf}
  Call MineradioValidateInstallDir
FunctionEnd
!endif

!ifdef BUILD_UNINSTALLER
!macro customUnInit
  Call un.MineradioValidateUninstallDir
  ${IfNot} ${Silent}
    Call un.MineradioLaunchUninstallerShell
  ${EndIf}
!macroend

Function un.MineradioLaunchUninstallerShell
  InitPluginsDir
  File /oname=$PLUGINSDIR\mineradio-uninstaller-shell.ps1 "${__FILEDIR__}\installer-shell.ps1"
  CopyFiles /SILENT "$PLUGINSDIR\mineradio-uninstaller-shell.ps1" "$TEMP\mineradio-next-uninstaller-shell.ps1"
  System::Call 'kernel32::GetCurrentProcessId() i.r0'
  HideWindow
  Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$TEMP\mineradio-next-uninstaller-shell.ps1" -InstallerPath "$INSTDIR\Uninstall ${PRODUCT_FILENAME}.exe" -InstallPath "$INSTDIR" -ParentProcessId $0 -Uninstall'
  SetErrorLevel 0
  Quit
FunctionEnd

Function un.MineradioInstallDirLooksOwned
  Exch $0
  Push $1
  Push $2
  StrCpy $1 "0"

  Push "$0\${MINERADIO_INSTALL_MARKER}"
  Call un.MineradioMarkerIsTrusted
  Pop $2
  ${If} $2 == "1"
    StrCpy $1 "1"
    Goto done
  ${EndIf}

  Push "$0\resources\${MINERADIO_INSTALL_MARKER}"
  Call un.MineradioMarkerIsTrusted
  Pop $2
  ${If} $2 == "1"
    StrCpy $1 "1"
  ${EndIf}

  done:
  StrCpy $0 "$1"
  Pop $2
  Pop $1
  Exch $0
FunctionEnd

Function un.MineradioMarkerIsTrusted
  Exch $0
  Push $1
  Push $2
  Push $3
  StrCpy $1 "0"

  ClearErrors
  FileOpen $2 "$0" r
  ${If} ${Errors}
    Goto done
  ${EndIf}

  read:
    ClearErrors
    FileRead $2 $3
    ${If} ${Errors}
      Goto close
    ${EndIf}
    StrCmp $3 "appId=${MINERADIO_MARKER_APP_ID}$\r$\n" trusted
    StrCmp $3 "appId=${MINERADIO_MARKER_APP_ID}$\n" trusted
    StrCmp $3 "appId=${MINERADIO_MARKER_APP_ID}" trusted
    Goto read

  trusted:
    StrCpy $1 "1"

  close:
    FileClose $2

  done:
  StrCpy $0 "$1"
  Pop $3
  Pop $2
  Pop $1
  Exch $0
FunctionEnd

Function un.MineradioNormalizeInstallDir
  Exch $0
  Push "$0"
  Call un.MineradioTrimInstallDir
  Pop $0
  StrLen $4 "${MINERADIO_INSTALL_DIR_NAME}"
  StrLen $1 "$0"
  ${If} $1 == 2
    StrCpy $2 "$0" 1 1
    ${If} $2 == ":"
      StrCpy $0 "$0\${MINERADIO_INSTALL_DIR_NAME}"
    ${EndIf}
  ${ElseIf} $1 == 3
    StrCpy $2 "$0" 1 1
    StrCpy $3 "$0" 1 2
    ${If} $2 == ":"
    ${AndIf} $3 == "\"
      StrCpy $0 "$0${MINERADIO_INSTALL_DIR_NAME}"
    ${EndIf}
  ${EndIf}

  StrLen $1 "$0"
  IntOp $5 $4 + 1
  StrCpy $2 "$0" $5 -$5
  StrLen $6 "${MINERADIO_LEGACY_INSTALL_DIR_NAME}"
  IntOp $6 $6 + 1
  StrCpy $3 "$0" $6 -$6
  ${If} $1 < $5
  ${OrIf} $2 != "\${MINERADIO_INSTALL_DIR_NAME}"
  ${AndIf} $2 != "\${MINERADIO_INSTALL_DIR_NAME_LOWER}"
    ${If} $1 < $6
    ${OrIf} $3 != "\${MINERADIO_LEGACY_INSTALL_DIR_NAME}"
    ${AndIf} $3 != "\${MINERADIO_LEGACY_INSTALL_DIR_NAME_LOWER}"
      StrCpy $0 "$0\${MINERADIO_INSTALL_DIR_NAME}"
    ${EndIf}
  ${EndIf}
  Exch $0
FunctionEnd

Function un.MineradioTrimInstallDir
  Exch $0

  trim:
    StrLen $1 "$0"
    ${If} $1 > 3
      StrCpy $2 "$0" 1 -1
      ${If} $2 == "\"
        StrCpy $0 "$0" -1
        Goto trim
      ${EndIf}
    ${EndIf}

  Exch $0
FunctionEnd

Function un.MineradioValidateUninstallDir
  Push "$INSTDIR"
  Call un.MineradioTrimInstallDir
  Pop $0
  Push "$0"
  Call un.MineradioNormalizeInstallDir
  Pop $1
  ${If} $0 != $1
    MessageBox MB_OK|MB_ICONSTOP "当前卸载路径不是 Mineradio 专属目录，已阻止卸载以避免误删其它文件。$\r$\n$\r$\n当前路径：$INSTDIR$\r$\n安全路径应为：$0"
    SetErrorLevel 2
    Quit
  ${EndIf}
  StrCpy $INSTDIR "$0"

  Push "$INSTDIR"
  Call un.MineradioInstallDirLooksOwned
  Pop $0
  ${If} $0 != "1"
    MessageBox MB_OK|MB_ICONSTOP "无法确认当前目录属于 Mineradio，已阻止卸载以避免误删其它文件。$\r$\n$\r$\n当前路径：$INSTDIR"
    SetErrorLevel 2
    Quit
  ${EndIf}
FunctionEnd

Function un.MineradioRemoveInstalledFiles
  SetOutPath $TEMP
  RMDir /r "$INSTDIR"
FunctionEnd
!endif
