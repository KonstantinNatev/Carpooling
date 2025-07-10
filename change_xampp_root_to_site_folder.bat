@echo off

REM This will set XAMPP root to this panel
rmdir C:\iris_xampp_root_shortcut
SET CURRENT_DIRECTORY=%~dp0_site
echo %CURRENT_DIRECTORY%
mklink /J C:\iris_xampp_root_shortcut "%CURRENT_DIRECTORY%"