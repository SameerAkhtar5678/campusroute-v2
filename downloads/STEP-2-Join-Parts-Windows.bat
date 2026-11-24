@echo off
title CampusRoute - Join download parts
echo.
echo  CampusRoute - Dijkstra Navigator
echo  --------------------------------
echo  This joins the 5 downloaded part files into the full
echo  CampusRoute-Windows.zip. Run it from the SAME folder
echo  where you saved all 5 parts.
echo.
if not exist "CampusRoute-Windows.zip.part-5" (
    echo  [X] Parts not found! Make sure all 5 part files
    echo      are in this same folder, then run this again.
    pause
    exit /b
)
echo  Joining parts... please wait a moment.
copy /b "CampusRoute-Windows.zip.part-1" + "CampusRoute-Windows.zip.part-2" + "CampusRoute-Windows.zip.part-3" + "CampusRoute-Windows.zip.part-4" + "CampusRoute-Windows.zip.part-5" "CampusRoute-Windows.zip" >nul
if errorlevel 1 (
    echo  [X] Something went wrong while joining.
    pause
    exit /b
)
echo  [OK] CampusRoute-Windows.zip created!
echo  Next: right-click it and choose "Extract All",
echo        then open the folder and run CampusRoute.exe
echo.
pause
