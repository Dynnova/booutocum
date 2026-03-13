@echo off
echo Export database ke JSON...
node src/export.js
if errorlevel 1 (
  echo Export gagal!
  pause
  exit /b 1
)

echo.
echo Push ke GitHub...
git add web/public/cosplay.json
git commit -m "update: cosplay data %date% %time%"
git push

echo.
echo Selesai! Netlify akan auto deploy dalam ~1 menit.
pause
