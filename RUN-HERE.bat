@echo off
echo ========================================
echo   Faprot Secure Browser Launcher
echo ========================================
echo.
echo Starting your secure browser...
echo.

REM Check if simple-browser.html exists
if exist "simple-browser.html" (
    echo ✅ Found browser file
    echo 🌐 Opening browser...
    echo.
    start simple-browser.html
    echo.
    echo 🎉 Browser should open in your default web browser!
    echo.
    echo 🔍 Test these URLs in the browser:
    echo    - https://www.google.com (Safe)
    echo    - https://suspicious-login.example.com (Warning)
    echo    - https://phishing-scam.fake (Danger)
    echo.
    echo 🛡️ Try the security features:
    echo    - Click 🔍 to scan URLs
    echo    - Click 🧪 to run security tests
    echo    - Check the security dashboard
    echo.
) else (
    echo ❌ Browser file not found!
    echo Please make sure simple-browser.html is in the same folder
)

echo.
echo Press any key to close this window...
pause > nul
