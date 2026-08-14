// #region Imports
// Types
import type { IBricksDeviceChoice, TBricksPageDeviceSet } from '../../../common/types/devices';
import type {
    IPublishDeviceRange,
    IPublishDeviceRow,
    IPublishDeviceSetOptions,
} from '../types/devices';

// Vue
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Constants
import {
    BASE_DEVICE_KEY,
    DEVICE_CHOICES,
    DEVICE_MAX_WIDTH,
    DEVICE_MIN_WIDTH,
    DEVICE_SET_MAX,
    NARROW_DEVICE_KEY,
} from '../../../common/constants/devices';

// Utils
import {
    cloneDeviceSet,
    deviceRanges,
    validateDeviceSet,
} from '../../../common/utils/bricks/devices';
// #endregion

/**
 * Черновик набора устройств страницы для модалки «Устройства страницы».
 *
 * Правки живут здесь и уезжают в форму публикации только по «Сохранить»:
 * набор задаёт раскладку всей страницы, и применять его на каждый введённый
 * символ означало бы дёргать канвас и превью на промежуточных состояниях.
 *
 * @param options - Исходный набор страницы, набор проекта и активное устройство.
 */
export function usePublishDeviceSet(options: IPublishDeviceSetOptions) {
    // #region Data
    const { t } = useI18n();

    /** Свой набор у страницы (положение тумблера). */
    const isCustom = ref(false);

    /** Черновик: правится свободно, в форму уходит только по «Сохранить». */
    const draft = ref<TBricksPageDeviceSet>([]);
    // #endregion

    // #region Computed
    /**
     * Показываемый набор: свой черновик либо набор проекта в режиме чтения.
     */
    const shownDevices = computed<TBricksPageDeviceSet>(() =>
        isCustom.value
            ? draft.value
            : options.projectDevices().map(({ canvasHeight: _h, remBase: _r, ...device }) => device)
    );

    /**
     * Границы диапазона промежуточных устройств.
     *
     * По КЛЮЧАМ, а не по позициям: список пересортировывается на каждый ввод
     * ширины, и «первый»/«последний» — это просто самое узкое и самое широкое
     * на данный момент. Если задать мобильному 1400, он уедет в конец, и по
     * позициям крайними оказались бы планшет с десктопом — замок встал бы не на
     * то устройство, а невалидный набор прошёл бы проверку.
     */
    const bounds = computed(() => {
        const devices = shownDevices.value;
        const narrow = devices.find((d) => d.key === NARROW_DEVICE_KEY);
        const base = devices.find((d) => d.key === BASE_DEVICE_KEY);

        return {
            min: narrow?.width ?? DEVICE_MIN_WIDTH,
            max: base?.width ?? DEVICE_MAX_WIDTH,
            minLabel: narrow?.label ?? '',
            maxLabel: base?.label ?? '',
        };
    });

    const rows = computed<IPublishDeviceRow[]>(() =>
        shownDevices.value.map((device, index) => ({
            ...device,
            isLocked: device.key === NARROW_DEVICE_KEY || device.key === BASE_DEVICE_KEY,
            widthError: validateWidth(device, index),
            labelError: device.label.trim() ? '' : t('bricks.devices.errors.labelRequired'),
        }))
    );

    /**
     * Тот же набор, но упорядоченный по ширине.
     *
     * Порядок задаётся шириной, однако СТРОКИ таблицы, пока модалка открыта, не
     * переставляются: перестановка переносит DOM-узел строки, и всё, что в этот
     * момент связано с её позицией, ломается — ввод в поле ширины терял фокус
     * после первой цифры, а крестик соседней строки успевал приехать под
     * курсор между нажатием и отпусканием кнопки, из-за чего подтверждение
     * предлагало удалить не то устройство. Сортировка нужна не глазу, а
     * данным: `deviceRanges` берёт верхнюю границу у соседа справа, а серверный
     * контракт несортированный массив отклоняет — поэтому диапазоны, проверка
     * сохранения и значение для формы считаются по этой копии. Пользователь
     * видит новый порядок в шкале диапазонов сразу, а в таблице — при следующем
     * открытии модалки.
     */
    const sortedDevices = computed<TBricksPageDeviceSet>(() =>
        [...shownDevices.value].sort((a, b) => a.width - b.width)
    );

    const ranges = computed<IPublishDeviceRange[]>(() => {
        const devices = sortedDevices.value;
        const activeKey = options.activeDeviceKey();

        return deviceRanges(devices).map((range, index) => ({
            key: range.key,
            label: devices[index].label,
            icon: devices[index].icon,
            text: Number.isFinite(range.max)
                ? `${range.min} – ${range.max}`
                : t('bricks.devices.rangeFrom', { min: range.min }),
            isActive: range.key === activeKey,
        }));
    });

    /**
     * Устройства каталога, доступные к добавлению: ещё не в наборе и по ширине
     * попадают строго между крайними.
     *
     * Список, а не одна заготовка: устройство выбирается пользователем из меню, а
     * не подставляется молча — иначе «Добавить» на наборе из трёх давало бы
     * ровно один возможный исход, о котором пользователь узнавал бы после факта.
     */
    const availableChoices = computed<IBricksDeviceChoice[]>(() => {
        const occupied = new Set(draft.value.map((device) => device.key));

        return DEVICE_CHOICES.filter(
            (choice) =>
                !occupied.has(choice.key) &&
                choice.width > bounds.value.min &&
                choice.width < bounds.value.max
        );
    });

    const canAdd = computed<boolean>(
        () =>
            isCustom.value &&
            draft.value.length < DEVICE_SET_MAX &&
            availableChoices.value.length > 0
    );

    const hasErrors = computed<boolean>(() =>
        rows.value.some((row) => row.widthError || row.labelError)
    );

    /**
     * Сохранение доступно, только если черновик проходит тот же контракт, что и
     * сервер.
     *
     * Полевых ошибок мало: они не покрывают ни rem-поля, ни порядок массива, и
     * набор, прошедший только их, уехал бы в форму и упал бы 400 при сохранении
     * страницы — когда модалка уже закрыта и показать ошибку негде.
     */
    const canSave = computed<boolean>(
        () => !hasErrors.value && (!isCustom.value || validateDeviceSet(sortedDevices.value).ok)
    );
    // #endregion

    // #region Methods
    /**
     * Проверяет ширину устройства по правилам макета.
     *
     * @param device - Проверяемая запись.
     * @param index - Позиция записи в наборе.
     * @returns Текст ошибки либо пустая строка.
     */
    function validateWidth(device: { key: string; width: number }, index: number): string {
        const devices = shownDevices.value;

        if (!Number.isInteger(device.width) || device.width < DEVICE_MIN_WIDTH) {
            return t('bricks.devices.errors.widthMin', { min: DEVICE_MIN_WIDTH });
        }

        if (device.width > DEVICE_MAX_WIDTH) {
            return t('bricks.devices.errors.widthMax', { max: DEVICE_MAX_WIDTH });
        }

        const duplicate = devices.find(
            (other, otherIndex) => otherIndex !== index && other.width === device.width
        );

        if (duplicate) {
            return t('bricks.devices.errors.widthTaken', { label: duplicate.label });
        }

        const isEdge = device.key === NARROW_DEVICE_KEY || device.key === BASE_DEVICE_KEY;

        // Крайние обязаны остаться крайними: мобильный не шире всех
        // промежуточных, десктоп не уже
        if (isEdge && bounds.value.min >= bounds.value.max) {
            return t('bricks.devices.errors.edgeOrder');
        }

        if (!isEdge && (device.width <= bounds.value.min || device.width >= bounds.value.max)) {
            // Подписи крайних — по КЛЮЧАМ, как и сами границы: список
            // пересортирован по ширине, и позиционный `devices[0]` назвал бы
            // ошибке не то устройство ровно в тот момент, когда порядок нарушен
            return t('bricks.devices.errors.widthBetween', {
                min: bounds.value.min,
                minLabel: bounds.value.minLabel,
                max: bounds.value.max,
                maxLabel: bounds.value.maxLabel,
            });
        }

        return '';
    }

    /**
     * Включает или выключает собственный набор страницы.
     *
     * @param value - Новое положение тумблера.
     */
    function setCustom(value: boolean): void {
        // Копия снимается ДО переключения флага: `shownDevices` смотрит на него
        // и после переключения вернул бы уже пустой черновик — набор копировался
        // бы сам в себя
        if (value && draft.value.length === 0) {
            draft.value = shownDevices.value.map((device) => ({ ...device }));
        }

        isCustom.value = value;
    }

    /**
     * Правит поле устройства в черновике.
     *
     * @param key - Ключ устройства.
     * @param patch - Изменяемые поля.
     */
    function updateDevice(key: string, patch: Partial<IPublishDeviceRow>): void {
        draft.value = draft.value.map((device) =>
            device.key === key ? { ...device, ...patch } : device
        );
    }

    /**
     * Добавляет выбранное устройство каталога.
     *
     * Ключ берётся из каталога и дальше не меняется: подпись правится свободно, а
     * пересчёт ключа осиротил бы все `props.responsive[key]` блоков. Уникальность
     * ключа гарантирует сам выбор — занятые устройства в меню не показываются.
     *
     * @param key - Ключ устройства каталога.
     */
    function addDevice(key: string): void {
        const choice = availableChoices.value.find((item) => item.key === key);

        if (!canAdd.value || !choice) {
            return;
        }

        // Новая строка встаёт на своё место по ширине сразу: перестановка здесь
        // безопасна, курсор в этот момент не над таблицей и не в поле ввода —
        // пользователь только что выбрал устройство в меню
        draft.value = [
            ...draft.value,
            {
                key: choice.key,
                label: choice.label,
                icon: choice.icon,
                width: choice.width,
                aside: choice.aside,
                ...(choice.maxWidth === undefined ? {} : { maxWidth: choice.maxWidth }),
            },
        ].sort((a, b) => a.width - b.width);
    }

    /**
     * Удаляет промежуточное устройство из черновика.
     *
     * @param key - Ключ устройства.
     */
    function removeDevice(key: string): void {
        if (key === NARROW_DEVICE_KEY || key === BASE_DEVICE_KEY) {
            return;
        }

        draft.value = draft.value.filter((device) => device.key !== key);
    }

    /**
     * Собирает значение для формы публикации.
     *
     * Отдаётся отсортированный набор независимо от порядка строк: перестановка
     * отложена до конца ввода, а сервер несортированный массив отклоняет.
     *
     * @returns Набор страницы либо `null` (наследование набора проекта).
     */
    function toFormValue(): TBricksPageDeviceSet | null {
        return isCustom.value ? cloneDeviceSet(sortedDevices.value) : null;
    }
    // #endregion

    // #region Lifecycle
    /**
     * Пересобирает черновик из набора страницы.
     */
    function resetDraft(): void {
        const config = options.initial();

        isCustom.value = config !== null;
        draft.value = config ? config.map((device) => ({ ...device })) : [];
    }

    /**
     * Черновик пересобирается на КАЖДОЕ открытие модалки, а не только при смене
     * набора.
     *
     * Модалка остаётся смонтированной у обоих родителей, поэтому «поправил
     * ширину → Отмена → открыл снова» показывал бы прежние несохранённые
     * правки: отменять было нечему, watcher по `initial` не срабатывал —
     * сохранённый набор не менялся.
     */
    // `flush: 'sync'` — черновик обязан быть свежим до первого рендера строк,
    // иначе кадр показывает прежние правки
    watch(
        options.isOpen,
        (isOpen) => {
            if (isOpen) {
                resetDraft();
            }
        },
        { flush: 'sync' }
    );

    // Смена набора извне (переключение страницы в билдере, восстановление
    // черновика) тоже должна доезжать до модалки
    watch(options.initial, resetDraft, { immediate: true });
    // #endregion

    return {
        isCustom,
        rows,
        ranges,
        availableChoices,
        canAdd,
        canSave,
        addDevice,
        removeDevice,
        updateDevice,
        setCustom,
        toFormValue,
    };
}
