@echo off

for /f "tokens=*" %%F in ("%~dp0..\") do set rootD=%%~dpF

"%rootD%bin\MATWeb.cmd" --spawn_tabbed_terminal
