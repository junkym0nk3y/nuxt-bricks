# server/utils/auth

HTTP-логика database-auth (не подменяемая адаптером — работа с cookie, scrypt,
rate limiting и матрицами путей и прав). Хранилище пользователей/сессий — за
`IAuthAdapter` (`modules/persistence/server/registry.ts`).

Две матрицы работают последовательно и отвечают на разные вопросы:
`routeProtection` — «нужна ли этому пути авторизация вообще», `rolePolicy` —
«хватает ли роли уже вошедшего». Вторая вызывается только для путей, которые
первая сочла защищёнными.

| Файл                  | Назначение                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `passwords.ts`        | scrypt hash/verify паролей (формат `scrypt:N:r:p:saltB64:hashB64`), `DUMMY_PASSWORD_HASH` (анти-enumeration)                  |
| `sessionCookie.ts`    | Cookie `bricks-session`: генерация/SHA-256 токена, get/set/clear, срок жизни из runtimeConfig                                 |
| `session.ts`          | `resolveSessionUser(event)` — cookie → hash → адаптер → сессия с пользователем или null                                       |
| `loginRateLimiter.ts` | In-memory лимитер логина: 5 неудач/15 мин → lockout 15 мин, opportunistic sweep, bound 10k записей                            |
| `routeProtection.ts`  | `requiresAuth(pathname, method, mode)` + `isProtectedHtmlPath()` — матрица защищённых путей                                   |
| `rolePolicy.ts`       | `resolveRequiredAccess(pathname, method)` + `isAccessSatisfied(role, requirement)` — матрица прав уже авторизованного запроса |
| `csrfProtection.ts`   | Гейт unsafe-методов: кастомный заголовок + сверка Origin/Referer, список защищённых путей                                     |
| `scryptGate.ts`       | Общий семафор scrypt-дериваций (вход и установка паролей); переполнение очереди → 503                                         |
| `userManagement.ts`   | Ручки `users/**`: доступность раздела (404), запрет операций над собой (409), валидация DTO и хеширование пароля              |
| `types.d.ts`          | `TBricksAuthMode`, типы логина и требования доступа, augmentation `H3EventContext.bricksUser`                                 |
