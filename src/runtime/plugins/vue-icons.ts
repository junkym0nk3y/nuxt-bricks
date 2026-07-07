// plugins/vue-icons.ts
import { h, defineComponent, type Component, type PropType } from 'vue';
import { defineNuxtPlugin } from '#imports';
import { registerSystemIcons, resolveSystemIcon } from './icons/systemIconsRegistry';
import { runOnBuilderRoute } from './utils/builderRouteScope';

export default defineNuxtPlugin(async (nuxtApp) => {
    // Регистрируем глобальный компонент BricksIcon (ядро иконок — published/preview);
    // полный builder-набор доливается lazy-чанком только на /bricks
    nuxtApp.vueApp.component(
        'BricksIcon',
        defineComponent({
            props: {
                icon: {
                    type: [String, Object, Function] as PropType<string | Component>,
                    required: true,
                },
            },

            setup(props, { attrs }) {
                return () => {
                    let iconComponent: Component;

                    if (typeof props.icon === 'string') {
                        const resolved = resolveSystemIcon(props.icon);
                        if (!resolved) {
                            console.warn(`[BricksIcon] Icon not found: ${props.icon}`);
                            return null;
                        }
                        iconComponent = resolved;
                    } else {
                        iconComponent = props.icon;
                    }

                    return h(iconComponent, attrs);
                };
            },
        })
    );

    await runOnBuilderRoute(async () => {
        const { BUILDER_ICONS } = await import('./icons/builderIcons');
        registerSystemIcons(BUILDER_ICONS);
    });
});
