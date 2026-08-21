/**
 * Приёмник файлов медиа-галереи: разворачивание оверлея по перетаскиванию,
 * счётчик тащимых файлов и сам `drop`.
 *
 * Вынесено из модалки галереи: та собирает пять поверхностей сразу и перерастала
 * потолок SFC. Здесь всё, что нужно только приёмнику, — включая страховку от
 * залипшего оверлея, ради которой у состояния появился таймер и уборка.
 */

// #region Imports
// Types
import type { IMediaGalleryFileDrop, IMediaGalleryFileDropOptions } from '../types/media';

// Utils
import { countDraggedFiles } from '../utils/draggedFiles';

// Vue
import { computed, onUnmounted, ref } from 'vue';
// #endregion

// #region Constants
/**
 * Потолок тишины `dragover`, после которого перетаскивание считается
 * законченным (мс).
 *
 * Секунда, а не «поменьше и поотзывчивее»: браузер повторяет `dragover` на
 * текущей цели примерно трижды в секунду даже под неподвижным курсором, и
 * короткий потолок сворачивал бы приёмник под файлами, которые всё ещё держат.
 * Это страховка, а не основной механизм — обычное перетаскивание закрывает
 * `dragleave`.
 */
const DRAG_IDLE_TIMEOUT_MS = 1000;
// #endregion

/**
 * Собирает состояние и обработчики приёмника файлов.
 *
 * @param options - Куда отдавать брошенные файлы.
 * @returns Состояние приёмника и обработчики перетаскивания.
 */
export function useMediaGalleryFileDrop(
    options: IMediaGalleryFileDropOptions
): IMediaGalleryFileDrop {
    const draggedFileCount = ref(0);
    /** Глубина dragenter/dragleave — см. handleDragLeave. */
    const dragDepth = ref(0);
    let dragIdleTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Принимает ли приёмник файлы сейчас. Проверяется на каждом событии, а не
     * один раз при создании: право приезжает контекстом запроса и в сборке без
     * SSR доходит уже после первого кадра.
     *
     * Гейт живёт здесь, а не в разметке вызывающего: без `preventDefault` на
     * `dragover` браузер откроет брошенный файл соседней вкладкой, а оверлей
     * «отпустите — к загрузке» у роли без права обещал бы загрузку, которую
     * потом молча отсекает проверка перед отправкой.
     */
    const isEnabled = (): boolean => options.isEnabled?.() ?? true;

    const isDraggingFiles = computed<boolean>(() => draggedFileCount.value > 0);

    /** Гасит сторож тишины перетаскивания. */
    function stopDragIdleWatchdog(): void {
        if (dragIdleTimer !== null) {
            clearTimeout(dragIdleTimer);
            dragIdleTimer = null;
        }
    }

    /** Сворачивает приёмник и снимает всё состояние перетаскивания. */
    function resetFileDrop(): void {
        stopDragIdleWatchdog();
        dragDepth.value = 0;
        draggedFileCount.value = 0;
    }

    /**
     * Перезапускает сторож тишины перетаскивания.
     *
     * `dragover` приходит непрерывно, пока курсор с файлами над приёмником,
     * поэтому его пропажа — единственный надёжный признак того, что
     * перетаскивание кончилось. Пар `dragenter`/`dragleave` для этого мало: они
     * теряются (перетаскивание отменили Escape'ом, `drop` приземлился в чужой
     * обработчик, элемент под курсором исчез вместе с перерисовкой сетки), и
     * тогда глубина оставалась положительной — оверлей приёмника залипал поверх
     * сетки до следующего открытия галереи. `dragend` эту дыру не закрывает: у
     * файлов из ОС источник перетаскивания лежит вне документа, и событие в нём
     * не возникает.
     */
    function restartDragIdleWatchdog(): void {
        stopDragIdleWatchdog();
        dragIdleTimer = setTimeout(resetFileDrop, DRAG_IDLE_TIMEOUT_MS);
    }

    /**
     * Держит `drop` включённым: без `preventDefault` на `dragover` браузер
     * откроет файл в соседней вкладке вместо того, чтобы отдать его модалке.
     *
     * @param event - Событие перетаскивания.
     */
    function handleDragOver(event: DragEvent): void {
        // `preventDefault` идёт ДО гейта роли и без него: он не разрешает
        // загрузку, а отбирает у браузера нативную обработку файла. Без него
        // документ откроет брошенный файл соседней вкладкой — то есть роль без
        // права записи получила бы не «ничего не произошло», а уход со страницы
        event.preventDefault();

        if (!isEnabled()) {
            return;
        }

        // Сторож нужен только при развёрнутом приёмнике: над текстом и ссылками
        // он создавал бы таймер на каждое движение курсора впустую
        if (draggedFileCount.value > 0) {
            restartDragIdleWatchdog();
        }
    }

    /**
     * Разворачивает приёмник и запоминает, сколько файлов тащат.
     *
     * Считаются только элементы с `kind === 'file'`: в `items` попадает и
     * выделенный текст, и перетаскиваемая ссылка, а по их числу приёмник
     * разворачивался на том, что `drop` принять не может, и молча ничего не
     * делал. Ноль файлов оставляет приёмник свёрнутым — `isDraggingFiles`
     * считается по этому же счётчику.
     *
     * @param event - Событие перетаскивания.
     */
    function handleDragEnter(event: DragEvent): void {
        event.preventDefault();

        if (!isEnabled()) {
            return;
        }

        dragDepth.value += 1;
        draggedFileCount.value = countDraggedFiles(event.dataTransfer);

        if (draggedFileCount.value > 0) {
            restartDragIdleWatchdog();
        }
    }

    /**
     * Сворачивает приёмник.
     *
     * Считается глубина, а не просто снимается флаг: `dragleave` приходит и при
     * переходе курсора на дочерний элемент, и без счётчика приёмник мигал бы на
     * каждой плитке под курсором.
     */
    function handleDragLeave(): void {
        dragDepth.value = Math.max(0, dragDepth.value - 1);

        if (dragDepth.value === 0) {
            resetFileDrop();
        }
    }

    /**
     * Принимает брошенные файлы.
     *
     * @param event - Событие drop.
     */
    function handleDrop(event: DragEvent): void {
        // Тот же порядок, что у `dragover`: брошенный файл гасится всегда, а
        // дальше решает право
        event.preventDefault();

        if (!isEnabled()) {
            return;
        }

        resetFileDrop();

        const files = event.dataTransfer?.files;

        if (!files || files.length === 0) {
            return;
        }

        options.onFiles(Array.from(files));
    }

    // Таймер обязан уйти вместе с компонентом: латч монтирования галерею не
    // размонтирует, но сброс сессии билдера — размонтирует
    onUnmounted(() => {
        stopDragIdleWatchdog();
    });

    return {
        draggedFileCount,
        isDraggingFiles,
        handleDragOver,
        handleDragEnter,
        handleDragLeave,
        handleDrop,
        resetFileDrop,
    };
}
