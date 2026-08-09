<script setup lang="ts">
/**
 * @description Постепенная загрузка изображения: заглушка ~32px → превью ~480px →
 * полный файл. Варианты готовит медиатека при загрузке файла, режим выбирает
 * место на странице (проп блока Media), а не сам файл.
 *
 * Два слоя, а не один меняющийся `src`: полный файл проявляется по `opacity`
 * поверх заглушки, поэтому смена этапа не даёт ни мигания, ни прыжка раскладки.
 * Внутри слоя заглушки src повышается mock → preview без перехода — превью к
 * этому моменту уже в кэше, и подмена происходит мгновенно.
 *
 * **До вьюпорта в разметке стоит прозрачный 1×1, а не превью.** Иначе страница со
 * сотней блоков скачивала бы сотню превью сразу, хотя видно два: полный файл был
 * бы отложен, а бо́льшая часть экономии — потеряна. Место под картинку в этот
 * момент держит `aspect-ratio` из пиксельных размеров файла; если размеров нет
 * (схемы, сохранённые до того, как они начали храниться), компонент возвращается
 * к превью в разметке — прыгающая раскладка хуже лишнего запроса.
 *
 * В `three-step` первым в разметку идёт не 1×1, а сам mock (~1 КБ): в этом и
 * смысл третьего этапа — что-то осмысленное на месте картинки до того, как
 * приедет превью. Ждать вьюпорта ему незачем, он дешевле накладных расходов на
 * отсрочку.
 *
 * Полный файл начинает грузиться, только когда кадр появился во вьюпорте
 * (`IntersectionObserver`). Исключение — `eager`: на первом экране откладывать
 * полный файл нельзя, он и есть LCP.
 *
 * Если вариантов нет (SVG, видео, файл загружен до их появления) или режим
 * выключен, компонент честно грузит полный файл сразу и ничем не отличается от
 * обычного `<img>` — показывать пустоту вместо картинки он не должен.
 *
 * Доступное имя живёт на корне, а не на слоях: слои монтируются и снимаются по
 * ходу загрузки, и пока полного файла в разметке нет, его `alt` был бы
 * недостижим — картинка ниже экрана просто отсутствовала бы в accessibility tree.
 */

// #region Imports
// Types
import type { IBricksImageProps, IBricksImageEmits } from './types.d.ts';

// Vue
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksImageProps>(), {
    alt: '',
    previewSrc: null,
    mockSrc: null,
    mode: 'off',
    eager: false,
    fit: 'cover',
    naturalWidth: null,
    naturalHeight: null,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksImageEmits>();
// #endregion

// #region Data
/**
 * Запас за краем вьюпорта: полный файл начинает грузиться до того, как кадр
 * доехал до экрана, иначе подмена происходит уже на виду.
 */
const OBSERVER_ROOT_MARGIN = '200px';
/**
 * Прозрачный GIF 1×1 в data-URI: занимает место в разметке, не стоя ни одного
 * запроса. Приём взят из библиотечного `VImage` — там он тоже стоит в `src`, пока
 * настоящий первый этап ждёт попадания во вьюпорт.
 */
const EMPTY_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const rootRef = ref<HTMLElement | null>(null);
/** Показан ли полный файл (загружен успешно). */
const isFullVisible = ref(false);

/**
 * Можно ли держать место под картинку без самой картинки. Только при известных
 * пиксельных размерах: `aspect-ratio` считается из них, а без него прозрачный
 * 1×1 дал бы нулевую высоту блоку с `height: auto`.
 *
 * Сверяются оба значения на конечность и строгую положительность, а не просто
 * truthiness: отрицательное число тоже truthy, и `-1 / 900` дало бы невалидную
 * пропорцию при включённом прозрачном 1×1 — то есть нулевую высоту, ровно то, от
 * чего проверка и защищает. Размеры приходят из схемы или внешнего backend'а,
 * гарантий на них нет.
 */
function hasKnownBox(): boolean {
    const width = Number(props.naturalWidth);
    const height = Number(props.naturalHeight);

    return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
}

/**
 * Что стоит в слое заглушки до попадания во вьюпорт. `null` — заглушки нет
 * вовсе, полный файл идёт сразу (режим выключен, `eager`, либо у файла нет
 * превью — SVG, видео, загрузка до появления вариантов).
 *
 * Обычная функция, а не computed: её результат нужен для НАЧАЛЬНЫХ значений
 * ref'ов ниже. Если начинать с пустого состояния и заполнять его в `onMounted`,
 * серверный рендер отдаёт пустой `<span>` без единого `<img>` — то есть `eager`
 * получает `fetchpriority="high"` уже после mount, когда он бесполезен.
 */
function resolveInitialPlaceholder(): string | null {
    if (props.mode === 'off' || props.eager) {
        return null;
    }

    // Mock — единственный этап, который имеет смысл держать в разметке сразу:
    // он и существует ради того, чтобы место не было пустым до превью. Проверка
    // идёт ДО отсутствия превью: у файла, которому построился mock, но не
    // построилось превью (варианты генерируются независимо), иначе не осталось бы
    // ни одного этапа, и постепенная загрузка молча отключалась бы
    if (props.mode === 'three-step' && props.mockSrc) {
        return props.mockSrc;
    }

    if (!props.previewSrc) {
        return null;
    }

    return hasKnownBox() ? EMPTY_GIF : props.previewSrc;
}

const placeholderSrc = ref<string | null>(resolveInitialPlaceholder());
/**
 * Нужно ли грузить полный файл (кадр во вьюпорте либо режим не откладывает).
 *
 * На сервере полный файл включается сразу только когда этапов нет: у `off` и
 * `eager` он и есть то, что должно попасть в разметку. Для постепенной загрузки
 * в SSR уходит заглушка — иначе браузер начал бы полную загрузку до того, как
 * `IntersectionObserver` вообще успеет появиться, и оптимизации не останется.
 */
const shouldLoadFull = ref(placeholderSrc.value === null);
let observer: IntersectionObserver | null = null;
let previewLoader: HTMLImageElement | null = null;
/**
 * Номер текущего состояния: предзагрузка превью сверяет его перед записью.
 * Без него `onload`, начатый для прошлого файла, подкладывал бы его превью под
 * новый полный файл — компонент переиспользуется при смене медиа у блока,
 * undo/redo и быстром переключении.
 */
let loadGeneration = 0;
// #endregion

// #region Computed
/** Показана именно заглушка ~32px — только её и нужно размывать. */
const isShowingMock = computed<boolean>(
    () => Boolean(props.mockSrc) && placeholderSrc.value === props.mockSrc
);
/**
 * Полный файл можно показывать: он загрузился, либо заглушки нет вовсе и
 * прятать его за прозрачностью не за чем.
 */
const isFullReady = computed<boolean>(() => isFullVisible.value || !placeholderSrc.value);
/**
 * Пропорция для корня. Ставится всегда, когда размеры известны, а не только под
 * 1×1: место под картинку тогда держится с первого кадра и не меняется ни при
 * одной подмене этапа.
 */
const boxStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {};

    if (hasKnownBox()) {
        style.aspectRatio = `${props.naturalWidth} / ${props.naturalHeight}`;
    }

    return style;
});
// #endregion

// #region Methods
/** Останавливает наблюдение за вьюпортом. */
function stopObserving(): void {
    observer?.disconnect();
    observer = null;
}

/**
 * Отменяет предзагрузку превью.
 *
 * Отдельно от `stopObserving`, а не одной функцией: обсервер снимается ровно в
 * тот момент, когда предзагрузка запускается, и общая «остановка всего» убивала
 * бы её сразу после старта.
 */
function cancelPreviewPreload(): void {
    if (!previewLoader) {
        return;
    }

    previewLoader.onload = null;
    previewLoader.onerror = null;
    previewLoader = null;
}

/**
 * Догружает превью в слой заглушки: mock показан, следующий этап — превью.
 * Подмена делается только после реальной загрузки, иначе на месте mock'а
 * мелькнул бы пустой кадр.
 */
function upgradePlaceholderToPreview(): void {
    const previewSrc = props.previewSrc;

    if (!previewSrc || placeholderSrc.value === previewSrc) {
        return;
    }

    cancelPreviewPreload();

    const generation = loadGeneration;
    const loader = new Image();

    loader.onload = (): void => {
        // Пропы могли смениться, пока грузилось: чужое превью под новым полным
        // файлом хуже, чем отсутствие этапа
        if (generation !== loadGeneration) {
            return;
        }

        placeholderSrc.value = previewSrc;
        previewLoader = null;
    };
    loader.onerror = (): void => {
        previewLoader = null;
    };
    loader.src = previewSrc;
    previewLoader = loader;
}

/**
 * Отказ заглушки. Она снимается и полный файл переезжает в поток: адрес варианта
 * мог устареть (файл перезагрузили, объект удалён), и без этого блок с
 * автовысотой остался бы нулевой высоты — то есть картинки не было бы вовсе.
 * Полный файл при этом уже не ждёт вьюпорт: ждать нечему, показывать нечего.
 */
function handlePlaceholderError(): void {
    placeholderSrc.value = null;
    shouldLoadFull.value = true;
}

/** Отмечает полный файл показанным. */
function handleFullLoad(): void {
    isFullVisible.value = true;
    emit('load');
}

/**
 * Отказ полного файла. Заглушка остаётся на экране: пустой кадр вместо картинки
 * хуже, чем её низкое разрешение.
 */
function handleFullError(): void {
    emit('error');
}

/** Ставит наблюдение за появлением кадра во вьюпорте. */
function startObserving(): void {
    const element = rootRef.value;

    // Без IntersectionObserver (старый браузер, SSR-гидрация до mount) грузим
    // сразу: постепенная загрузка — оптимизация, а не условие показа картинки
    if (!element || typeof IntersectionObserver === 'undefined') {
        shouldLoadFull.value = true;
        return;
    }

    observer = new IntersectionObserver(
        (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) {
                return;
            }

            shouldLoadFull.value = true;
            // Обсервер снимается ДО запуска предзагрузки: обратный порядок
            // отменял бы её же следом
            stopObserving();
            upgradePlaceholderToPreview();
        },
        { rootMargin: OBSERVER_ROOT_MARGIN }
    );
    observer.observe(element);
}

/**
 * Приводит состояние к текущим пропам: сбрасывает показанное и заново решает,
 * ждать вьюпорт или грузить сразу.
 */
function resetLoading(): void {
    stopObserving();
    cancelPreviewPreload();
    loadGeneration += 1;
    isFullVisible.value = false;

    const initial = resolveInitialPlaceholder();

    placeholderSrc.value = initial;
    shouldLoadFull.value = initial === null;

    if (initial !== null) {
        startObserving();
    }
}
// #endregion

// #region Lifecycle
/**
 * Начальное состояние уже посчитано синхронно (см. `placeholderSrc`), поэтому
 * здесь остаётся только подключить наблюдение — переустанавливать разметку
 * нельзя, она обязана совпасть с серверной.
 */
onMounted(() => {
    if (!shouldLoadFull.value) {
        startObserving();
    }
});

// Размеры в списке наравне с адресами: от них зависит выбор первого слоя
// (прозрачный 1×1 против превью), и смена одних размеров при том же адресе —
// undo, обновление данных извне — иначе оставляла бы 1×1 без пропорции, то есть
// квадрат 1:1 на месте картинки до попадания во вьюпорт
watch(
    () => [
        props.src,
        props.previewSrc,
        props.mockSrc,
        props.mode,
        props.eager,
        props.naturalWidth,
        props.naturalHeight,
    ],
    () => {
        resetLoading();
    }
);

onBeforeUnmount(() => {
    stopObserving();
    cancelPreviewPreload();
    // Дожившая до размонтирования предзагрузка иначе дёрнула бы ref мёртвого
    // компонента
    loadGeneration += 1;
});
// #endregion
</script>

<template>
    <!--
        Доступное имя на корне: слои монтируются и снимаются по ходу загрузки, и
        `alt` на них был бы недостижим, пока полного файла в разметке ещё нет.
        Без подписи картинка декоративна — корень тогда убирается из
        accessibility tree целиком, а не остаётся безымянным `role="img"`.
    -->
    <span
        ref="rootRef"
        :class="$style.BricksImage"
        :style="boxStyle"
        :role="props.alt ? 'img' : undefined"
        :aria-label="props.alt || undefined"
        :aria-hidden="props.alt ? undefined : 'true'"
    >
        <!--
            Заглушка держит поток и задаёт высоту обёртки, когда пропорция корню
            не задана: у неё та же пропорция, что у полного файла, поэтому
            `height: auto` работает как у обычного <img>. После показа полного она
            не размонтируется, а гаснет — иначе блок с автовысотой схлопнулся бы в
            ноль в момент подмены.
        -->
        <img
            v-if="placeholderSrc"
            :src="placeholderSrc"
            alt=""
            :class="[
                $style.layer,
                $style._flow,
                { [$style._blurred]: isShowingMock, [$style._hidden]: isFullVisible },
            ]"
            :style="{ objectFit: props.fit }"
            aria-hidden="true"
            decoding="async"
            @error="handlePlaceholderError"
        />

        <img
            v-if="shouldLoadFull"
            :src="props.src"
            alt=""
            :class="[
                $style.layer,
                placeholderSrc ? $style._overlay : $style._flow,
                { [$style._visible]: isFullReady },
            ]"
            :style="{ objectFit: props.fit }"
            :loading="props.eager ? 'eager' : 'lazy'"
            :fetchpriority="props.eager ? 'high' : undefined"
            aria-hidden="true"
            decoding="async"
            @load="handleFullLoad"
            @error="handleFullError"
        />
    </span>
</template>

<style module lang="scss">
/* `height: 100%` против контейнера с неопределённой высотой CSS резолвит в
   `auto` — поэтому компонент одинаково работает и в блоке с заданной высотой, и
   в блоке с `height: auto`, где высоту задаёт сама картинка.

   С этим же правилом сочетается инлайновый `aspect-ratio`: при определённой
   высоте контейнера побеждает `height`, при неопределённой — высоту даёт
   пропорция. Поэтому одна и та же вёрстка держит место и под прозрачным 1×1, и
   под настоящей картинкой. */
.BricksImage {
    position: relative;
    overflow: hidden;
    display: block;
    width: 100%;
    height: 100%;
}

.layer {
    display: block;
    width: 100%;
    height: 100%;
}

/* Слой в потоке — он и определяет высоту обёртки. */
._flow {
    position: relative;
}

/* Слой поверх потока: точно накрывает тот, что в потоке, и проявляется по
   opacity. Своей высоты не имеет и потому раскладку не двигает. */
._overlay {
    position: absolute;
    opacity: 0;
    transition: opacity var(--bricks-default-transition);
    inset: 0;

    &._visible {
        opacity: 1;
    }
}

/* Гаснет, но остаётся в потоке: место под картинку нужно держать и после того,
   как полный файл её накрыл. */
._hidden {
    opacity: 0;
}

/* Размывается только заглушка ~32px: растянутая до размера кадра, она иначе
   читается как испорченная картинка, а не как «ещё грузится». Превью ~480px в
   размытии не нуждается. */
._blurred {
    filter: blur(0.8rem);
    transform: scale(1.05);
}
</style>
