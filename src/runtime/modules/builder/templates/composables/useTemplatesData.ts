// #region Imports
// Types
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { ITemplatesState, IUseTemplatesDataReturn } from '../types/templates';

// Utils
import { fetchTemplatesRequest } from '../utils/templatesApi';
import { withPromiseDeadline } from '../../../common/utils/promiseDeadline';

// Vue
import { computed } from 'vue';

// Constants
import {
    BRICKS_API_READ_TIMEOUT_MS,
    BRICKS_SSR_DEADLINE_MARGIN_MS,
} from '../../../common/constants/apiTimeouts';

// Nuxt
import { useNuxtApp, useState } from '#imports';
// #endregion

// #region Data
/** Ключ общего состояния списка шаблонов: одно значение на приложение. */
const TEMPLATES_STATE_KEY = 'bricks-templates';

/**
 * Идущая загрузка — по экземпляру приложения Nuxt, а не переменной модуля.
 *
 * Модуль-глобальный промис на сервере общий для ВСЕХ запросов процесса: два
 * одновременных SSR-рендера дашборда получили бы один и тот же список, то есть
 * ответ, полученный по чужой сессии. `WeakMap` изолирует дедупликацию по запросу
 * и не держит ссылку после его завершения (паттерн `useUsersData`).
 */
const inflightRequests = new WeakMap<object, Promise<void>>();

/**
 * Счётчик локальных правок списка — тоже по экземпляру приложения: служебному
 * значению не место в payload гидрации.
 */
const localRevisions = new WeakMap<object, { count: number }>();
// #endregion

/**
 * Список шаблонов раздела «Шаблоны»: чтение с сервера и точечные правки
 * состояния после операций.
 *
 * Состояние — `useState`, а не Pinia-store: список живёт на одной поверхности
 * (раздел дашборда и выбор источника новой страницы — она же), зато нужен
 * SSR-сид — счётчик в рейле рисуется в первом кадре вместе с пунктом раздела.
 *
 * Правки после операций точечные (`upsertTemplate`, `removeTemplate`), а не
 * повторное чтение: ручки отдают полное состояние записи, и второй GET за тем
 * же, что уже приехало, добавил бы кадр с двойной перерисовкой. Полное
 * перечитывание остаётся у `refreshTemplates` — для повтора после отказа и
 * сверки, когда исход операции неизвестен.
 *
 * @returns Список, признак готовности и операции над состоянием.
 */
export function useTemplatesData(): IUseTemplatesDataReturn {
    // #region Data
    const nuxtApp = useNuxtApp();

    // Состояние заменяется целиком, а не правится по полям: `useState` хранит
    // объект, и точечная мутация внутри него не обязана оповещать подписчиков
    const state = useState<ITemplatesState>(TEMPLATES_STATE_KEY, () => ({
        templates: [],
        status: 'idle',
    }));

    // Общий на приложение: композабл зовут и рейл, и раздел, и модалки
    const revision = localRevisions.get(nuxtApp) ?? { count: 0 };

    localRevisions.set(nuxtApp, revision);
    // #endregion

    // #region Computed
    const templates = computed<TBricksTemplateSummary[]>(() => state.value.templates);
    const status = computed(() => state.value.status);

    const templatesCount = computed<number | null>(() =>
        state.value.status === 'ready' ? state.value.templates.length : null
    );

    /**
     * Дата самого свежего шаблона для строки-сводки раздела. Берётся первый
     * элемент, а не максимум: сервер отдаёт список по дате создания вниз, и
     * второй проход по нему считал бы то же самое.
     */
    const lastSavedAt = computed<string | null>(() => state.value.templates[0]?.createdAt ?? null);
    // #endregion

    // #region Methods
    /**
     * Читает список с сервера и раскладывает исход по состоянию раздела.
     *
     * Отказ наружу не бросается: загрузку запускает composition root до первого
     * кадра, и отклонённый промис унёс бы весь дашборд из-за раздела, которого
     * человек мог и не открыть.
     */
    async function loadTemplates(): Promise<void> {
        // Прочитанный список на время чтения не гасится: карточки на экране верны
        // на момент прошлого ответа, а скелет вместо них при каждом входе в
        // раздел отнимал бы то, зачем человек пришёл
        if (state.value.status !== 'ready') {
            state.value = { ...state.value, status: 'loading' };
        }

        // Цикл, а не один запрос: ответ, обогнанный локальной правкой, применять
        // нельзя, но и бросить чтение нельзя — раздел остался бы с состоянием, о
        // котором неизвестно, свежее оно или нет. Итерация повторяется ровно
        // тогда, когда между стартом запроса и ответом список правила операция,
        // поэтому останавливается сама (паттерн `useUsersData`)
        for (;;) {
            const revisionAtStart = revision.count;

            try {
                const list = await requestWithinDeadline();

                if (revision.count !== revisionAtStart) {
                    continue;
                }

                state.value = { templates: list, status: 'ready' };
            } catch (error: unknown) {
                // Одно состояние отказа: ручки шаблонов приезжают вместе с
                // модулем, поэтому «раздела нет в установке» тут не бывает —
                // любой отказ имеет смысл повторить
                state.value = { ...state.value, status: 'error' };

                console.error('[Builder] Failed to load templates list:', error);
            }

            return;
        }
    }

    /**
     * Ограничивает ожидание списка на SSR.
     *
     * Потолок транспорта на сервере инертен: относительный URL уходит внутренним
     * вызовом Nitro, а он `AbortSignal` не слушает. Без внешнего дедлайна
     * зависший запрос держал бы не список шаблонов, а весь ответ страницы.
     *
     * @returns Список сводок шаблонов.
     */
    function requestWithinDeadline(): Promise<TBricksTemplateSummary[]> {
        const request = fetchTemplatesRequest();

        if (!import.meta.server) {
            return request;
        }

        const deadlineMs = BRICKS_API_READ_TIMEOUT_MS + BRICKS_SSR_DEADLINE_MARGIN_MS;

        return withPromiseDeadline(
            request,
            deadlineMs,
            () => new Error(`Templates list did not arrive within ${deadlineMs} ms`)
        );
    }

    /**
     * Отдаёт идущую загрузку либо запускает новую.
     *
     * Дедупликация нужна от второго потребителя списка: рейл со счётчиком, сам
     * раздел и модалка создания страницы спрашивают одно состояние, и без общего
     * промиса первый кадр отправил бы два одинаковых GET.
     *
     * @returns Промис текущей загрузки.
     */
    function startLoad(): Promise<void> {
        const inflight = inflightRequests.get(nuxtApp);

        if (inflight) {
            return inflight;
        }

        const request = loadTemplates().finally(() => {
            inflightRequests.delete(nuxtApp);
        });

        inflightRequests.set(nuxtApp, request);

        return request;
    }

    /**
     * Загружает список, если он ещё не прочитан.
     *
     * Готовый список повторно не читается: карточки на экране верны на момент
     * прошлого ответа, а отказавшее чтение повторяет кнопка раздела.
     */
    async function ensureTemplates(): Promise<void> {
        if (state.value.status === 'ready') {
            return;
        }

        return startLoad();
    }

    /**
     * Перечитывает список принудительно: повтор после временного отказа и сверка
     * после операции с неизвестным исходом.
     */
    async function refreshTemplates(): Promise<void> {
        return startLoad();
    }

    /**
     * Кладёт шаблон в список: известный — на его место, новый — в НАЧАЛО.
     *
     * В начало, а не в конец (в отличие от учёток): сервер отдаёт список по дате
     * создания вниз, и только что сохранённый шаблон обязан оказаться там же, где
     * окажется после следующего чтения, — иначе карточка прыгнула бы на другое
     * место при первом обновлении.
     *
     * @param template - Сводка шаблона, полученная от ручки.
     */
    function upsertTemplate(template: TBricksTemplateSummary): void {
        const isKnown = state.value.templates.some((item) => item.id === template.id);

        revision.count += 1;

        state.value = {
            ...state.value,
            templates: isKnown
                ? state.value.templates.map((item) => (item.id === template.id ? template : item))
                : [template, ...state.value.templates],
        };
    }

    /**
     * Убирает шаблон из списка после подтверждённого удаления.
     *
     * @param templateId - Идентификатор удалённого шаблона.
     */
    function removeTemplate(templateId: number): void {
        revision.count += 1;

        state.value = {
            ...state.value,
            templates: state.value.templates.filter((item) => item.id !== templateId),
        };
    }
    // #endregion

    return {
        templates,
        status,
        templatesCount,
        lastSavedAt,
        ensureTemplates,
        refreshTemplates,
        upsertTemplate,
        removeTemplate,
    };
}
