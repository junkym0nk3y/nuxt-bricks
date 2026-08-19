/**
 * Доменные ошибки storage-слоя.
 *
 * Адаптеры (дефолтный Postgres и кастомные реализации IStorageAdapter) кидают
 * эти классы вместо драйверных ошибок — ручки маппят их на HTTP-статусы с
 * машиночитаемым `data.code` (см. handlerHelpers, коды — PAGE_CONFLICT_CODES в
 * common/constants/publish.ts и BRICKS_API_ERROR_CODES в
 * common/constants/apiErrors.ts). Классы реэкспортируются из
 * `nuxt-bricks/persistence` для кастомных адаптеров.
 */

/**
 * Запись ГАРАНТИРОВАННО отвергнута: хранилище ответило отказом, и ни одна
 * половина операции не зафиксирована.
 *
 * Маркер нужен владельцу внешних побочных эффектов — оркестрации медиа: удалять
 * уже загруженные в бакет файлы можно только под эту гарантию. Всё остальное
 * (обрыв соединения, таймаут транспорта, 5xx внешнего backend'а) означает
 * НЕИЗВЕСТНЫЙ исход: ответ мог не доехать уже после коммита, и компенсация
 * оставила бы в БД строку, указывающую на удалённый объект. Поэтому умолчание
 * обратное — ошибка без этого маркера считается неопределённой.
 *
 * Ставит маркер тот, кто знает, какая именно операция отвергнута, и делает это
 * положительным списком, а не по косвенным признакам: наличие у драйверной
 * ошибки SQLSTATE ничего не доказывает — `08007 transaction_resolution_unknown`
 * и `40003 statement_completion_unknown` прямо означают обратное.
 *
 * Класс — часть контракта IStorageAdapter: кастомный адаптер сообщает им тот же
 * факт (реэкспортируется из `nuxt-bricks/persistence`).
 */
export class BricksStorageWriteRejectedError extends Error {
    constructor(message: string, cause?: unknown) {
        super(message, { cause });
        this.name = 'BricksStorageWriteRejectedError';
    }
}

/**
 * Запрос не был отправлен в базу: пул не удалось даже собрать (нет строки
 * подключения, не загрузился драйвер).
 *
 * Внутренняя ошибка дефолтного Postgres-адаптера — в отличие от соседей, из
 * `nuxt-bricks/persistence` НЕ реэкспортируется. Живёт здесь потому, что это
 * файл классов ошибок слоя, а нужна там, где важно отличить «SQL не ушёл» от
 * «ушёл, а ответа нет»: у первого исход определён. Сам маркер отвергнутой
 * записи она не несёт — общий `query` обслуживает и чтения, которым такая
 * гарантия ничего не значит; перевод делает адаптер, знающий свою операцию.
 */
export class BricksPostgresQueryNotStartedError extends Error {
    constructor(cause: unknown) {
        super('Query was never sent to the database', { cause });
        this.name = 'BricksPostgresQueryNotStartedError';
    }
}

/**
 * Категории с таким slug'ом в медиатеке нет.
 *
 * Кидается и ранней проверкой (`assertKnownMediaCategory`), и самим FK базы,
 * если категорию удалили между проверкой и записью, — ответ обязан быть
 * одинаковым в обоих случаях. Наследует маркер определённого отказа: FK
 * отклоняет запись целиком, поэтому загруженный до этого файл безопасно удалить.
 */
export class BricksUnknownMediaCategoryError extends BricksStorageWriteRejectedError {
    readonly category: string;

    constructor(category: string, cause?: unknown) {
        super(`Unknown media category: ${category}`, cause);
        this.name = 'BricksUnknownMediaCategoryError';
        this.category = category;
    }
}

/**
 * Конфликт уникальности АДРЕСА: страница по этому адресу уже существует.
 * Кидается из createPage/updatePage при нарушении unique-ограничения —
 * в том числе при гонке двух одновременных запросов (pre-check её не ловит).
 *
 * Ошибка-маркер: конкретный адрес в неё не передаётся. Нарушение приходит от
 * базы кодом SQLSTATE, а какая именно половина пары его вызвала — из payload'а
 * не видно: при PATCH одного поля вторая половина лежит в сохранённой строке.
 * Прежний вариант с обязательной строкой pagename заставлял вызывающих
 * подставлять пустую строку, и в сообщении об ошибке оказывалось
 * `pagename ""`.
 *
 * Проволочный код ответа (`PAGENAME_CONFLICT`) сохранён: он часть внешнего
 * контракта и переименование ломало бы кастомные backend'ы без пользы.
 */
export class BricksPageAddressConflictError extends Error {
    constructor() {
        super('Page with this address already exists');
        this.name = 'BricksPageAddressConflictError';
    }
}

/**
 * Конфликт уникальности имени шаблона: шаблон с такой подписью уже есть.
 * Кидается из createTemplate/updateTemplate при нарушении unique-ограничения —
 * в том числе при гонке двух одновременных запросов.
 *
 * Ошибка-маркер, как и конфликт адреса страницы: конкретное имя в неё не
 * передаётся. Клиенту нужен только факт (подсказка встаёт под полем формы), а
 * имя он и так знает — сам его и отправил.
 */
export class BricksTemplateNameConflictError extends Error {
    constructor() {
        super('Template with this name already exists');
        this.name = 'BricksTemplateNameConflictError';
    }
}

/**
 * Конфликт optimistic locking: страница была изменена после того, как клиент
 * прочитал переданный `expectedRevision`. Кидается из updatePage, когда
 * precondition не совпал с текущей revision строки.
 */
export class BricksRevisionConflictError extends Error {
    readonly pageId: number;

    constructor(pageId: number) {
        super('Page was modified by another request (revision mismatch)');
        this.name = 'BricksRevisionConflictError';
        this.pageId = pageId;
    }
}

/**
 * Запрос остановлен серверным лимитом времени: база отменила его сама и
 * освободила соединение. Откат ОТМЕНЁННОГО statement'а при этом гарантирован,
 * поэтому ручка отдаёт отказ, а не «исход неизвестен» клиентского обрыва.
 *
 * Маркер отвергнутой записи класс намеренно НЕ несёт: отменён мог быть любой
 * запрос, в том числе чтение. Так, перечитывание строки после конфликта
 * уникальности выполняется, когда запись уже существует, и его таймаут ничего
 * не говорит об отсутствии записи — маркер здесь разрешил бы удалить файл
 * из-под живой строки. Гарантию даёт тот, кто знает, какой statement отменён:
 * адаптер оборачивает в маркер только отказ самой вставки.
 *
 * Драйверная ошибка сохраняется в `cause`: наружу она не отдаётся (текст
 * PostgreSQL содержал бы детали SQL), но нужна в server-логе.
 */
export class BricksStatementTimeoutError extends Error {
    constructor(cause?: unknown) {
        super('Query was cancelled by the server statement timeout', { cause });
        this.name = 'BricksStatementTimeoutError';
    }
}
