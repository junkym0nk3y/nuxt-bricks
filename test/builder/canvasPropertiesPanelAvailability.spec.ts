// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Vue
import { effectScope, nextTick, ref, type EffectScope } from 'vue';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';

// Composables и сторы билдера
import { useCanvas } from '../../src/runtime/modules/builder/canvas/viewport/composables/useCanvas';
import { usePropertiesPanelAvailability } from '../../src/runtime/modules/builder/core/composables/usePropertiesPanelAvailability';
import { useComponentsStore } from '../../src/runtime/modules/builder/core/stores/components';
import { useSidebarStore } from '../../src/runtime/modules/builder/core/stores/sidebar';
// #endregion

/**
 * Панель свойств монтируется только с правом правки, а её ширину вычитают из
 * канваса ширина контейнера, смещение тулбара и перецентровка. Выбор блока при
 * этом разрешён любой роли — это подсветка, а не правка, — поэтому «панель
 * недоступна» обязано жить в сторе: иначе клик наблюдателя резервировал бы
 * место под панель, которой нет, и канвас сжимался бы под пустоту.
 */

/** Компонент канваса, по которому идёт выбор. */
function buildComponent(): IBricksComponent {
    return {
        id: 'c1',
        type: 'component',
        componentName: 'Text',
        brickPath: '/components/Text.brick.ts',
        zIndex: 1,
        props: { text: 'Текст' },
    };
}

describe('доступность панели свойств: выбор блока и геометрия канваса', () => {
    let scope: EffectScope;

    beforeEach(() => {
        setActivePinia(createPinia());
        scope = effectScope();
    });

    afterEach(() => {
        scope.stop();
    });

    /**
     * Выбирает единственный компонент схемы — тот же путь, которым идут клик по
     * блоку на канвасе и строка дерева схемы.
     */
    function selectComponent(): void {
        const componentsStore = useComponentsStore();

        componentsStore.loadSchema({ components: [buildComponent()] }, { resetHistory: true });
        componentsStore.selectComponent('c1', []);
    }

    it('с правом правки выбор блока открывает панель', () => {
        const sidebarStore = useSidebarStore();

        selectComponent();

        expect(sidebarStore.right.visible).toBe(true);
    });

    it('без права правки выбор блока панель не открывает', () => {
        const sidebarStore = useSidebarStore();
        sidebarStore.setPropertiesPanelAvailable(false);

        selectComponent();

        // Сам выбор при этом состоялся: наблюдателю подсветка доступна
        expect(useComponentsStore().selectedComponent?.id).toBe('c1');
        expect(sidebarStore.right.visible).toBe(false);
    });

    it('отзыв доступности закрывает уже открытую панель', () => {
        // Роль приезжает запросом в сборках без SSR, то есть право могут отобрать
        // после того, как панель уже открыли
        const sidebarStore = useSidebarStore();
        selectComponent();

        sidebarStore.setPropertiesPanelAvailable(false);

        expect(sidebarStore.right.visible).toBe(false);
    });

    it('проводка от права правки: недоступность приходит из canEdit и следует за ним', async () => {
        // Роль в сборках без SSR приезжает запросом после первого кадра, поэтому
        // проводка наблюдает право, а не читает его однажды
        const sidebarStore = useSidebarStore();
        const canEdit = ref(false);

        scope.run(() => {
            usePropertiesPanelAvailability(canEdit);
        });

        selectComponent();
        expect(sidebarStore.right.visible).toBe(false);

        canEdit.value = true;
        await nextTick();
        useComponentsStore().selectComponent('c1', []);

        expect(sidebarStore.right.visible).toBe(true);

        // Право отобрали у открытой панели — она закрывается, а не остаётся
        // висеть шириной, которую канвас продолжал бы вычитать
        canEdit.value = false;
        await nextTick();

        expect(sidebarStore.right.visible).toBe(false);
    });

    it('ширина канваса не вычитает панель, которой нет на экране', () => {
        const sidebarStore = useSidebarStore();
        sidebarStore.setPropertiesPanelAvailable(false);

        const canvas = scope.run(() => useCanvas());
        selectComponent();

        // Без флага здесь стояло бы `- 35rem` — те самые пустые 35rem справа,
        // под которые канвас сжимался и пересчитывал масштаб
        expect(canvas?.canvasContainerStyle.value.width).toBe('calc(100vw - 0px - 7.2rem - 0px)');
    });
});
