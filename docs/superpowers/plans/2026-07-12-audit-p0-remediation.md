# Audit P0 Remediation (A-01, A-02) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть оба P0 из `docs/application-audit-2026-07-12.md`: A-01 (неканонический S3-URL обходит managed namespace) и A-02 (сервер принимает структурно невалидные/циклические схемы, ломающие public render).

**Architecture:** A-01 — канонизация URL через WHATWG-парсер в чистом модуле `s3KeyPolicy.ts` (единая точка для register/proxy/delete/upload) + удаление legacy-ручки `POST /api/bricks/media`. A-02 — изоморфный чистый валидатор графа компонентов в `common/utils/bricks/schemaContract.ts`, подключённый в четырёх точках: server create/update, server restore, импорт JSON в билдере, защитный фильтр + cycle guard рендера (legacy-данные в БД).

**Tech Stack:** TypeScript, Vue 3, h3/Nitro, vitest (тесты в `test/*.spec.ts`, паттерн — соседние spec-файлы).

## Global Constraints

- После **каждого** изменения `.vue`/`.ts`: `npx vue-tsc --noEmit 2>&1 | grep <changed-file>` и `npx oxlint <changed-file>` (CLAUDE.md).
- Тесты запускать точечно: `npx vitest run test/<file>.spec.ts`; полный прогон — в финальном таске.
- Направления зависимостей: `render` → только `common` + `layouts-blocks`; `builder/*` → common/ui/…; `persistence` импортирует `common` — можно. Новый валидатор живёт в `common` (используется 3 доменами).
- В `common/utils/README.md` есть таблица «файл → назначение» — дополнять при добавлении файлов.
- Комментарии/JSDoc — на русском (стиль репозитория); имена типов `I*`/`T*`; в тестах — `describe` на русском (см. существующие спеки).
- Коммит после каждого таска. Сообщения — в стиле истории репо (`fix(...)`, `feat(...)`), с трейлером `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- `docs/application-audit-2026-07-12.md` уже имеет незакоммиченные правки (пересмотр приоритетов) — не откатывать их; git-статус также содержит `D docs/architecture-audit-remediation-plan.md` — не трогать.

---

### Task 1: Канонизация S3 key policy (A-01, ядро)

**Files:**
- Modify: `src/runtime/modules/persistence/server/s3/s3KeyPolicy.ts`
- Test: `test/persistenceS3KeyPolicy.spec.ts` (расширить существующий)

**Interfaces:**
- Produces: `extractStorageKey(url: string, base: IStorageUrlBase): string | null` (сигнатура прежняя, семантика — канонический декодированный ключ); `isManagedStorageKey(key: string, managedPrefixes: readonly string[]): boolean` (прежняя сигнатура, теперь включает segment-safety); новый экспорт `isSafeStorageKey(key: string): boolean`.
- Consumers не меняются: `s3PublishAdapter.ts` (`extractManagedKey`, `uploadFile`, `isOwnedUrl`, `deleteFile`) продолжает работать без правок — хардening прозрачный.

- [ ] **Step 1: Дописать failing-тесты в `test/persistenceS3KeyPolicy.spec.ts`**

Добавить в конец файла (константы `BASE`/`MANAGED_PREFIXES` уже объявлены вверху спека):

```ts
/**
 * Композиция extract + managed-проверки — так адаптер строит extractManagedKey
 * (deleteFile/isOwnedUrl/media-proxy).
 */
function extractManagedKey(url: string): string | null {
    const key = extractStorageKey(url, BASE);
    return key !== null && isManagedStorageKey(key, MANAGED_PREFIXES) ? key : null;
}

describe('extractStorageKey: канонизация URL (аудит A-01)', () => {
    it('нормализует литеральные dot-сегменты до канонического ключа', () => {
        // WHATWG-парсер резолвит ../ ещё до namespace-проверки
        expect(
            extractStorageKey(
                'https://storage.example.com/my-bucket/bricks-media/../private.txt',
                BASE
            )
        ).toBe('private.txt');
        expect(
            extractStorageKey(
                'https://storage.example.com/my-bucket/bricks-media/./a.webp',
                BASE
            )
        ).toBe('bricks-media/a.webp');
    });

    it('декодирует ключ ровно один раз (percent-encoded slash)', () => {
        expect(
            extractStorageKey(
                'https://storage.example.com/my-bucket/bricks-media%2Fa.webp',
                BASE
            )
        ).toBe('bricks-media/a.webp');
        expect(
            extractStorageKey(
                'https://storage.example.com/my-bucket/bricks-media/a%20b.webp',
                BASE
            )
        ).toBe('bricks-media/a b.webp');
    });

    it('принимает endpoint с завершающим слэшем в конфиге', () => {
        expect(
            extractStorageKey('https://storage.example.com/my-bucket/bricks-media/a.webp', {
                endpoint: 'https://storage.example.com/',
                bucket: 'my-bucket',
            })
        ).toBe('bricks-media/a.webp');
    });

    it.each([
        ['userinfo в URL', 'https://admin@storage.example.com/my-bucket/bricks-media/a.webp'],
        ['нестандартный порт', 'https://storage.example.com:8443/my-bucket/bricks-media/a.webp'],
        ['downgrade протокола', 'http://storage.example.com/my-bucket/bricks-media/a.webp'],
        ['похожий origin', 'https://storage.example.com.evil.io/my-bucket/bricks-media/a.webp'],
        ['не-URL', 'not-a-url'],
    ])('возвращает null: %s', (_label, url) => {
        expect(extractStorageKey(url, BASE)).toBe(null);
    });
});

describe('managed-композиция: adversarial URL не выходит из namespace (аудит A-01)', () => {
    it.each([
        [
            'литеральный ../ (нормализуется в объект вне префикса)',
            'https://storage.example.com/my-bucket/bricks-media/../private.txt',
        ],
        [
            'percent-encoded %2e%2e',
            'https://storage.example.com/my-bucket/bricks-media/%2e%2e/private.txt',
        ],
        [
            'двойное кодирование %252e%252e',
            'https://storage.example.com/my-bucket/bricks-media/%252e%252e/private.txt',
        ],
        [
            'literal backslash (парсер трактует как /)',
            'https://storage.example.com/my-bucket/bricks-media\\..\\private.txt',
        ],
        [
            'percent-encoded backslash',
            'https://storage.example.com/my-bucket/bricks-media/%5C..%5Cprivate.txt',
        ],
        [
            'управляющий символ в ключе',
            'https://storage.example.com/my-bucket/bricks-media/%00a.webp',
        ],
        [
            'одиночный percent-encoded dot-сегмент',
            'https://storage.example.com/my-bucket/bricks-media/%2e/a.webp',
        ],
        [
            'пустой сегмент //',
            'https://storage.example.com/my-bucket/bricks-media//a.webp',
        ],
        [
            'похожий бакет',
            'https://storage.example.com/my-bucket-backup/bricks-media/a.webp',
        ],
        [
            'похожий префикс ключа',
            'https://storage.example.com/my-bucket/bricks-media-x/a.webp',
        ],
    ])('отклоняет: %s', (_label, url) => {
        expect(extractManagedKey(url)).toBe(null);
    });

    it('принимает канонический URL с query/fragment', () => {
        expect(
            extractManagedKey('https://storage.example.com/my-bucket/bricks-media/a.webp?v=1#x')
        ).toBe('bricks-media/a.webp');
    });
});

describe('isSafeStorageKey / isManagedStorageKey: segment safety', () => {
    it.each([
        ['dot-сегмент ..', 'bricks-media/../a.webp'],
        ['dot-сегмент .', 'bricks-media/./a.webp'],
        ['пустой сегмент', 'bricks-media//a.webp'],
        ['остаточный %', 'bricks-media/a%2e.webp'],
        ['backslash', 'bricks-media/a\\b.webp'],
        ['управляющий символ', 'bricks-media/a\u0000.webp'],
        ['пустой ключ', ''],
    ])('отклоняет ключ: %s', (_label, key) => {
        expect(isSafeStorageKey(key)).toBe(false);
        expect(isManagedStorageKey(key, MANAGED_PREFIXES)).toBe(false);
    });

    it('принимает обычный managed-ключ', () => {
        expect(isSafeStorageKey('bricks-media/a.webp')).toBe(true);
        expect(isManagedStorageKey('bricks-media/a.webp', MANAGED_PREFIXES)).toBe(true);
    });
});
```

Дополнить import в шапке спека: `isSafeStorageKey`.

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `npx vitest run test/persistenceS3KeyPolicy.spec.ts`
Expected: FAIL (`isSafeStorageKey` не экспортируется; adversarial-кейсы проходят сквозь старый `startsWith`).

- [ ] **Step 3: Переписать `s3KeyPolicy.ts`**

Полное новое содержимое файла:

```ts
/**
 * Политика object key S3-хранилища: извлечение ключа из публичного URL и
 * проверка принадлежности managed-namespace'у (префиксы модуля в бакете).
 *
 * Чистые функции без runtimeConfig — используются s3PublishAdapter и юнит-тестами.
 * Managed-namespace ограничивает операции адаптера (delete/proxy/регистрация)
 * собственными префиксами: в shared-бакете модуль не может затронуть
 * посторонние объекты даже по валидному URL бакета.
 *
 * Канонизация (аудит A-01): прежняя проверка была строковым `startsWith` по
 * сырому URL и пропускала `bricks-media/../x` — HTTP-клиент нормализовал такой
 * адрес в объект ВНЕ managed namespace (воспроизведено через media-proxy).
 * Теперь URL разбирается WHATWG-парсером (protocol/host/userinfo сверяются с
 * базой явно; литеральные `.`/`..`/backslash парсер нормализует сам), ключ
 * декодируется ровно один раз, после чего отклоняются dot-сегменты, пустые
 * сегменты, управляющие символы, backslash и остаточный `%` (неоднозначное
 * двойное кодирование). Ключи модуля генерируются сервером (randomUUID,
 * `page-<pagename>.webp`) и этим ограничениям всегда удовлетворяют.
 */

/**
 * Базовый адрес бакета для извлечения ключа.
 */
export interface IStorageUrlBase {
    endpoint: string;
    bucket: string;
}

/** Управляющие символы (C0 + DEL) и backslash — запрещены в object key. */
const UNSAFE_KEY_CHARS_PATTERN = /[\\\u0000-\u001F\u007F]/;

/**
 * Проверяет, что декодированный object key не содержит traversal/injection-
 * примитивов: dot-сегментов (`.`, `..`), пустых сегментов, управляющих
 * символов, backslash и `%` (после однократного декодирования остаточный `%`
 * означает неоднозначное повторное кодирование).
 *
 * @param key - Декодированный S3 object key.
 * @returns true, если ключ безопасен.
 */
export function isSafeStorageKey(key: string): boolean {
    if (!key || key.includes('%') || UNSAFE_KEY_CHARS_PATTERN.test(key)) {
        return false;
    }

    return key
        .split('/')
        .every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/**
 * Извлекает канонический S3 object key из публичного URL файла.
 * URL разбирается парсером: протокол/host/userinfo сверяются с базой,
 * query/fragment отбрасываются (cache-buster `?v=` не является частью ключа),
 * ключ декодируется один раз и проходит `isSafeStorageKey`.
 *
 * @param url - Полный URL файла.
 * @param base - Endpoint и bucket хранилища.
 * @returns Канонический key или null (чужой origin/бакет, небезопасный ключ).
 */
export function extractStorageKey(url: string, base: IStorageUrlBase): string | null {
    let parsed: URL;
    let baseUrl: URL;

    try {
        parsed = new URL(url);
        baseUrl = new URL(`${base.endpoint.replace(/\/+$/, '')}/${base.bucket}/`);
    } catch {
        return null;
    }

    const sameOrigin =
        parsed.protocol === baseUrl.protocol &&
        parsed.host === baseUrl.host &&
        parsed.username === '' &&
        parsed.password === '';

    if (!sameOrigin || !parsed.pathname.startsWith(baseUrl.pathname)) {
        return null;
    }

    let key: string;

    try {
        key = decodeURIComponent(parsed.pathname.slice(baseUrl.pathname.length));
    } catch {
        return null;
    }

    return isSafeStorageKey(key) ? key : null;
}

/**
 * Проверяет, что ключ безопасен и лежит внутри одного из managed-префиксов
 * модуля с непустым именем после префикса (сам префикс — не файл).
 *
 * @param key - S3 object key (декодированный).
 * @param managedPrefixes - Префиксы, которыми владеет модуль (с завершающим `/`).
 * @returns true, если ключ принадлежит managed-namespace.
 */
export function isManagedStorageKey(key: string, managedPrefixes: readonly string[]): boolean {
    if (!isSafeStorageKey(key)) {
        return false;
    }

    return managedPrefixes.some((prefix) => key.startsWith(prefix) && key.length > prefix.length);
}
```

Примечание: если oxlint ругнётся `no-control-regex` на `UNSAFE_KEY_CHARS_PATTERN` — проверить точное имя правила в выводе и поставить точечный `// oxlint-disable-next-line no-control-regex` с пояснением (управляющие символы здесь — суть проверки).

- [ ] **Step 4: Прогнать тесты и точечные проверки**

Run: `npx vitest run test/persistenceS3KeyPolicy.spec.ts` → PASS (старые кейсы включительно).
Run: `npx vue-tsc --noEmit 2>&1 | grep s3KeyPolicy` → пусто; `npx oxlint src/runtime/modules/persistence/server/s3/s3KeyPolicy.ts` → чисто.
Run: `npx vitest run test/persistenceMediaOrchestration.spec.ts test/persistenceS3ListFiles.spec.ts` → PASS (консюмеры не сломаны).

- [ ] **Step 5: Commit**

```bash
git add src/runtime/modules/persistence/server/s3/s3KeyPolicy.ts test/persistenceS3KeyPolicy.spec.ts
git commit -m "fix(s3): canonicalize storage URLs before managed-namespace checks (audit A-01)"
```

---

### Task 2: Удалить legacy `POST /api/bricks/media` (A-01, усиление)

Ручка принимает от клиента URL/metadata «уже загруженного» объекта и делает его доверенным для media-proxy. Внутренних потребителей нет (клиент использует только `upload`/`delete`/`patch`/`get`; импорт из бакета идёт сервер-сайд через `createMedia`). Аудит рекомендует удаление.

**Files:**
- Delete: `src/runtime/server/api/bricks/media/index.post.ts`
- Modify: `src/api-handlers.ts` (убрать запись `{ route: '/api/bricks/media', method: 'post', ... }`)
- Modify: `src/runtime/modules/persistence/server/utils/mediaPayloadValidation.ts` (убрать `validateCreateMediaPayload` и ставшие неиспользуемыми константы/импорты)
- Modify: `test/persistencePayloadValidation.spec.ts` (убрать describe-блок `validateCreateMediaPayload` и его хелперы; проверить, что хелперы не используются другими describe)
- Modify: `CLAUDE.md` (строка «Регистрация URL бакета вне префиксов через `POST /api/bricks/media` — 400» в разделе «Медиа-хранилище»)

**Interfaces:**
- Produces: `mediaPayloadValidation.ts` экспортирует после правки только `validateUpdateMediaPayload` и `validateMediaCategory` (обе используются: PATCH-ручка и upload).
- `ICreateMediaPayload` (тип) остаётся — им пользуются `createMedia` адаптера, upload-оркестрация и `mediaImport.ts`.

- [ ] **Step 1: Проверить отсутствие внешних ссылок**

Run: `grep -rn "bricks/media'" src playground/app* README.md docs --include='*.ts' --include='*.vue' --include='*.md' | grep -i post`
Expected: только `api-handlers.ts`, сам handler и, возможно, упоминания в docs/CLAUDE.md (их правим здесь же). Если найдётся живой потребитель — остановиться и показать пользователю.

- [ ] **Step 2: Удалить ручку и регистрацию**

```bash
git rm src/runtime/server/api/bricks/media/index.post.ts
```

В `src/api-handlers.ts` удалить блок:

```ts
    {
        route: '/api/bricks/media',
        method: 'post',
        file: 'server/api/bricks/media/index.post',
    },
```

- [ ] **Step 3: Вычистить `validateCreateMediaPayload`**

В `mediaPayloadValidation.ts` удалить функцию `validateCreateMediaPayload` и `validateMediaSize`, константы `MAX_SVG_CONTENT_CHARS`, `MIME_TYPE_MAX_LENGTH`, `UPLOADED_AT_MAX_LENGTH`, `MIME_TYPE_PATTERN`, `CREATE_MEDIA_KEYS`; из импортов убрать `HTTP_URL_PATTERN`, `MAX_URL_LENGTH`, `optionalNullableString` и тип `ICreateMediaPayload` (если остальным не нужны — сверить по факту). Обновить шапку JSDoc файла (упоминание POST /api/bricks/media).

В `test/persistencePayloadValidation.spec.ts` удалить describe `validateCreateMediaPayload: метаданные медиа` и хелперы `makeCreateMediaBody`/обёртку на ~355 строке (перед удалением убедиться grep'ом, что их не использует describe `validateUpdateMediaPayload`).

- [ ] **Step 4: Обновить документацию**

В `CLAUDE.md`, раздел «Медиа-хранилище: managed namespace и атомарные операции», заменить фразу «Регистрация URL бакета вне префиксов через `POST /api/bricks/media` — 400» на: «Legacy-ручка регистрации `POST /api/bricks/media` удалена (2026-07-12, аудит A-01): записи `bricks_media` создаёт только сервер (upload flow, импорт из бакета)». Прогнать `grep -rn "api/bricks/media" README.md docs/*.md` и поправить упоминания POST-регистрации, если есть.

- [ ] **Step 5: Проверки**

Run: `npx vitest run test/persistencePayloadValidation.spec.ts` → PASS.
Run: `npx vue-tsc --noEmit 2>&1 | grep -E "mediaPayloadValidation|api-handlers"` → пусто.
Run: `npx oxlint src/api-handlers.ts src/runtime/modules/persistence/server/utils/mediaPayloadValidation.ts` → чисто.
Run: `npm run lint:check` → PASS (knip не должен найти неиспользуемых экспортов после чистки).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(media): drop legacy POST /api/bricks/media registration endpoint (audit A-01)"
```

---

### Task 3: Чистый валидатор графа компонентов схемы (A-02, ядро)

**Files:**
- Create: `src/runtime/modules/common/utils/bricks/schemaContract.ts`
- Modify: `src/runtime/modules/common/utils/README.md` (строка в таблицу)
- Test: `test/commonSchemaContract.spec.ts`

**Interfaces:**
- Produces:
  - `validateSchemaComponentGraph(components: readonly unknown[]): string[]` — список человекочитаемых ошибок (пустой = валидно), максимум 20;
  - `isRenderableSchemaComponent(value: unknown): value is IBricksComponent` — минимальный shape-guard для рендера;
  - `MAX_COMPONENT_TREE_DEPTH = 32` — общий лимит глубины дерева (используется и рендером).
- Контракт (по аудиту): элемент — plain object; `id` — непустая строка ≤100, уникальная; `componentName` ≤200 и `brickPath` ≤500 — непустые строки (layout-блоки билдера всегда имеют `brickPath: 'layout/<name>'`); `type` — если присутствует, `'layout' | 'component'`; `props` — если присутствует, plain object; `parent` — если присутствует и не null, существующий id ≠ своего; `children` — массив существующих id; `slots` — массив `{ name: string, children: string[] }`; каждый id упоминается как child не более одного раза (children + slots суммарно); двусторонняя согласованность (`child.parent` === контейнер, который его перечисляет, и наоборот — слотовые дети живут в `slots[].children`, но их `parent` указывает на компонент со слотами); ацикличность по parent-цепочкам; глубина ≤ `MAX_COMPONENT_TREE_DEPTH`.

- [ ] **Step 1: Написать failing-тесты `test/commonSchemaContract.spec.ts`**

```ts
// #region Imports
// Types
import type { IBricksComponent } from '../src/runtime/modules/common/types/brick';

// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    MAX_COMPONENT_TREE_DEPTH,
    isRenderableSchemaComponent,
    validateSchemaComponentGraph,
} from '../src/runtime/modules/common/utils/bricks/schemaContract';
// #endregion

/**
 * Минимальный валидный компонент схемы.
 */
function makeComponent(id: string, overrides: Partial<IBricksComponent> = {}): IBricksComponent {
    return {
        id,
        type: 'component',
        componentName: 'Text',
        brickPath: 'components/text',
        zIndex: 0,
        props: {},
        ...overrides,
    };
}

/**
 * Layout-компонент с детьми.
 */
function makeLayout(id: string, children: string[], overrides: Partial<IBricksComponent> = {}) {
    return makeComponent(id, {
        type: 'layout',
        componentName: 'Grid',
        brickPath: 'layout/grid',
        children,
        ...overrides,
    });
}

describe('validateSchemaComponentGraph: валидные схемы', () => {
    it('пустой список компонентов валиден', () => {
        expect(validateSchemaComponentGraph([])).toEqual([]);
    });

    it('дерево с двусторонними связями валидно', () => {
        const grid = makeLayout('grid-1', ['text-1']);
        const text = makeComponent('text-1', { parent: 'grid-1' });
        expect(validateSchemaComponentGraph([grid, text])).toEqual([]);
    });

    it('слотовые дети валидны (children живут в slots[].children)', () => {
        const host = makeComponent('host-1', {
            slots: [{ name: 'main', label: 'Main', allowMultiple: true, children: ['text-1'] }],
        });
        const text = makeComponent('text-1', { parent: 'host-1', slotName: 'main' });
        expect(validateSchemaComponentGraph([host, text])).toEqual([]);
    });

    it('parent: null трактуется как корень (legacy-толерантность)', () => {
        const component = makeComponent('a', { parent: null as unknown as string });
        expect(validateSchemaComponentGraph([component])).toEqual([]);
    });
});

describe('validateSchemaComponentGraph: форма компонента (аудит A-02)', () => {
    it.each([
        ['null-элемент', [null]],
        ['число', [42]],
        ['строка', ['x']],
        ['массив', [[]]],
    ])('отклоняет не-объект: %s', (_label, components) => {
        const errors = validateSchemaComponentGraph(components as unknown[]);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toContain('components[0]');
    });

    it('отклоняет пустой объект (нет id)', () => {
        expect(validateSchemaComponentGraph([{}])[0]).toContain('id');
    });

    it('отклоняет отсутствие componentName и brickPath', () => {
        const errors = validateSchemaComponentGraph([{ id: 'a' }]);
        expect(errors.join(' ')).toContain('componentName');
        expect(errors.join(' ')).toContain('brickPath');
    });

    it('отклоняет неизвестный type', () => {
        const errors = validateSchemaComponentGraph([makeComponent('a', { type: 'weird' as never })]);
        expect(errors.join(' ')).toContain('type');
    });

    it('отклоняет props не-объект', () => {
        const errors = validateSchemaComponentGraph([
            makeComponent('a', { props: 'nope' as never }),
        ]);
        expect(errors.join(' ')).toContain('props');
    });

    it('отклоняет дубликат id', () => {
        const errors = validateSchemaComponentGraph([makeComponent('a'), makeComponent('a')]);
        expect(errors.join(' ')).toContain('Duplicate');
    });
});

describe('validateSchemaComponentGraph: связи и граф (аудит A-02)', () => {
    it('отклоняет dangling parent', () => {
        const errors = validateSchemaComponentGraph([makeComponent('a', { parent: 'ghost' })]);
        expect(errors.join(' ')).toContain('ghost');
    });

    it('отклоняет dangling child', () => {
        const errors = validateSchemaComponentGraph([makeLayout('grid-1', ['ghost'])]);
        expect(errors.join(' ')).toContain('ghost');
    });

    it('отклоняет self-loop (сам себе parent/child)', () => {
        expect(
            validateSchemaComponentGraph([makeLayout('a', ['a'], { parent: 'a' })]).length
        ).toBeGreaterThan(0);
    });

    it('отклоняет ребёнка, перечисленного двумя контейнерами', () => {
        const errors = validateSchemaComponentGraph([
            makeLayout('g1', ['text-1']),
            makeLayout('g2', ['text-1']),
            makeComponent('text-1', { parent: 'g1' }),
        ]);
        expect(errors.length).toBeGreaterThan(0);
    });

    it('отклоняет рассинхрон parent/children (child не перечислен родителем)', () => {
        const errors = validateSchemaComponentGraph([
            makeLayout('g1', []),
            makeComponent('text-1', { parent: 'g1' }),
        ]);
        expect(errors.length).toBeGreaterThan(0);
    });

    it('отклоняет рассинхрон children/parent (перечислен, но parent пуст)', () => {
        const errors = validateSchemaComponentGraph([
            makeLayout('g1', ['text-1']),
            makeComponent('text-1'),
        ]);
        expect(errors.length).toBeGreaterThan(0);
    });

    it('отклоняет двухузловой цикл', () => {
        const errors = validateSchemaComponentGraph([
            makeLayout('a', ['b'], { parent: 'b' }),
            makeLayout('b', ['a'], { parent: 'a' }),
        ]);
        expect(errors.join(' ')).toContain('cycle');
    });

    it('отклоняет превышение глубины дерева', () => {
        const chain: IBricksComponent[] = [];
        const depth = MAX_COMPONENT_TREE_DEPTH + 2;
        for (let i = 0; i < depth; i += 1) {
            chain.push(
                makeLayout(`n${i}`, i < depth - 1 ? [`n${i + 1}`] : [], {
                    parent: i > 0 ? `n${i - 1}` : undefined,
                })
            );
        }
        expect(validateSchemaComponentGraph(chain).join(' ')).toContain('depth');
    });

    it('ограничивает список ошибок (не взрывается на мусорном массиве)', () => {
        const garbage = Array.from({ length: 500 }, () => null);
        expect(validateSchemaComponentGraph(garbage).length).toBeLessThanOrEqual(20);
    });
});

describe('isRenderableSchemaComponent: guard рендера', () => {
    it('принимает минимальный валидный компонент', () => {
        expect(isRenderableSchemaComponent(makeComponent('a'))).toBe(true);
    });

    it.each([
        ['null', null],
        ['число', 42],
        ['без id', { componentName: 'Text' }],
        ['без componentName', { id: 'a' }],
    ])('отклоняет: %s', (_label, value) => {
        expect(isRenderableSchemaComponent(value)).toBe(false);
    });
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `npx vitest run test/commonSchemaContract.spec.ts`
Expected: FAIL — модуль не существует.

- [ ] **Step 3: Реализовать `schemaContract.ts`**

```ts
/**
 * Структурный контракт графа компонентов схемы страницы (аудит A-02).
 *
 * До этого сервер принимал `components: [null]`, `[42]`, `[{}]` и циклические
 * связи — public render падал runtime exception'ом либо уходил в
 * неограниченную рекурсию. Изоморфный чистый модуль (без h3/Nuxt): одна и та
 * же проверка используется серверной валидацией payload'ов (create/update,
 * restore) и импортом JSON в билдере; guard `isRenderableSchemaComponent` и
 * лимит глубины — защитными фильтрами рендера для legacy-строк БД.
 *
 * Лимиты сложности JSON-графа (глубина/узлы/размер) — отдельный слой
 * schemaPayloadValidation.ts (persistence); здесь — семантика компонентов.
 */
import type { IBricksComponent } from '../../types/brick';

// #region Constants
/** Максимальная глубина дерева компонентов (children-вложенность). */
export const MAX_COMPONENT_TREE_DEPTH = 32;

const COMPONENT_ID_MAX_LENGTH = 100;
const COMPONENT_NAME_MAX_LENGTH = 200;
const BRICK_PATH_MAX_LENGTH = 500;
/** Верхняя граница накапливаемых ошибок — диагностики достаточно, шум не нужен. */
const MAX_CONTRACT_ERRORS = 20;

const COMPONENT_TYPES = new Set(['layout', 'component']);
// #endregion

// #region Helpers
/**
 * Проверяет, что значение — plain object.
 *
 * @param value - Проверяемое значение.
 * @returns true для plain object.
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * Проверяет непустую строку с верхней границей длины.
 *
 * @param value - Проверяемое значение.
 * @param max - Максимальная длина.
 * @returns true для непустой строки в границах.
 */
function isNonEmptyString(value: unknown, max: number): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= max;
}

/**
 * Слот с детьми — форма IBricksComponentSlot без деталей definition.
 */
interface ISchemaSlotShape {
    name: string;
    children: string[];
}

/**
 * Проверяет форму слота: объект с именем и массивом id детей.
 *
 * @param value - Проверяемое значение.
 * @returns true для валидной формы слота.
 */
function isValidSlotShape(value: unknown): value is ISchemaSlotShape {
    return (
        isPlainRecord(value) &&
        isNonEmptyString(value.name, COMPONENT_NAME_MAX_LENGTH) &&
        Array.isArray(value.children) &&
        value.children.every((child) => isNonEmptyString(child, COMPONENT_ID_MAX_LENGTH))
    );
}

/**
 * Собирает все id детей компонента: прямые `children` + `slots[].children`.
 *
 * @param component - Компонент с валидированной формой.
 * @returns Список id детей.
 */
function collectChildIds(component: Record<string, unknown>): string[] {
    const direct = (component.children as string[] | undefined) ?? [];
    const slots = (component.slots as ISchemaSlotShape[] | undefined) ?? [];

    return [...direct, ...slots.flatMap((slot) => slot.children)];
}
// #endregion

// #region Public API
/**
 * Минимальный shape-guard компонента для рендера: plain object с непустыми
 * строковыми `id` и `componentName` (рендер обращается к ним без проверок).
 *
 * @param value - Элемент массива schema.components.
 * @returns true, если компонент безопасно рендерить.
 */
export function isRenderableSchemaComponent(value: unknown): value is IBricksComponent {
    return (
        isPlainRecord(value) &&
        isNonEmptyString(value.id, COMPONENT_ID_MAX_LENGTH) &&
        isNonEmptyString(value.componentName, COMPONENT_NAME_MAX_LENGTH)
    );
}

/**
 * Валидирует граф компонентов схемы: форму каждого компонента, уникальность
 * id, существование parent/children/slot-ссылок, двустороннюю согласованность
 * связей, ацикличность и глубину дерева. Ошибки формы возвращаются сразу
 * (проверки графа требуют валидной формы); список ограничен
 * MAX_CONTRACT_ERRORS.
 *
 * @param components - Сырое значение schema.components.
 * @returns Список ошибок (пустой = схема валидна).
 */
export function validateSchemaComponentGraph(components: readonly unknown[]): string[] {
    const errors: string[] = [];

    /**
     * Добавляет ошибку с учётом верхней границы.
     */
    function push(message: string): void {
        if (errors.length < MAX_CONTRACT_ERRORS) {
            errors.push(message);
        }
    }

    // Фаза 1: форма компонентов + уникальность id
    const byId = new Map<string, Record<string, unknown>>();

    components.forEach((item, index) => {
        if (!isPlainRecord(item)) {
            push(`components[${index}] must be an object`);
            return;
        }

        if (!isNonEmptyString(item.id, COMPONENT_ID_MAX_LENGTH)) {
            push(`components[${index}].id must be a non-empty string`);
            return;
        }

        const id = item.id;

        if (byId.has(id)) {
            push(`Duplicate component id "${id}"`);
            return;
        }
        byId.set(id, item);

        if (!isNonEmptyString(item.componentName, COMPONENT_NAME_MAX_LENGTH)) {
            push(`Component "${id}": componentName must be a non-empty string`);
        }

        if (!isNonEmptyString(item.brickPath, BRICK_PATH_MAX_LENGTH)) {
            push(`Component "${id}": brickPath must be a non-empty string`);
        }

        if (item.type !== undefined && !COMPONENT_TYPES.has(item.type as string)) {
            push(`Component "${id}": type must be "layout" or "component"`);
        }

        if (item.props !== undefined && !isPlainRecord(item.props)) {
            push(`Component "${id}": props must be an object`);
        }

        if (
            item.parent !== undefined &&
            item.parent !== null &&
            !isNonEmptyString(item.parent, COMPONENT_ID_MAX_LENGTH)
        ) {
            push(`Component "${id}": parent must be a component id`);
        }

        if (
            item.children !== undefined &&
            (!Array.isArray(item.children) ||
                !item.children.every((child) => isNonEmptyString(child, COMPONENT_ID_MAX_LENGTH)))
        ) {
            push(`Component "${id}": children must be an array of component ids`);
        }

        if (
            item.slots !== undefined &&
            (!Array.isArray(item.slots) || !item.slots.every(isValidSlotShape))
        ) {
            push(`Component "${id}": slots must be an array of named slots with children ids`);
        }
    });

    if (errors.length > 0) {
        return errors;
    }

    // Фаза 2: ссылки и двусторонняя согласованность
    const containerByChildId = new Map<string, string>();

    for (const [id, component] of byId) {
        for (const childId of collectChildIds(component)) {
            if (childId === id) {
                push(`Component "${id}" references itself as a child`);
            } else if (!byId.has(childId)) {
                push(`Component "${id}" references missing child "${childId}"`);
            } else if (containerByChildId.has(childId)) {
                push(`Component "${childId}" is referenced as a child more than once`);
            } else {
                containerByChildId.set(childId, id);
            }
        }

        const parent = component.parent as string | null | undefined;

        if (parent !== undefined && parent !== null) {
            if (parent === id) {
                push(`Component "${id}" is its own parent`);
            } else if (!byId.has(parent)) {
                push(`Component "${id}" references missing parent "${parent}"`);
            }
        }
    }

    for (const [id, component] of byId) {
        const parent = (component.parent as string | null | undefined) ?? null;
        const container = containerByChildId.get(id) ?? null;

        if (parent !== container && (parent === null || byId.has(parent))) {
            push(
                `Component "${id}": parent link "${parent ?? 'none'}" does not match ` +
                    `referencing container "${container ?? 'none'}"`
            );
        }
    }

    if (errors.length > 0) {
        return errors;
    }

    // Фаза 3: ацикличность parent-цепочек и глубина дерева.
    // После фазы 2 parent-указатели зеркальны children-ссылкам (in-degree <= 1),
    // поэтому цикл по children эквивалентен циклу по parent-цепочке.
    const depthById = new Map<string, number>();

    for (const startId of byId.keys()) {
        if (depthById.has(startId)) {
            continue;
        }

        const chain: string[] = [];
        const chainSet = new Set<string>();
        let currentId: string | null = startId;

        while (currentId !== null && !depthById.has(currentId)) {
            if (chainSet.has(currentId)) {
                push(`Component graph contains a cycle involving "${currentId}"`);
                return errors;
            }

            chain.push(currentId);
            chainSet.add(currentId);
            currentId = (byId.get(currentId)?.parent as string | null | undefined) ?? null;
        }

        let depth = currentId === null ? -1 : (depthById.get(currentId) as number);

        for (let i = chain.length - 1; i >= 0; i -= 1) {
            depth += 1;
            depthById.set(chain[i], depth);
        }
    }

    for (const [id, depth] of depthById) {
        if (depth >= MAX_COMPONENT_TREE_DEPTH) {
            push(`Component "${id}" exceeds ${MAX_COMPONENT_TREE_DEPTH} depth limit`);
            break;
        }
    }

    return errors;
}
// #endregion
```

- [ ] **Step 4: Дописать строку в `src/runtime/modules/common/utils/README.md`**

В таблицу (рядом с `bricks/publishedPage.ts`):

```
| `bricks/schemaContract.ts` | `validateSchemaComponentGraph` — структурный контракт графа компонентов схемы (аудит A-02: форма, уникальность id, двусторонние связи, ацикличность, глубина); `isRenderableSchemaComponent`, `MAX_COMPONENT_TREE_DEPTH` — защитные примитивы рендера. Используется server-валидацией payload/restore, импортом JSON билдера и рендером |
```

(Точный формат колонок взять из существующей таблицы файла.)

- [ ] **Step 5: Прогнать тесты и проверки**

Run: `npx vitest run test/commonSchemaContract.spec.ts` → PASS.
Run: `npx vue-tsc --noEmit 2>&1 | grep schemaContract` → пусто; `npx oxlint src/runtime/modules/common/utils/bricks/schemaContract.ts` → чисто.

- [ ] **Step 6: Commit**

```bash
git add src/runtime/modules/common/utils/bricks/schemaContract.ts src/runtime/modules/common/utils/README.md test/commonSchemaContract.spec.ts
git commit -m "feat(schema): component graph contract validator (audit A-02)"
```

---

### Task 4: Серверное применение контракта — create/update/restore (A-02)

**Files:**
- Modify: `src/runtime/modules/persistence/server/utils/payloadValidation.ts` (функция `validateSchema`)
- Modify: `src/runtime/modules/persistence/server/utils/schemaPayloadValidation.ts` (только шапка-комментарий: контракт больше не «вне скоупа»)
- Modify: `src/runtime/modules/persistence/server/utils/pageVersionRestore.ts`
- Test: `test/persistencePayloadValidation.spec.ts`, `test/persistencePageVersionRestore.spec.ts` (расширить)

**Interfaces:**
- Consumes: `validateSchemaComponentGraph` из Task 3.
- Produces: `validateSchema` (private) дополнительно бросает 400 `Invalid schema: <до 3 ошибок через '; '>`; `restorePageVersion` бросает 400 `Stored version schema is invalid: ...` для legacy-версий с невалидной схемой (отклонение с диагностикой — по критерию приёмки аудита).

- [ ] **Step 1: Failing-тесты**

В `test/persistencePayloadValidation.spec.ts` (использовать хелперы/стиль файла; ниже — суть; валидный компонент брать как в Task 3 `makeComponent`):

```ts
describe('validateSchema: контракт графа компонентов (аудит A-02)', () => {
    it.each([
        ['null-компонент', [null]],
        ['число', [42]],
        ['пустой объект', [{}]],
    ])('отклоняет 400: %s', (_label, components) => {
        expect(() =>
            validateCreatePagePayload({ pagename: 'test-page', schema: { components } })
        ).toThrowError(/Invalid schema/);
    });

    it('отклоняет циклический граф', () => {
        const components = [
            { id: 'a', componentName: 'Grid', brickPath: 'layout/grid', type: 'layout', children: ['b'], parent: 'b' },
            { id: 'b', componentName: 'Grid', brickPath: 'layout/grid', type: 'layout', children: ['a'], parent: 'a' },
        ];
        expect(() =>
            validateCreatePagePayload({ pagename: 'test-page', schema: { components } })
        ).toThrowError(/cycle/);
    });

    it('принимает валидное дерево', () => {
        const components = [
            { id: 'g', componentName: 'Grid', brickPath: 'layout/grid', type: 'layout', children: ['t'] },
            { id: 't', componentName: 'Text', brickPath: 'components/text', type: 'component', parent: 'g' },
        ];
        expect(() =>
            validateCreatePagePayload({ pagename: 'test-page', schema: { components } })
        ).not.toThrow();
    });
});
```

Проверить, что statusCode 400 ассертится так же, как в существующих кейсах файла (там наверняка есть паттерн — переиспользовать его вместо `toThrowError`, если он строже).

В `test/persistencePageVersionRestore.spec.ts` — кейс: версия с невалидной схемой (например, `{ components: [null] }`) → `restorePageVersion` бросает ошибку со `statusCode: 400`, `storage.updatePage` не вызывался. **Внимание:** сначала посмотреть фикстуры существующих тестов restore — если их `version.schema` не проходит новый контракт (нет `brickPath` и т.п.), привести фикстуры к валидным компонентам, это ожидаемая правка.

- [ ] **Step 2: Прогнать — FAIL**

Run: `npx vitest run test/persistencePayloadValidation.spec.ts test/persistencePageVersionRestore.spec.ts`
Expected: новые кейсы падают (контракт не подключён).

- [ ] **Step 3: Подключить контракт**

`payloadValidation.ts` — импорт и вызов в `validateSchema` после `assertSchemaComplexity` (лимиты сложности — дешёвый барьер до обхода графа):

```ts
import { validateSchemaComponentGraph } from '../../../common/utils/bricks/schemaContract';
```

```ts
    assertSchemaComplexity(value);

    const contractErrors = validateSchemaComponentGraph(components);

    if (contractErrors.length > 0) {
        invalid(`Invalid schema: ${contractErrors.slice(0, 3).join('; ')}`);
    }

    return value as IBricksSchema;
```

Обновить JSDoc `validateSchema` (контракт формы/графа больше не «вне скоупа») и последний абзац шапки `schemaPayloadValidation.ts` (сослаться на `common/utils/bricks/schemaContract.ts`).

`pageVersionRestore.ts` — после `if (!version) {...}`:

```ts
import { validateSchemaComponentGraph } from '../../../common/utils/bricks/schemaContract';
```

```ts
    const contractErrors = Array.isArray(version.schema?.components)
        ? validateSchemaComponentGraph(version.schema.components)
        : ['Field "schema.components" must be an array'];

    if (contractErrors.length > 0) {
        throw createError({
            statusCode: 400,
            statusMessage: `Stored version schema is invalid: ${contractErrors
                .slice(0, 3)
                .join('; ')}`,
        });
    }
```

Дополнить JSDoc `restorePageVersion` (`@throws` 400 для legacy-версии с невалидной схемой).

- [ ] **Step 4: Прогнать тесты и проверки**

Run: `npx vitest run test/persistencePayloadValidation.spec.ts test/persistencePageVersionRestore.spec.ts test/publishStoreCreatePage.spec.ts test/publishStoreUpdatePage.spec.ts` → PASS.
Run: `npx vue-tsc --noEmit 2>&1 | grep -E "payloadValidation|pageVersionRestore"` → пусто; oxlint по обоим файлам → чисто.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/modules/persistence/server/utils/payloadValidation.ts src/runtime/modules/persistence/server/utils/schemaPayloadValidation.ts src/runtime/modules/persistence/server/utils/pageVersionRestore.ts test/persistencePayloadValidation.spec.ts test/persistencePageVersionRestore.spec.ts
git commit -m "feat(schema): enforce component contract on create/update/restore (audit A-02)"
```

---

### Task 5: Валидация импорта JSON в билдере (A-02)

**Files:**
- Modify: `src/runtime/modules/builder/shell/sidebar/composables/useSchemaFileTransfer.ts`
- Modify: `src/runtime/locales/ru.json`, `src/runtime/locales/en.json` (ключ `bricks.schema.importErrorStructure`)

**Interfaces:**
- Consumes: `validateSchemaComponentGraph` из Task 3 (импорт из `../../../../common/utils/bricks/schemaContract` — сверить глубину относительного пути).
- Produces: при невалидной структуре импорт блокируется, `importError` = локализованное сообщение с первой ошибкой контракта.

- [ ] **Step 1: Добавить ключи локалей**

В `ru.json` внутри неймспейса `schema` рядом с `importErrorInvalid`:

```json
"importErrorStructure": "Файл схемы не прошёл проверку структуры: {detail}"
```

В `en.json`:

```json
"importErrorStructure": "Schema file failed structure validation: {detail}"
```

(Без HTML и literal-`{}` вне именованного плейсхолдера — ограничение message compiler.)

- [ ] **Step 2: Подключить проверку в `handleFileSelect`**

Импорт:

```ts
import { validateSchemaComponentGraph } from '../../../../common/utils/bricks/schemaContract';
```

Заменить блок разбора в `reader.onload`:

```ts
            try {
                const parsed = JSON.parse(reader.result as string) as IBricksSchema;

                if (!parsed || !Array.isArray(parsed.components)) {
                    importError.value = t('bricks.schema.importErrorInvalid');
                    return;
                }

                const contractErrors = validateSchemaComponentGraph(parsed.components);

                if (contractErrors.length > 0) {
                    importError.value = t('bricks.schema.importErrorStructure', {
                        detail: contractErrors[0],
                    });
                    return;
                }

                options.onImport(parsed);
                importError.value = null;
            } catch {
                importError.value = t('bricks.schema.importErrorParse');
            }
```

**Внимание:** ранние `return` внутри `try` не должны пропустить `input.value = ''` — он стоит после `try/catch` в том же callback; убедиться, что структура сохранена (сейчас `input.value = ''` выполняется всегда — не сломать).

- [ ] **Step 3: Проверки**

Run: `npx vue-tsc --noEmit 2>&1 | grep useSchemaFileTransfer` → пусто; `npx oxlint src/runtime/modules/builder/shell/sidebar/composables/useSchemaFileTransfer.ts` → чисто.
Run: `npx vitest run test/commonSchemaContract.spec.ts` → PASS (ядро логики покрыто в Task 3; здесь — только проводка).
Проверить JSON-валидность локалей: `node -e "JSON.parse(require('fs').readFileSync('src/runtime/locales/ru.json','utf8')); JSON.parse(require('fs').readFileSync('src/runtime/locales/en.json','utf8')); console.log('ok')"`.

- [ ] **Step 4: Commit**

```bash
git add src/runtime/modules/builder/shell/sidebar/composables/useSchemaFileTransfer.ts src/runtime/locales/ru.json src/runtime/locales/en.json
git commit -m "feat(builder): validate imported schema JSON against component contract (audit A-02)"
```

---

### Task 6: Защита рендера от legacy-данных (A-02)

Серверная валидация закрывает новые записи; в БД могут остаться старые повреждённые схемы. Рендер не должен падать/зависать на них (критерий приёмки: «adversarial render-тест не падает и не зависает»).

**Files:**
- Modify: `src/runtime/modules/render/pages/[pagename].vue` (фильтр `allComponents`, prefetch поверх него)
- Modify: `src/runtime/modules/render/composables/useRendererLayouts.ts` (cycle/depth guard)
- Test: `test/renderLayoutsCycleGuard.spec.ts` (новый)

**Interfaces:**
- Consumes: `isRenderableSchemaComponent`, `MAX_COMPONENT_TREE_DEPTH` из Task 3.
- Produces: `renderLayoutComponent` возвращает `null` при повторном входе по id в текущей синхронной ветке рендера или превышении глубины (рендер детей у контейнеров eager — `childComponents.map(renderChild)` внутри `renderPublished`, поэтому Set по синхронной цепочке корректно отслеживает предков).

- [ ] **Step 1: Failing-тест `test/renderLayoutsCycleGuard.spec.ts`**

```ts
// #region Imports
// Types
import type { VNode } from 'vue';
import type { IBricksComponent } from '../src/runtime/modules/common/types/brick';

// Vue
import { computed, h } from 'vue';

// Vitest
import { describe, expect, it } from 'vitest';

// Composables
import { useRendererLayouts } from '../src/runtime/modules/render/composables/useRendererLayouts';
import { MAX_COMPONENT_TREE_DEPTH } from '../src/runtime/modules/common/utils/bricks/schemaContract';
// #endregion

/**
 * Grid-компонент схемы (registry-имя 'Grid', renderPublished — eager h('div')).
 */
function makeGrid(id: string, children: string[], parent?: string): IBricksComponent {
    return {
        id,
        type: 'layout',
        componentName: 'Grid',
        brickPath: 'layout/grid',
        zIndex: 0,
        props: {},
        children,
        ...(parent ? { parent } : {}),
    };
}

/**
 * Собирает композабл с рекурсивным renderChild — как TheRenderer.
 */
function createHarness(components: IBricksComponent[]) {
    const calls = { renderChild: 0 };
    let renderLayout: (component: IBricksComponent) => VNode | null = () => null;

    const api = useRendererLayouts({
        allComponents: computed(() => components),
        styles: {},
        renderChild: (child: IBricksComponent) => {
            calls.renderChild += 1;
            return renderLayout(child) ?? h('div');
        },
    });

    renderLayout = api.renderLayoutComponent;

    return { api, calls };
}

describe('useRendererLayouts: защита от циклов и глубины (аудит A-02)', () => {
    it('двухузловой цикл завершается, а не рекурсирует бесконечно', () => {
        const a = makeGrid('a', ['b'], 'b');
        const b = makeGrid('b', ['a'], 'a');
        const { api, calls } = createHarness([a, b]);

        const vnode = api.renderLayoutComponent(a);

        expect(vnode).not.toBe(null);
        expect(calls.renderChild).toBeLessThanOrEqual(4);
    });

    it('цепочка глубже лимита обрезается без исключения', () => {
        const depth = MAX_COMPONENT_TREE_DEPTH + 8;
        const chain: IBricksComponent[] = [];
        for (let i = 0; i < depth; i += 1) {
            chain.push(
                makeGrid(`n${i}`, i < depth - 1 ? [`n${i + 1}`] : [], i > 0 ? `n${i - 1}` : undefined)
            );
        }
        const { api, calls } = createHarness(chain);

        expect(() => api.renderLayoutComponent(chain[0])).not.toThrow();
        expect(calls.renderChild).toBeLessThanOrEqual(MAX_COMPONENT_TREE_DEPTH);
    });

    it('обычная вложенность рендерится (guard не ломает валидные деревья)', () => {
        const parent = makeGrid('p', ['c']);
        const child = makeGrid('c', [], 'p');
        const { api, calls } = createHarness([parent, child]);

        expect(api.renderLayoutComponent(parent)).not.toBe(null);
        expect(calls.renderChild).toBe(1);
    });
});
```

Примечание: тип `styles` в `IRendererLayoutsOptions` — сверить (`src/runtime/modules/render/types/render.d.ts`) и при необходимости привести `{}` к нужному типу каст-ом `as` из реального интерфейса (без `any`).

- [ ] **Step 2: Прогнать — FAIL**

Run: `npx vitest run test/renderLayoutsCycleGuard.spec.ts`
Expected: первый кейс падает stack overflow / таймаутом (бесконечная рекурсия).

- [ ] **Step 3: Guard в `useRendererLayouts.ts`**

Импорт: `import { MAX_COMPONENT_TREE_DEPTH } from '../../common/utils/bricks/schemaContract';`

Внутри `useRendererLayouts` добавить перед `getChildComponents`:

```ts
    // #region Data
    /**
     * Id layout-компонентов текущей синхронной ветки рендера. Контейнеры
     * рендерят детей eager'ом внутри renderPublished, поэтому Set корректно
     * отражает цепочку предков: повторный вход по id (цикл в повреждённой
     * legacy-схеме) или превышение глубины -> null вместо бесконечной рекурсии.
     */
    const renderChain = new Set<string>();
    // #endregion
```

`renderLayoutComponent` — обернуть вызов `renderPublished`:

```ts
        const definition = getBlockDefinition(component.componentName);

        if (!definition?.renderPublished) {
            return null;
        }

        if (renderChain.has(component.id) || renderChain.size >= MAX_COMPONENT_TREE_DEPTH) {
            return null;
        }

        renderChain.add(component.id);

        try {
            return definition.renderPublished({
                component,
                definition,
                extraClasses,
                extraAttrs,
                styles,
                renderChild,
                getChildComponents,
            });
        } finally {
            renderChain.delete(component.id);
        }
```

- [ ] **Step 4: Фильтр в `[pagename].vue`**

Импорт (в блок Utils): `import { isRenderableSchemaComponent } from '../../common/utils/bricks/schemaContract';`

`allComponents`:

```ts
const allComponents = computed<IBricksComponent[]>(() => {
    const components = page.value?.schema?.components ?? [];
    // Legacy-строки БД могли сохраниться до контракта схемы (аудит A-02):
    // мусорные элементы отфильтровываются, а не роняют SSR
    return components.filter(
        (component): component is IBricksComponent =>
            isRenderableSchemaComponent(component) && !component.isHidden
    );
});
```

В `prefetchPageBricks()` заменить первую строку на `const components = allComponents.value;` (у отфильтрованных компонентов `brickPath` уже безопасно читать; скрытые не рендерятся — префетч им не нужен).

- [ ] **Step 5: Прогнать тесты и проверки**

Run: `npx vitest run test/renderLayoutsCycleGuard.spec.ts` → PASS.
Run: `npx vue-tsc --noEmit 2>&1 | grep -E "useRendererLayouts|pagename"` → пусто; oxlint по обоим файлам → чисто.

- [ ] **Step 6: Commit**

```bash
git add src/runtime/modules/render/composables/useRendererLayouts.ts "src/runtime/modules/render/pages/[pagename].vue" test/renderLayoutsCycleGuard.spec.ts
git commit -m "fix(render): defensive filtering and cycle guard for legacy schemas (audit A-02)"
```

---

### Task 7: Документация, статус аудита и полные гейты

**Files:**
- Modify: `CLAUDE.md` (короткие апдейты разделов «Медиа-хранилище» — канонизация ключей; новый абзац про контракт схемы)
- Modify: `docs/application-audit-2026-07-12.md` (раздел «Статус исправлений»)

- [ ] **Step 1: CLAUDE.md**

В раздел «Медиа-хранилище: managed namespace и атомарные операции» дополнить пункт про чистые функции: «`s3KeyPolicy.ts` канонизирует URL (WHATWG-парсер, одинарный decode, запрет dot-сегментов/`%`/backslash/control chars) до namespace-проверки — строковых `startsWith`-проверок URL в новом коде не добавлять (аудит A-01)».

Добавить короткий раздел «Контракт схемы страницы (2026-07-12)»:

```markdown
## Контракт схемы страницы (2026-07-12)

`schema.components` проходит структурный контракт `common/utils/bricks/schemaContract.ts`
(форма компонента, уникальность id, двусторонние parent/children/slot-связи,
ацикличность, глубина ≤ 32) в четырёх точках: server create/update
(`payloadValidation.validateSchema`), restore версии (`pageVersionRestore`, 400 для
legacy-версий с диагностикой), импорт JSON билдера (`useSchemaFileTransfer`) и
защитно в рендере (`isRenderableSchemaComponent`-фильтр `[pagename].vue` +
cycle/depth guard `useRendererLayouts`). Новые обязательные поля компонентов
добавлять в контракт и в тест `commonSchemaContract.spec.ts`. Лимиты сложности
JSON-графа (глубина/узлы/байты) — отдельный слой `schemaPayloadValidation.ts`.
```

- [ ] **Step 2: Статус в аудит-отчёте**

В конец `docs/application-audit-2026-07-12.md` добавить раздел:

```markdown
## Статус исправлений (2026-07-12)

- **A-01 — закрыто.** `s3KeyPolicy.ts` канонизирует URL до namespace-проверки
  (WHATWG-парсинг, одинарный decode, запрет dot-сегментов/`%`/backslash/control
  chars); adversarial-тесты `persistenceS3KeyPolicy.spec.ts` покрывают `../`,
  `%2e%2e`, `%252e%252e`, backslash, userinfo, порт, похожие origin/bucket.
  Legacy-ручка `POST /api/bricks/media` удалена — записи `bricks_media` создаёт
  только сервер (upload flow, импорт из бакета).
- **A-02 — закрыто.** Введён структурный контракт графа компонентов
  (`common/utils/bricks/schemaContract.ts`): 400 для примитивов, duplicate/
  dangling id, self-loop и multi-node cycle на create/update/restore; импорт
  JSON в билдере валидируется тем же модулем; public render дополнительно
  фильтрует мусорные legacy-компоненты и защищён cycle/depth guard'ом
  (`renderLayoutsCycleGuard.spec.ts`).
```

- [ ] **Step 3: Полные гейты**

Run: `npm run type-check` → PASS.
Run: `npm test` → PASS (все спеки).
Run: `npm run lint:check` → PASS.
Run: `npm run format:check` → PASS (иначе `npm run lint:fix` и перепроверить diff).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/application-audit-2026-07-12.md
git commit -m "docs: audit P0 remediation status (A-01, A-02)"
```

- [ ] **Step 5 (опционально, долгий):** `npm run smoke:pack` — fresh-consumer smoke собранного tarball; гонять при готовности ждать несколько минут (это релизный гейт аудита).

---

## Self-Review Notes

- **Coverage против критериев приёмки аудита:** A-01 table-driven тесты (`../`, `%2e%2e`, `%252e%252e`, backslash, query/fragment, похожий origin/bucket) — Task 1; register/proxy/delete идут через единую композицию `extractStorageKey`+`isManagedStorageKey` (adapter `extractManagedKey`), upload дополнительно защищён segment-safety — Task 1; legacy endpoint удалён — Task 2. A-02: 400 для примитивов/duplicate/dangling/self-loop/multi-node cycle — Task 3+4; import/create/update/restore — Task 4+5; legacy-схемы отклоняются с диагностикой (restore 400, рендер деградирует мягко) — Task 4+6; adversarial render-тест — Task 6.
- **Известные допущения:** контракт требует `brickPath` у всех компонентов (builder всегда его пишет, включая layout `layout/<name>`); `type` необязателен (legacy-толерантность), но при наличии — валидируется; запрет `%` в ключах безопасен, т.к. stored-имена генерируются сервером (`randomUUID().ext`, `page-<pagename>.webp`).
- **Точки риска для исполнителя:** фикстуры существующих restore-тестов могут не проходить новый контракт (править фикстуры, Task 4 Step 1); стиль ассертов 400 в `persistencePayloadValidation.spec.ts` взять из самого файла; относительная глубина импорта в `useSchemaFileTransfer.ts` — 4 уровня (`../../../../common/...`) — сверить.
