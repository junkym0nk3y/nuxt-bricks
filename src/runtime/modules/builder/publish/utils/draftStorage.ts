import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type { IBuilderDraftEntry, TBuilderDraftMigration } from '../types/builderDrafts';
import { getPageAddressKey, toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { normalizeFormState } from './formState';

/**
 * Формирует ключ localStorage для черновика билдера.
 *
 * Ключ адресный (`…:draft:blog/post`), а не по одному имени: у `/blog/post` и
 * `/news/post` черновик был бы общим — открытая рядом вторая страница
 * предлагала бы восстановить правки первой и затирала бы их своим автосейвом.
 * У страницы без префикса ключ совпадает с прежним, поэтому её черновики
 * переход на адресную идентичность переживают.
 *
 * @param address - Адрес страницы.
 * @returns Ключ для localStorage.
 */
function buildBuilderDraftKey(address: IBricksPageAddress): string {
    return `bricks-builder:draft:${getPageAddressKey(address)}`;
}

/**
 * Ключ пробной записи. Свой неймспейс, а не `…:draft:<pagename>` — иначе проба
 * заняла бы ключ страницы с таким именем.
 */
const BUILDER_DRAFT_PROBE_KEY = 'bricks-builder:storage-probe';

/**
 * Проверяет, доступно ли хранилище черновиков, пробной записью.
 *
 * Именно записью: `localStorage` существует и в приватном режиме, и при
 * запрещённых данных сайта — отказ приходит только на `setItem`. Без пробы
 * пользователь узнавал бы о неработающем восстановлении через ~800 мс после
 * первой правки, а то и вовсе не узнавал.
 *
 * @returns Доступна ли запись черновиков.
 */
export function isBuilderDraftStorageAvailable(): boolean {
    // Вызывается только с клиента (по готовности сессии): на сервере черновиков
    // нет вовсе, и сообщать там некому
    if (typeof window === 'undefined') {
        return false;
    }

    try {
        window.localStorage.setItem(BUILDER_DRAFT_PROBE_KEY, '1');
        window.localStorage.removeItem(BUILDER_DRAFT_PROBE_KEY);

        return true;
    } catch (error) {
        console.warn('[Publish Store] Builder draft storage is unavailable:', error);

        return false;
    }
}

/**
 * Возвращает черновик билдера из localStorage.
 *
 * @param address - Адрес страницы.
 */
export function getBuilderDraft(address: IBricksPageAddress): IBuilderDraftEntry | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const key = buildBuilderDraftKey(address);

    // Само обращение к хранилищу — тоже внутри try: при запрещённых данных сайта
    // бросает и `getItem`, а чтение черновика идёт из bootstrap'а сессии — оттуда
    // исключение уронило бы открытие страницы целиком, хотя терялось бы всего
    // лишь восстановление несохранённых правок
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) {
            return null;
        }

        return JSON.parse(raw) as IBuilderDraftEntry;
    } catch (error) {
        console.warn('[Publish Store] Failed to read builder draft:', { key, error });
        return null;
    }
}

/**
 * Сохраняет черновик билдера в localStorage.
 *
 * Возвращает исход, а не молчит: отказ записи означает, что восстановление после
 * перезагрузки не работает, — и пользователь, считающий правки защищёнными,
 * должен об этом узнать. Сам механизм автосейва при этом не отключается: запрет
 * может быть снят (освободилась квота, изменилась настройка), и следующая
 * попытка пройдёт.
 *
 * @param draft - Данные черновика.
 * @returns Записан ли черновик.
 */
export function setBuilderDraft(draft: IBuilderDraftEntry): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    const normalized: IBuilderDraftEntry = {
        ...draft,
        draftSnapshot: {
            schema: draft.draftSnapshot.schema,
            formState: normalizeFormState(draft.draftSnapshot.formState),
        },
        savedSnapshot: draft.savedSnapshot
            ? {
                  schema: draft.savedSnapshot.schema,
                  formState: normalizeFormState(draft.savedSnapshot.formState),
              }
            : undefined,
    };

    const key = buildBuilderDraftKey(toPageAddress(draft.pagename, draft.urlPrefix));
    try {
        window.localStorage.setItem(key, JSON.stringify(normalized));

        return true;
    } catch (error) {
        console.warn('[Publish Store] Failed to save builder draft:', { key, error });

        return false;
    }
}

/**
 * Удаляет черновик билдера.
 *
 * Возвращает исход: неудаленный черновик переживёт и сохранение страницы, и
 * явное «открыть сохранённую» — и при следующем заходе снова предложит
 * восстановить состояние, от которого пользователь уже отказался.
 *
 * @param address - Адрес страницы.
 * @returns Удалён ли черновик.
 */
export function removeBuilderDraft(address: IBricksPageAddress): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    const key = buildBuilderDraftKey(address);

    // Удаление зовут и после успешного сохранения страницы: исключение
    // запрещённого хранилища провалило бы фиксацию сохранённого состояния,
    // хотя сама страница уже записана на сервер
    try {
        window.localStorage.removeItem(key);

        return true;
    } catch (error) {
        console.warn('[Publish Store] Failed to remove builder draft:', { key, error });

        return false;
    }
}

/**
 * Переносит черновик билдера на новый адрес.
 *
 * Занятый ключ назначения не перезаписывается: под ним лежит черновик другой
 * страницы, и перенос уничтожал бы его молча. Исходная запись при отказе
 * остаётся на месте — потерь на самом переносе нет. Остаток осознан: автосейв
 * сессии через ~800 мс всё равно займёт новый ключ, но это уже обычное «сессия
 * владеет своим ключом», а не тихая подмена во время rename.
 *
 * @param fromAddress - Старый адрес.
 * @param toAddress - Новый адрес.
 */
export function migrateBuilderDraft(
    fromAddress: IBricksPageAddress,
    toAddress: IBricksPageAddress
): TBuilderDraftMigration {
    if (typeof window === 'undefined') {
        return 'nothing-to-migrate';
    }

    const fromKey = buildBuilderDraftKey(fromAddress);
    const toKey = buildBuilderDraftKey(toAddress);

    if (fromKey === toKey) {
        return 'nothing-to-migrate';
    }

    // Чтение — тоже в try: перенос идёт из `renameSession`, а тот ждёт
    // `router.replace`, и исключение отсюда сорвало бы саму навигацию
    try {
        const raw = window.localStorage.getItem(fromKey);
        if (!raw) {
            return 'nothing-to-migrate';
        }

        if (window.localStorage.getItem(toKey) !== null) {
            console.warn('[Publish Store] Builder draft migration skipped: target key is taken', {
                fromKey,
                toKey,
            });

            return 'target-taken';
        }

        let parsed: unknown;

        // Разбор — в своём `try`: повреждённая запись не имеет отношения к
        // доступности хранилища, а общий `catch` ниже выдавал бы её за отказ
        // storage — и пользователь получил бы сообщение о запрете localStorage,
        // которого не было. Переносить при этом всё равно нечего: нечитаемый
        // черновик не восстановит ни один ключ
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            console.warn('[Publish Store] Builder draft migration skipped: unreadable draft', {
                fromKey,
                error,
            });

            return 'nothing-to-migrate';
        }

        // Форму проверяем отдельно: синтаксически валидным JSON бывает и `null`,
        // и строка, и число — присваивание поля такому значению бросает уже
        // после разбора, и внешний `catch` снова выдал бы порчу данных за отказ
        // хранилища
        if (parsed === null || typeof parsed !== 'object') {
            console.warn(
                '[Publish Store] Builder draft migration skipped: unexpected draft shape',
                {
                    fromKey,
                }
            );

            return 'nothing-to-migrate';
        }

        // Обе половины адреса, а не одно имя: перенос бывает и сменой префикса, и
        // после него запись с прежним `urlPrefix` считалась бы черновиком чужого
        // адреса — bootstrap сессии сверяет владельца записи
        const draft = parsed as IBuilderDraftEntry;
        draft.pagename = toAddress.pagename;
        draft.urlPrefix = toAddress.urlPrefix;
        window.localStorage.setItem(toKey, JSON.stringify(draft));
        // Отдельный `try` не нужен, а вот исход — да: если запись под новым
        // ключом прошла, а удаление старого нет, автосейв дальше будет успешно
        // писать по новому ключу и о поломке никто не узнает, — а черновик под
        // прежним слагом останется и позже предложит восстановление
        window.localStorage.removeItem(fromKey);

        return 'migrated';
    } catch (error) {
        console.warn('[Publish Store] Failed to migrate builder draft:', { error });

        return 'storage-unavailable';
    }
}
