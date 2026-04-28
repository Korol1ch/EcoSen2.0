# 🚀 EcoSen — Инструкция по деплою на Render (бесплатно)

## Что ты получишь
- ✅ Backend API на Node.js (Express)
- ✅ PostgreSQL база данных (данные сохраняются навсегда)
- ✅ Авторизация (регистрация / вход)
- ✅ Баллы синхронизируются с сервером
- ✅ Keep-alive (сервер не засыпает)
- ✅ Лидерборд с реальными пользователями

---

## ШАГ 1 — Загрузи код на GitHub

1. Зайди на https://github.com и создай аккаунт (если нет)
2. Нажми **New repository** → назови `ecosen-backend` → Public → Create
3. На своём компьютере открой терминал в папке `ecosen-backend/`:

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/ТВОЙ_НИК/ecosen-backend.git
git push -u origin main
```

---

## ШАГ 2 — Создай PostgreSQL базу данных на Render

1. Зайди на https://render.com → зарегистрируйся
2. Dashboard → **New** → **PostgreSQL**
3. Настройки:
   - Name: `ecosen-db`
   - Plan: **Free**
   - Region: Frankfurt (EU Central) — ближайший к Казахстану
4. Нажми **Create Database**
5. Подожди ~1 минуту, затем скопируй **Internal Database URL** (выглядит как `postgresql://user:pass@host/db`)

---

## ШАГ 3 — Создай Web Service на Render

1. Dashboard → **New** → **Web Service**
2. Подключи GitHub → выбери репозиторий `ecosen-backend`
3. Настройки:
   - **Name:** `ecosen-api`
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
4. Нажми **Advanced** → **Add Environment Variables:**

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Internal Database URL из Шага 2 |
| `JWT_SECRET` | придумай длинную строку: `ecosen_super_secret_2024_актау_xyz` |
| `NODE_ENV` | `production` |
| `RENDER_EXTERNAL_URL` | оставь пустым — заполнишь после первого деплоя |

5. Нажми **Create Web Service**
6. Подожди ~3-5 минут пока задеплоится
7. Скопируй URL вида `https://ecosen-api.onrender.com`

---

## ШАГ 4 — Обнови RENDER_EXTERNAL_URL

1. В Render → твой сервис → **Environment**
2. Добавь: `RENDER_EXTERNAL_URL` = `https://ecosen-api.onrender.com` (твой URL)
3. Нажми **Save Changes** — сервис перезапустится

---

## ШАГ 5 — Обнови ссылку в index.html

Открой `index.html`, найди строку:
```javascript
const API_BASE = 'https://ecosen-api.onrender.com';
```
Замени на твой реальный URL из Шага 3, и запушь снова:
```bash
git add .
git commit -m "set api url"
git push
```

---

## ШАГ 6 — Проверь что всё работает

Открой в браузере:
- `https://ecosen-api.onrender.com/health` — должен вернуть `{"status":"ok"}`
- `https://ecosen-api.onrender.com/` — должен открыться EcoSen

---

## ⚠️ Про бесплатный план Render

**Проблема:** Render Free засыпает после 15 минут без запросов.
**Решение:** В коде уже встроен `keep-alive` — пинг каждые 14 минут.

Но! Если никто не открывал сайт несколько часов — при первом запросе будет задержка ~30 секунд пока сервер просыпается. Это нормально для бесплатного плана.

**Бесплатные лимиты:**
- 750 часов/месяц Web Service (хватит на весь месяц при 1 сервисе)
- 1 GB PostgreSQL (хватит на тысячи пользователей)
- 100 GB bandwidth

---

## API Endpoints (для разработки)

```
POST /api/auth/register   — регистрация { name, email, password }
POST /api/auth/login      — вход { email, password }
GET  /api/auth/me         — текущий пользователь (требует токен)

GET  /api/user/me         — профиль
GET  /api/user/history    — история сканирований
GET  /api/user/leaderboard — рейтинг
POST /api/user/scan       — записать скан { material, points, icon }

GET  /api/stations        — список пунктов приёма
```

---

## Если что-то не работает

1. Проверь логи: Render → твой сервис → **Logs**
2. Проверь переменные окружения
3. Убедись что DATABASE_URL правильный (Internal URL, не External!)
