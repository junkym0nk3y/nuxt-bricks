# TypeScript Rules

## Naming Conventions

- `I` — interfaces: `IUser`, `IProps`, `IEmits`
- `T` — types: `TStatus`, `TApiResponse`
- `E` — enums: `EUserRole`, `EPaymentMethod`

## Type Storage

```ts
// ❌ BAD — inline interface
const appConfig = useAppConfig() as {
    bricks?: { maxWidth?: string };
};

// ✅ GOOD — stored in types/*.d.ts
// types/config.d.ts
export interface IAppConfig {
    bricks?: { maxWidth?: string };
}

// usage
import type { IAppConfig } from '../types/config';
const appConfig = useAppConfig() as IAppConfig;
```

Интерфейсы и type-алиасы объявляются **только** в файлах типов — независимо от
того, экспортируются они или «нужны лишь здесь». Причина не в стиле: тип,
объявленный внутри модуля, невозможно переиспользовать, не переписав его рядом, а
две копии расходятся молча. Один тип — одно объявление в `types/`.

Правило действует и для build-time слоя: типы модулей `src/*.ts` живут в
`src/types/`, один файл на модуль (`module.ts` → `src/types/module.d.ts`,
`bricks-manifest.ts` → `src/types/bricksManifest.d.ts`). Модуль тип только
импортирует, а если тип входит в публичный API пакета — ещё и ре-экспортирует
(`export type { IBricksModuleOptions }` в `module.ts`). Проверяется тестом
`test/module/typeLocations.spec.ts` — он же сторожит композаблы рантайм-доменов
(`src/runtime/modules/**/composables/`). `stores/`, `utils/` и серверный слой под
проверку пока не попадают: там объявления ещё не разнесены по `types/`.

## Forbidden Patterns

```ts
// ❌ any
const data: any = response;

// ✅ Type it
const data: IApiResponse<IUser> = response;

// ❌ as unknown as
const user = data as unknown as IUser;

// ✅ Type guard
function isUser(data: unknown): data is IUser {
    return typeof data === 'object' && data !== null && 'id' in data;
}
```

### Исключение: `as unknown as` в `test/`

В спеках приведение разрешено. Причина не в удобстве: тест мокает частичный
объект — стор с тремя нужными полями из двадцати, event с одним заголовком, —
и полная типизация мока стоит дороже, чем даёт. Запрет распространялся на
`test/` де-факто и только для нового кода: исторические приведения при этом
оставались, то есть правило нельзя было прочитать по самому правилу.

В `src/` запрет действует без оговорок — там приведение маскирует расхождение
контрактов, а не экономит на моке.

## Prefer Object Maps over Switch

```ts
// ❌ switch-case
function getStatusText(status: string): string {
    switch (status) {
        case 'pending':
            return 'Ожидание';
        case 'approved':
            return 'Одобрено';
        default:
            return 'Неизвестно';
    }
}

// ✅ Object map
type TStatus = 'pending' | 'approved' | 'rejected';

const STATUS_TEXT: Record<TStatus, string> = {
    pending: 'Ожидание',
    approved: 'Одобрено',
    rejected: 'Отклонено',
};

function getStatusText(status: TStatus): string {
    return STATUS_TEXT[status] ?? 'Неизвестно';
}
```
