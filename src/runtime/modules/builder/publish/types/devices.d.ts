/**
 * Типы редактора набора устройств страницы.
 */

import type {
    IBricksDeviceChoice,
    IBricksPageDevice,
    IBricksResolvedDevice,
    TBricksPageDeviceSet,
} from '../../../common/types/devices';

/** Пропсы меню добавления устройства. */
export interface IPublishDeviceAddMenuProps {
    /** Устройства каталога, доступные к добавлению. */
    choices: IBricksDeviceChoice[];
    /** Счётчик набора рядом с подписью: «3 из 4». */
    counter: string;
    disabled?: boolean;
}

/** События меню добавления устройства. */
export interface IPublishDeviceAddMenuEmits {
    /** Выбрано устройство каталога. */
    select: [key: string];
}

/**
 * Строка таблицы редактора.
 *
 * Ошибка ширины лежит в строке, а не общим списком: она печатается под своим
 * полем, и связать её с записью по индексу после пересортировки было бы нечем.
 */
export interface IPublishDeviceRow extends IBricksPageDevice {
    /** Крайнее устройство: удалить нельзя, вместо крестика — замок. */
    isLocked: boolean;
    /** Текст ошибки поля ширины; пустая строка — ошибки нет. */
    widthError: string;
    /** Текст ошибки поля названия; пустая строка — ошибки нет. */
    labelError: string;
}

/** Сегмент шкалы диапазонов под таблицей. */
export interface IPublishDeviceRange {
    key: string;
    label: string;
    icon: string;
    /** Подпись диапазона: «0 – 767» либо «от 1600». */
    text: string;
    /** Устройство открыто на канвасе — сегмент подсвечен рамкой. */
    isActive: boolean;
}

/** Что теряется при удалении устройства — для текста подтверждения. */
export interface IPublishDeviceRemovalImpact {
    /** Число переопределений свойств блоков, привязанных к устройству. */
    overridesCount: number;
    /** Подпись устройства, которому достаётся освободившийся диапазон. */
    absorbedBy: string;
    /** Диапазон, который переходит соседу: «1280–1599». */
    absorbedRange: string;
}

/** Опции редактора набора. */
export interface IPublishDeviceSetOptions {
    /** Открыта ли модалка: на каждое открытие черновик пересобирается заново. */
    isOpen: () => boolean;
    /** Набор страницы на момент открытия; `null` — наследуется от проекта. */
    initial: () => TBricksPageDeviceSet | null;
    /** Резолвнутый набор проекта — то, что показывает выключенный тумблер. */
    projectDevices: () => IBricksResolvedDevice[];
    /** Ключ устройства, открытого на канвасе (подсветка сегмента шкалы). */
    activeDeviceKey: () => string;
}
