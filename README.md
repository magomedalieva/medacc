# MedAcc

MedAcc - учебная веб-платформа для подготовки студентов медицинского профиля к первичной аккредитации.

## Структура проекта

- `backend` - серверная часть на FastAPI, SQLAlchemy, Alembic и PostgreSQL.
- `frontend` - клиентская часть на React, TypeScript и Vite.
- `docs` - пояснительная записка и материалы ВКР.
- `C:\MedAccData` - внешняя папка для медиа и импортируемых файлов.

## Запуск через Docker

Создать локальные папки данных:

```powershell
New-Item -ItemType Directory -Force C:\MedAccData\media
New-Item -ItemType Directory -Force C:\MedAccData\imports
```

Запустить проект из корня:

```powershell
cd C:\MedAcc
docker compose up -d
```

Frontend будет доступен на `http://localhost:5173`, backend API - на `http://localhost:8000`.

## Локальный запуск

Backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```
