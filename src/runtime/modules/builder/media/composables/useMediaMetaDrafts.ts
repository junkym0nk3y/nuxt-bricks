// #region Imports
// Types
import type { IMediaUpdateMetaRequest } from '../../../common/types/media';
import type { IMediaMetaDrafts, IMediaMetaDraftsOptions } from '../types/media';

// Vue
import { ref, watch } from 'vue';
// #endregion

/**
 * Черновики имени и alt выбранного файла: ввод, коммит правки и защита от
 * серверных обновлений.
 *
 * Один механизм на две поверхности — мета-панель модалки и панель деталей
 * раздела дашборда. Вторая копия этой синхронизации разъехалась бы с первой
 * молча: она вся состоит из краёв, каждый из которых уже был дефектом.
 */
export function useMediaMetaDrafts(options: IMediaMetaDraftsOptions): IMediaMetaDrafts {
    // #region Data
    const filename = ref('');
    const alt = ref('');
    /**
     * Последние принятые серверные значения — по ним отличается «поле не
     * тронуто» от «в поле несохранённый ввод». Отдельного флага dirty нет
     * намеренно: он завёл бы второй источник того же факта и разъехался бы с
     * самим значением.
     */
    const syncedItemId = ref<number | null>(null);
    const syncedFilename = ref('');
    const syncedAlt = ref('');
    // #endregion

    // #region Methods
    /**
     * Отправляет изменённые поля при уходе фокуса из ряда полей.
     *
     * Черновик приводится к отправляемому виду до всякой проверки, и это не
     * косметика: поле, черновик которого разошёлся с теневым значением, сторож
     * ниже считает полем с несохранённым вводом и перестаёт доносить до него
     * серверные обновления. Очищенное имя не отправляется (сервер требует
     * минимум один символ), а ввод с хвостовым пробелом после trim совпадает с
     * уже сохранённым — в обоих случаях без возврата к серверному значению поле
     * залипало бы в этом состоянии навсегда, то есть внешняя правка имени в него
     * уже не доехала бы.
     */
    function commit(): void {
        const item = options.item();

        if (!item) {
            return;
        }

        // Пустое имя недопустимо, и единственное значение, к которому его можно
        // вернуть, — серверное: собственного «прежнего» у поля нет
        const normalizedFilename = filename.value.trim() || item.filename;
        const normalizedAlt = alt.value.trim();

        filename.value = normalizedFilename;
        alt.value = normalizedAlt;

        const meta: IMediaUpdateMetaRequest = {};

        if (normalizedFilename !== item.filename) {
            meta.filename = normalizedFilename;
        }

        if (normalizedAlt !== item.alt) {
            meta.alt = normalizedAlt;
        }

        if (Object.keys(meta).length === 0) {
            return;
        }

        options.onCommit(meta);
    }
    // #endregion

    // #region Lifecycle
    /**
     * Синхронизирует черновики с серверным состоянием — по полю, а не оптом.
     *
     * Два крайних варианта не работают оба. Сторож по объекту срабатывал на
     * СОБСТВЕННОМ ответе PATCH (стор подменяет элемент списка новым объектом) и
     * перетирал оба поля: правишь имя, уходишь Tab'ом в alt — это и отправляет
     * PATCH, — печатаешь, и набранное исчезает, когда приходит ответ. Сторож
     * только по `id` терял обратную задачу: файл заменился с тем же id
     * (перечитывание списка после обрыва, правка с другой поверхности), поле
     * осталось с прежним значением, и следующий коммит отправлял его назад — то
     * есть откатывал чужое изменение.
     *
     * Поэтому решение по полю: поле, которого пользователь не касался, принимает
     * серверное значение; поле с несохранённым вводом его переживает. «Не
     * касался» — это «черновик совпадает с последним принятым серверным
     * значением», для чего и нужны теневые ref'ы.
     */
    watch(
        () => {
            const item = options.item();

            return [item?.id ?? null, item?.filename, item?.alt];
        },
        () => {
            const item = options.item();
            const nextId = item?.id ?? null;
            const nextFilename = item?.filename ?? '';
            const nextAlt = item?.alt ?? '';

            // Смена файла сбрасывает всё: черновик прошлого файла к новому
            // отношения не имеет, даже если пользователь его не сохранил
            if (nextId !== syncedItemId.value) {
                syncedItemId.value = nextId;
                syncedFilename.value = nextFilename;
                syncedAlt.value = nextAlt;
                filename.value = nextFilename;
                alt.value = nextAlt;
                return;
            }

            if (filename.value === syncedFilename.value) {
                filename.value = nextFilename;
            }

            if (alt.value === syncedAlt.value) {
                alt.value = nextAlt;
            }

            syncedFilename.value = nextFilename;
            syncedAlt.value = nextAlt;
        },
        { immediate: true }
    );
    // #endregion

    return { filename, alt, commit };
}
