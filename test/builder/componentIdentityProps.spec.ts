/**
 * Идентичность файла у блока пишется одним изменением в базовые props.
 *
 * Прежде адрес файла уходил через панель в `responsive[scope]` (у Media все пропсы
 * device-scoped), а его спутники — варианты и пиксельные размеры — ложились в
 * базовые. Выбор картинки на mobile разъезжался: канвас на desktop показывал
 * адрес прежнего файла в пропорции нового и подменял его чужим превью, а
 * published per-device адрес не читает вовсе и брал прежний файл целиком.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Utils
import { propertyActions } from '../../src/runtime/modules/builder/core/stores/actions/properties';
// #endregion

// #region Helpers
/**
 * Минимальный стор с одним компонентом — контракту действия больше ничего не нужно.
 *
 * @param props - Начальные пропсы компонента.
 */
function makeStore(props: Record<string, unknown>) {
    const component = { id: 'c1', props };

    return {
        component,
        getComponentById: () => component,
        // История здесь не проверяется: запись в неё дебаунсится и к раскладке
        // пропсов отношения не имеет
        saveToHistory: vi.fn(),
    };
}
// #endregion

describe('updateComponentIdentityProps', () => {
    it('пишет весь набор в базовые props', () => {
        const store = makeStore({ src: 'a.webp', width: '100%' });

        propertyActions.updateComponentIdentityProps.call(store as never, 'c1', {
            src: 'b.webp',
            previewSrc: 'b-preview.webp',
            naturalWidth: 800,
        } as never);

        expect(store.component.props).toMatchObject({
            src: 'b.webp',
            previewSrc: 'b-preview.webp',
            naturalWidth: 800,
            width: '100%',
        });
    });

    it('снимает per-device переопределения тех же пропсов', () => {
        // Без этого рассинхрон сохранялся бы в схемах, отредактированных раньше:
        // канвас на mobile продолжал бы показывать адрес прошлого файла
        const store = makeStore({
            src: 'a.webp',
            responsive: {
                mobile: { src: 'a-mobile.webp', width: '50%' },
                tablet: { src: 'a-tablet.webp' },
            },
        });

        propertyActions.updateComponentIdentityProps.call(store as never, 'c1', {
            src: 'b.webp',
        } as never);

        const responsive = (store.component.props as Record<string, unknown>).responsive as Record<
            string,
            unknown
        >;

        expect(responsive.mobile).toEqual({ width: '50%' });
        // Переопределение осталось бы пустым объектом — устройство выбрасывается
        expect(responsive).not.toHaveProperty('tablet');
    });

    it('сохраняет позицию ключа responsive среди пропсов', () => {
        // Позиция значима: снимки черновика сравниваются как `JSON.stringify`
        // (`publish/utils/draftSnapshots`), и уехавший в конец ключ превратил бы две
        // семантически равные схемы в разные — чистый черновик пометился бы грязным
        const store = makeStore({
            src: 'a.webp',
            responsive: { mobile: { width: '50%' } },
            title: 'Caption',
        });

        propertyActions.updateComponentIdentityProps.call(store as never, 'c1', {
            src: 'b.webp',
        } as never);

        expect(Object.keys(store.component.props)).toEqual(['src', 'responsive', 'title']);
    });

    it('не оставляет пустой ключ responsive в сериализуемой схеме', () => {
        const store = makeStore({ src: 'a.webp', responsive: { mobile: { src: 'a-m.webp' } } });

        propertyActions.updateComponentIdentityProps.call(store as never, 'c1', {
            src: 'b.webp',
        } as never);

        expect(store.component.props).not.toHaveProperty('responsive');
    });
});
