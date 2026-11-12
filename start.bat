@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  Nuit a Paris - локальный сервер
echo  На этом компьютере откройте:  http://localhost:8080
echo  На телефоне (та же Wi-Fi сеть): http://IP-компьютера:8080
for /f "tokens=2 delims=:" %%a in (ipconfig ^| findstr /c:"IPv4") do echo     IP:%%a
echo  Чтобы остановить - закройте это окно.
echo.
start "" http://localhost:8080
where py >nul 2>nul && (py -m http.server 8080 & goto :eof)
where python >nul 2>nul && (python -m http.server 8080 & goto :eof)
where npx >nul 2>nul && (npx --yes http-server -p 8080 -c-1 & goto :eof)
echo  Не найден ни Python, ни Node.js. Установите Python с python.org и запустите снова.
pause
