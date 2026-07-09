# nuxt-bricks

Визуальный билдер лендингов для Nuxt 3 с drag-and-drop компонентами. Самостоятельный Nuxt Module: дашборд страниц на `/bricks`, редактор на `/bricks/<pagename>`, превью на `/preview/<pagename>`.

## Авторизация

Защищённые пути (в обоих режимах одна матрица): `/bricks/**` (менеджер страниц + редактор), `/preview/**` (превью рендера), `/mock-api/s3-*` (загрузка/удаление файлов) и модифицирующие методы `POST/PUT/PATCH/DELETE /api/bricks/**`. Чтение `GET /api/bricks/**` публично — это контент лендингов.

Конфигурация — через env (`.env`):

```bash
BRICKS_AUTH_MODE=database                              # 'basic' (дефолт) | 'database'
BRICKS_AUTH_SESSION_MAX_AGE=604800                     # срок cookie-сессии в секундах, 7 дней (только database)
NUXT_BRICKS_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bricks  # обязателен для database
```

Несекретные опции (`mode`, `sessionMaxAgeSeconds`) можно задать и в nuxt.config (`bricks.auth`). Строку подключения к БД в `bricks.database.url` не класть — секретам не место в nuxt.config, он уходит в git; только env.

> Нюанс для уже собранного приложения: `NUXT_BRICKS_AUTH_MODE` меняет только server-ключ runtimeConfig — клиенту (401-редирект, страница логина) нужен ещё `NUXT_PUBLIC_BRICKS_AUTH_MODE`. Обычный `BRICKS_AUTH_MODE` при старте модуля заполняет оба.

### Режим `basic` (дефолт)

HTTP Basic Auth с одной парой креденшелов.

| Env                   | Дефолт      |
| --------------------- | ----------- |
| `BASIC_AUTH_USERNAME` | `admin`     |
| `BASIC_AUTH_PASSWORD` | `change-me` |

Дефолтный пароль — только для dev: в production с `change-me` защищённые пути отвечают `503` (забытый пароль закрывает доступ, а не оставляет дыру).

### Режим `database`

Пользователи в Postgres (scrypt-хеш пароля), страница логина `/bricks/login`, отзываемые cookie-сессии в БД (HttpOnly, SameSite=Lax, Secure в production; в БД хранится только SHA-256 токена). Брутфорс логина ограничен: 5 неудач за 15 минут на пару IP+логин → блокировка на 15 минут (`429`).

Таблицы `bricks_users` / `bricks_sessions` создаются автоматически при первом обращении (`ensureSchema`), для свежих установок они же есть в `database/init.sql`.

**Дефолтных пользователей нет** — пока не заведёте пользователя, войти невозможно.

Создание пользователя:

```bash
npm run bricks:hash -- mypassword --username admin
# печатает хеш и готовый SQL:
# INSERT INTO bricks_users (username, password_hash) VALUES ('admin', 'scrypt:...');
```

Смена пароля — тот же CLI, затем:

```sql
UPDATE bricks_users SET password_hash = '<новый hash>' WHERE username = 'admin';
-- опционально отозвать активные сессии:
DELETE FROM bricks_sessions WHERE user_id = (SELECT id FROM bricks_users WHERE username = 'admin');
```

Деактивация без удаления: `UPDATE bricks_users SET is_active = false WHERE username = '...';`

Хранилище пользователей/сессий подменяемо — `setBricksAuthAdapter` из `nuxt-bricks/persistence` (Nitro-плагин потребителя).

### Ограничения (осознанные, v1)

- Rate limiter логина живёт в памяти процесса — при нескольких репликах лимит слабеет пропорционально их числу.
- Нет 2FA, ролей и UI управления пользователями: один уровень доступа, провижининг вручную.
- `Secure`-флаг cookie включается по `NODE_ENV=production` — в бою обязателен HTTPS.
- `login` — зарезервированный pagename (занят страницей логина).

## Остальные env

| Env                                                                                                | Назначение                                             |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `PROXY_URL`                                                                                        | Внешний backend для `/api/*` (proxy-режим persistence) |
| `NUXT_BRICKS_DATABASE_URL`                                                                         | PostgreSQL для локального storage-адаптера             |
| `YANDEX_STORAGE_ACCESS_KEY_ID` / `YANDEX_STORAGE_SECRET_ACCESS_KEY` / `YANDEX_STORAGE_BUCKET_NAME` | S3-хранилище публикации медиа                          |

Подробности архитектуры — в `CLAUDE.md`.
