# ============================================================================
# Learn JKLU 2.0 — 1-Click Local Sandbox Launcher (Offline Local SQL Engine)
# Backend:  http://localhost:8001 (Embedded PGlite SQL from learn_jklu_2_local.sql)
# Frontend: http://localhost:3001
# ============================================================================
Write-Host "🚀 Starting Learn JKLU 2.0 Local SQL Sandbox..." -ForegroundColor Cyan
Write-Host "   - Live Neon PostgreSQL, Redis Cloud, and Neo4j AuraDB are 100% DISCONNECTED." -ForegroundColor Green
Write-Host "   - Local SQL Schema & Seed: ./backend/data/learn_jklu_2_local.sql" -ForegroundColor Green

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; npm start"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\Exam_quiz_Portal_Lib_JKLU'; npx next dev -p 3000"

Write-Host "✅ Backend starting on http://localhost:8001" -ForegroundColor Yellow
Write-Host "✅ Frontend starting on http://localhost:3000/faculty and http://localhost:3000/classroom" -ForegroundColor Yellow
