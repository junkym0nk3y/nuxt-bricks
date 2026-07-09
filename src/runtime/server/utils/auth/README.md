# server/utils/auth

HTTP-логика database-auth (не подменяемая адаптером — работа с cookie, scrypt,
rate limiting и матрицей путей). Хранилище пользователей/сессий — за
`IAuthAdapter` (`modules/persistence/server/registry.ts`).

| Файл                  | Назначение                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `passwords.ts`        | scrypt hash/verify паролей (формат `scrypt:N:r:p:saltB64:hashB64`), `DUMMY_PASSWORD_HASH` (анти-enumeration) |
| `sessionCookie.ts`    | Cookie `bricks-session`: генерация/SHA-256 токена, get/set/clear, срок жизни из runtimeConfig                |
| `session.ts`          | `resolveSessionUser(event)` — cookie → hash → адаптер → сессия с пользователем или null                      |
| `loginRateLimiter.ts` | In-memory лимитер логина: 5 неудач/15 мин → lockout 15 мин, opportunistic sweep, bound 10k записей           |
| `routeProtection.ts`  | `requiresAuth(pathname, method, mode)` + `isProtectedHtmlPath()` — матрица защищённых путей                  |
| `types.d.ts`          | `TBricksAuthMode`, augmentation `H3EventContext.bricksUser`                                                  |
