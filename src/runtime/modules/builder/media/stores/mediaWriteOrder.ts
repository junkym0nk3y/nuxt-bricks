/**
 * Порядок применения ответов на записи медиатеки.
 *
 * Отдельно от `media.ts` по границе задачи: тот владеет списком файлов и
 * запросами, а здесь — только бухгалтерия «какой ответ ещё актуален». Вместе они
 * перерастали потолок длины файла, а по отдельности эта часть ещё и проверяется
 * юнитами без единого запроса.
 *
 * Про список файлов стор ничего не знает намеренно: обратный импорт замкнул бы
 * цикл, поэтому `endItemOperation` не перечитывает список сам, а сообщает
 * вызывающему, что сверка нужна.
 */

// #region Imports
// Types
import type { TMediaItemWriteField } from '../types/media';

// Pinia
import { defineStore } from 'pinia';
// #endregion

// #region Helpers
/**
 * Ключ номера записи: элемент плюс поле, которым запись владеет.
 *
 * @param id - Идентификатор медиа.
 * @param field - Поле элемента.
 * @returns Ключ в `itemWriteIds`.
 */
function buildItemWriteKey(id: number, field: TMediaItemWriteField): string {
    return `${id}:${field}`;
}
// #endregion

export const useMediaWriteOrderStore = defineStore('bricksMediaWriteOrder', {
    state: () => ({
        // Номер последней стартовавшей записи, ключ — `<id>:<поле>`. Два быстрых
        // `focusout` по одному полю уходят двумя PATCH'ами, и ответ раннего,
        // пришедший позже, кладёт в стор значение, которое пользователь уже
        // перебил. Ключ включает поле, потому что правки разных полей одного файла
        // друг другу не противоречат — общий счётчик на элемент глушил бы ответ
        // соседней правки
        itemWriteIds: {} as Record<string, number>,
        // Поколение КАЖДОЙ категории по её slug'у: удаление категории обесценивает
        // летящее назначение именно этой категории. Отдельно от `itemWriteIds`
        // потому, что PATCH, ставящий категорию, до своего ответа локально её ещё
        // не показал — по составу списка его элемент от непричастных не отличить,
        // а ответ вернул бы в галерею уже удалённый slug. И именно по slug'у, а не
        // одним счётчиком на все: общий обесценивал бы и успешное назначение
        // «Фоны» из-за удаления «Промо», к которому оно не имеет отношения.
        // Записи не удаляются: удаление и повторное создание того же slug не
        // должны оживлять старый PATCH
        categoryGenerations: {} as Record<string, number>,
        // Сколько операций по элементу летит сейчас и была ли среди них
        // отказавшая. Нужно вместе: отказ более СВЕЖЕЙ записи оставляет успех
        // более ранней неприменённым (устаревшим ответ считается по порядку
        // старта, а кто победил на сервере — неизвестно), поэтому после отказа
        // состояние элемента приходится сверять с сервером. Сверка отпускается не
        // в `catch`, а когда по элементу не осталось летящих записей: иначе GET
        // обогнал бы незавершённый PATCH и прочитал состояние до него
        itemActiveCounts: {} as Record<number, number>,
        itemReloadPending: {} as Record<number, boolean>,
    }),

    actions: {
        /**
         * Открывает запись поля элемента и возвращает её номер: по нему ответ
         * решает, применять ли себя. Вызов сам обесценивает записи этого же поля,
         * которые летят в момент вызова.
         *
         * @param id - Идентификатор медиа.
         * @param field - Поле, которым владеет запись.
         * @returns Номер записи.
         */
        startItemWrite(id: number, field: TMediaItemWriteField): number {
            const key = buildItemWriteKey(id, field);
            const writeId = (this.itemWriteIds[key] ?? 0) + 1;
            this.itemWriteIds[key] = writeId;

            return writeId;
        },

        /**
         * Актуальна ли запись: её номер всё ещё последний по этому полю.
         *
         * @param id - Идентификатор медиа.
         * @param field - Поле, которым владеет запись.
         * @param writeId - Номер, выданный `startItemWrite`.
         * @returns false — ответ устарел и применяться не должен.
         */
        isCurrentItemWrite(id: number, field: TMediaItemWriteField, writeId: number): boolean {
            return this.itemWriteIds[buildItemWriteKey(id, field)] === writeId;
        },

        /**
         * Текущее поколение категории; `null` (снятие категории) поколения не
         * имеет — удалить категорию так, чтобы «без категории» стало неверным,
         * нельзя.
         *
         * @param slug - Назначаемая категория или null.
         * @returns Поколение или undefined.
         */
        readCategoryGeneration(slug: string | null): number | undefined {
            return slug === null ? undefined : this.categoryGenerations[slug];
        },

        /**
         * Обесценивает летящие назначения удалённой категории. Назначения других
         * категорий удалению не противоречат и остаются в силе.
         *
         * @param slug - Удалённая категория.
         */
        invalidateCategory(slug: string): void {
            this.categoryGenerations[slug] = (this.categoryGenerations[slug] ?? 0) + 1;
        },

        /**
         * Снимает номера записей удалённого элемента: применять их ответы больше
         * некуда, а счётчики по несуществующему id только копились бы.
         *
         * @param id - Идентификатор медиа.
         */
        forgetItem(id: number): void {
            const prefix = `${id}:`;

            for (const key of Object.keys(this.itemWriteIds)) {
                if (key.startsWith(prefix)) {
                    delete this.itemWriteIds[key];
                }
            }
        },

        /**
         * Открывает операцию по элементу.
         *
         * @param id - Идентификатор медиа.
         */
        beginItemOperation(id: number): void {
            this.itemActiveCounts[id] = (this.itemActiveCounts[id] ?? 0) + 1;
        },

        /**
         * Закрывает операцию по элементу.
         *
         * @param id - Идентификатор медиа.
         * @param failed - Операция завершилась отказом.
         * @returns true — по элементу был отказ и летящих записей не осталось,
         *   то есть состояние пора сверить с сервером.
         */
        endItemOperation(id: number, failed: boolean): boolean {
            const active = (this.itemActiveCounts[id] ?? 1) - 1;

            if (failed) {
                this.itemReloadPending[id] = true;
            }

            if (active > 0) {
                this.itemActiveCounts[id] = active;

                return false;
            }

            delete this.itemActiveCounts[id];

            if (!this.itemReloadPending[id]) {
                return false;
            }

            delete this.itemReloadPending[id];

            return true;
        },
    },
});
