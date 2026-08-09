import type { IComponentsPropertyActions, IComponentsStore } from '../types';
import type { TBricksDeviceKey, TBrickPropValue } from '../../../../common/types/brick';

// Utils
import { useDebounceFn } from '@vueuse/core';

/**
 * Debounced saveToHistory для property-обновлений.
 * Предотвращает десятки сериализаций при быстром изменении значений (напр. кнопки +/-).
 */
const debouncedSaveToHistory = useDebounceFn((store: IComponentsStore) => {
    store.saveToHistory();
}, 300);

/**
 * Действия по обновлению props уже размещённых компонентов.
 */
export const propertyActions: IComponentsPropertyActions = {
    /**
     * Обновляет значение конкретного пропса с приведением типов (строка → число и т.д.).
     *
     * @param id - Идентификатор компонента.
     * @param propName - Имя редактируемого свойства.
     * @param value - Новое значение из UI.
     */
    updateComponentProp(
        this: IComponentsStore,
        id: string,
        propName: string,
        value: TBrickPropValue
    ) {
        const component = this.getComponentById(id);
        if (!component) {
            console.warn('[Bricks Store] updateComponentProp: component not found', id);
            return;
        }

        let finalValue: TBrickPropValue = value;

        if (typeof value === 'string') {
            const trimmedValue = value.trim();
            if (trimmedValue === '') {
                finalValue = '';
            } else if (/^-?\d+(\.\d+)?$/.test(trimmedValue)) {
                const numValue = Number(trimmedValue);
                if (!Number.isNaN(numValue)) {
                    finalValue = numValue;
                }
            }
        }

        component.props = {
            ...component.props,
            [propName]: finalValue,
        };

        debouncedSaveToHistory(this);
    },

    /**
     * Записывает набор пропсов, описывающих ОДНУ сущность, одним изменением —
     * и снимает их per-device переопределения.
     *
     * Нужно выбору картинки из галереи. Адрес файла, адреса его уменьшенных
     * вариантов и его пиксельные размеры — это один неделимый факт «выбран этот
     * файл». Пока они писались по отдельности, выбор на mobile разъезжался:
     * `src` уходил в `responsive.mobile` (свойство responsive-блока), а варианты
     * и размеры ложились в базовые props. Канвас на desktop показывал адрес
     * прежнего файла в пропорции нового и подменял его превью, а published,
     * который per-device адрес не читает вовсе, — прежний файл целиком.
     *
     * Снятие переопределений обязательно: без него та же рассинхронизация
     * сохранялась бы в схемах, отредактированных до этой правки.
     *
     * @param id - Идентификатор компонента.
     * @param patch - Пропсы сущности целиком.
     */
    updateComponentIdentityProps(
        this: IComponentsStore,
        id: string,
        patch: Record<string, TBrickPropValue>
    ) {
        const component = this.getComponentById(id);

        if (!component) {
            console.warn('[Bricks Store] updateComponentIdentityProps: component not found', id);
            return;
        }

        const currentProps = component.props as Record<string, unknown>;
        const responsive = currentProps.responsive as Record<string, unknown> | undefined;
        const patchedKeys = Object.keys(patch);
        const nextResponsive: Record<string, unknown> = {};

        for (const [device, overrides] of Object.entries(responsive ?? {})) {
            const kept = Object.fromEntries(
                Object.entries((overrides ?? {}) as Record<string, unknown>).filter(
                    ([key]) => !patchedKeys.includes(key)
                )
            );

            if (Object.keys(kept).length > 0) {
                nextResponsive[device] = kept;
            }
        }

        component.props = {
            ...currentProps,
            ...patch,
            ...(Object.keys(nextResponsive).length > 0 ? { responsive: nextResponsive } : {}),
        };

        // Пустой `responsive` не оставляем ключом-пустышкой: сериализованная схема
        // иначе копит `responsive: {}` у каждого тронутого блока
        if (Object.keys(nextResponsive).length === 0) {
            delete (component.props as Record<string, unknown>).responsive;
        }

        debouncedSaveToHistory(this);
    },

    /**
     * Обновляет значение пропса в `props.responsive[device]` для responsive layout-настроек.
     *
     * @param id - Идентификатор компонента.
     * @param device - Устройство (mobile/tablet/desktop).
     * @param propName - Имя редактируемого свойства.
     * @param value - Новое значение из UI.
     */
    updateComponentResponsiveProp(
        this: IComponentsStore,
        id: string,
        device: TBricksDeviceKey,
        propName: string,
        value: TBrickPropValue
    ) {
        const component = this.getComponentById(id);
        if (!component) {
            console.warn('[Bricks Store] updateComponentResponsiveProp: component not found', id);
            return;
        }

        let finalValue: TBrickPropValue = value;

        if (typeof value === 'string') {
            const trimmedValue = value.trim();
            if (trimmedValue === '') {
                finalValue = '';
            } else if (/^-?\d+(\.\d+)?$/.test(trimmedValue)) {
                const numValue = Number(trimmedValue);
                if (!Number.isNaN(numValue)) {
                    finalValue = numValue;
                }
            }
        }

        const currentProps = component.props as Record<string, unknown>;
        const responsive = (currentProps.responsive ?? {}) as Record<string, unknown>;
        const deviceOverrides = ((responsive as Record<string, unknown>)[device] ?? {}) as Record<
            string,
            unknown
        >;

        component.props = {
            ...currentProps,
            responsive: {
                ...responsive,
                [device]: {
                    ...deviceOverrides,
                    [propName]: finalValue,
                },
            },
        };

        debouncedSaveToHistory(this);
    },

    /**
     * Удаляет все responsive overrides для выбранного устройства.
     *
     * @param id - Идентификатор компонента.
     * @param device - Устройство (mobile/tablet/desktop).
     */
    resetComponentResponsivePropsForDevice(
        this: IComponentsStore,
        id: string,
        device: TBricksDeviceKey
    ) {
        const component = this.getComponentById(id);
        if (!component) {
            console.warn(
                '[Bricks Store] resetComponentResponsivePropsForDevice: component not found',
                id
            );
            return;
        }

        const currentProps = component.props as Record<string, unknown>;
        const responsive = (currentProps.responsive ?? {}) as Record<string, unknown>;

        if (!(device in responsive)) {
            return;
        }

        const { [device]: _removed, ...rest } = responsive as Record<string, unknown>;

        const nextResponsive = rest;

        if (Object.keys(nextResponsive).length === 0) {
            const { responsive: _responsiveKey, ...withoutResponsive } = currentProps;
            component.props = {
                ...withoutResponsive,
            };
        } else {
            component.props = {
                ...currentProps,
                responsive: nextResponsive,
            };
        }

        this.saveToHistory();
    },
};
