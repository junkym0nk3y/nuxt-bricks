// #region Imports
// Types
import type { IAuthAvatarCropFrame, IUseAuthAvatarCropReturn } from '../types/auth';

// Utils
import {
    AUTH_AVATAR_CROP_CIRCLE_PX,
    clampCropOffset,
    isCroppableImage,
    resolveCenteredOffset,
    resolveCropFrame,
    resolveMaxCropZoom,
} from '../utils/avatarCropFrame';

// Vue
import { computed, onUnmounted, ref, watch } from 'vue';
// #endregion

/**
 * Кадрирование фото профиля: декодирование выбранного файла, масштаб, сдвиг и
 * рамка в координатах исходника.
 *
 * Размеры берутся у декодированного `<img>` (`naturalWidth`/`naturalHeight`), и
 * это не «как проще»: браузер применяет EXIF-ориентацию сам
 * (`image-orientation: from-image` — начальное значение), поэтому его размеры
 * совпадают с тем, что видит сервер, который читает их из
 * `metadata().autoOrient`. По неповёрнутым байтам законная рамка снимка,
 * сделанного портретом, отвергалась бы как выходящая за край.
 *
 * Object URL отзывается всегда — на закрытии, на следующем файле и на
 * размонтировании: билдер живёт всю сессию, модалку открывают многократно, и
 * блоб до 5 МБ на каждое открытие остался бы в памяти документа до перезагрузки.
 *
 * @returns Состояние кадрирования и операции над ним.
 */
export function useAuthAvatarCrop(): IUseAuthAvatarCropReturn {
    // #region Data
    const imageUrl = ref<string | null>(null);
    const zoom = ref(1);
    /** Размеры ориентированного изображения; нули — файла ещё нет. */
    const naturalWidth = ref(0);
    const naturalHeight = ref(0);
    /**
     * Сдвиг левого верхнего угла рамки в пикселях исходника — ДРОБНЫЙ.
     *
     * Округление живёт только в `resolveCropFrame`, на выходе. Считай жест от
     * округлённой рамки — и дробный остаток терялся бы на каждом событии: при
     * сильном приближении один пиксель экрана меньше половины пикселя исходника,
     * и медленное перетаскивание не двигало бы кадр вовсе, а на других масштабах
     * систематическое округление вверх уводило бы кадр быстрее курсора.
     */
    const offsetLeft = ref(0);
    const offsetTop = ref(0);
    /**
     * Номер открытия файла: декодирование асинхронно, и второй выбранный файл
     * может разрешиться раньше первого. Без сверки в состоянии остались бы
     * размеры одного снимка при показанном другом — то есть рамка уехала бы на
     * сервер не для того файла, а object URL опоздавшего утёк бы.
     */
    let openGeneration = 0;
    // #endregion

    // #region Computed
    const isReady = computed<boolean>(() => naturalWidth.value > 0 && naturalHeight.value > 0);

    const maxZoom = computed<number>(() =>
        isReady.value ? resolveMaxCropZoom(naturalWidth.value, naturalHeight.value) : 1
    );

    const frame = computed<IAuthAvatarCropFrame | null>(() => {
        if (!isReady.value) {
            return null;
        }

        return resolveCropFrame(
            naturalWidth.value,
            naturalHeight.value,
            zoom.value,
            offsetLeft.value,
            offsetTop.value
        );
    });

    /**
     * Показ снимка под кругом: масштаб переводит пиксели исходника в пиксели
     * экрана, сдвиг ставит рамку в центр круга. Считается от той же рамки, что
     * уходит на сервер, — иначе человек кадрировал бы одно, а получал другое.
     */
    const imageStyle = computed<Record<string, string>>(() => {
        const current = frame.value;
        const style: Record<string, string> = {};

        if (!current) {
            return style;
        }

        const scale = AUTH_AVATAR_CROP_CIRCLE_PX / current.side;

        style.width = `${naturalWidth.value * scale}px`;
        style.height = `${naturalHeight.value * scale}px`;
        style.transform = `translate(${-current.left * scale}px, ${-current.top * scale}px)`;

        return style;
    });
    // #endregion

    // #region Methods
    /**
     * Освобождает object URL и сбрасывает состояние.
     */
    function release(): void {
        // Начатое декодирование обесценивается: его результат относится к файлу,
        // которого на экране уже нет
        openGeneration += 1;

        if (imageUrl.value) {
            URL.revokeObjectURL(imageUrl.value);
        }

        imageUrl.value = null;
        naturalWidth.value = 0;
        naturalHeight.value = 0;
        offsetLeft.value = 0;
        offsetTop.value = 0;
        zoom.value = 1;
    }

    /**
     * Декодирует файл и ставит начальное кадрирование по центру.
     *
     * Отказ декодирования пробрасывается наружу: показать «выберите область» на
     * пустом кадре — значит предложить человеку кадрировать то, чего браузер не
     * прочитал. Слишком мелкий снимок отклоняется здесь же: сервер откажет ему
     * всё равно, а увеличивать тридцать пикселей до 256 бессмысленно.
     *
     * @param file - Выбранный файл фотографии.
     */
    async function openFile(file: File): Promise<void> {
        release();

        openGeneration += 1;

        const generation = openGeneration;
        const url = URL.createObjectURL(file);
        const image = new Image();

        image.src = url;

        try {
            await image.decode();
        } catch (error: unknown) {
            URL.revokeObjectURL(url);

            throw error;
        }

        // Пока декодировали, выбрали другой файл (или модалку закрыли): этот
        // снимок больше не тот, что на экране
        if (generation !== openGeneration) {
            URL.revokeObjectURL(url);

            return;
        }

        if (!isCroppableImage(image.naturalWidth, image.naturalHeight)) {
            URL.revokeObjectURL(url);

            throw new RangeError('Image is too small to crop');
        }

        imageUrl.value = url;
        naturalWidth.value = image.naturalWidth;
        naturalHeight.value = image.naturalHeight;
        zoom.value = 1;

        const side = Math.min(image.naturalWidth, image.naturalHeight);
        const centered = resolveCenteredOffset(image.naturalWidth, image.naturalHeight, side);

        offsetLeft.value = centered.left;
        offsetTop.value = centered.top;
    }

    /**
     * Двигает снимок под кругом.
     *
     * Смещение приходит в пикселях экрана и переводится в пиксели исходника:
     * рамка живёт в них, и жест обязан двигать её на столько же, на сколько
     * уехал палец. Знак обратный — тянут снимок, а рамка стоит на месте.
     *
     * Накапливается ДРОБНОЕ состояние, а не округлённая рамка: иначе шаг меньше
     * половины пикселя исходника отбрасывался бы целиком (при сильном
     * приближении это любое спокойное движение мышью), а шаг больше половины —
     * округлялся вверх, и кадр уезжал быстрее курсора.
     *
     * Кламп здесь обязателен: без него уход за край копил бы «долг» в дробном
     * состоянии, и обратно кадр не пошёл бы, пока этот долг не отработан.
     *
     * @param deltaX - Смещение курсора по горизонтали (px экрана).
     * @param deltaY - Смещение курсора по вертикали (px экрана).
     */
    function dragBy(deltaX: number, deltaY: number): void {
        const current = frame.value;

        if (!current) {
            return;
        }

        const scale = AUTH_AVATAR_CROP_CIRCLE_PX / current.side;

        offsetLeft.value = clampCropOffset(
            offsetLeft.value - deltaX / scale,
            naturalWidth.value - current.side
        );
        offsetTop.value = clampCropOffset(
            offsetTop.value - deltaY / scale,
            naturalHeight.value - current.side
        );
    }
    // #endregion

    // #region Lifecycle
    // Приближение держится за ЦЕНТР выбранной области, а не за её левый верхний
    // угол: угол оставлял бы центр уезжать вверх-влево, то есть наведённое лицо
    // уходило бы из круга на каждом движении слайдера — и вернуть его обратно
    // можно было бы только перетаскиванием
    watch(zoom, (nextZoom, previousZoom) => {
        const current = frame.value;

        if (!current || !isReady.value || nextZoom === previousZoom) {
            return;
        }

        const previousSide = resolveCropFrame(
            naturalWidth.value,
            naturalHeight.value,
            previousZoom,
            offsetLeft.value,
            offsetTop.value
        ).side;
        const shift = (previousSide - current.side) / 2;

        offsetLeft.value = clampCropOffset(
            offsetLeft.value + shift,
            naturalWidth.value - current.side
        );
        offsetTop.value = clampCropOffset(
            offsetTop.value + shift,
            naturalHeight.value - current.side
        );
    });

    onUnmounted(() => {
        release();
    });
    // #endregion

    return {
        imageUrl,
        zoom,
        maxZoom,
        imageStyle,
        frame,
        isReady,
        openFile,
        dragBy,
        release,
    };
}
