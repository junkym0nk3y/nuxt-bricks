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
