// plugins/vue-icons.ts
import { h, defineComponent, type Component, type PropType } from 'vue';
import { defineNuxtPlugin } from '#imports';
import { registerSystemIcons, resolveSystemIcon } from './icons/systemIconsRegistry';
import { runOnBricksSurface, runOnBuilderRoute } from './utils/builderRouteScope';

export default defineNuxtPlugin(async (nuxtApp) => {
    // Registering the global BricksIcon component (the icon core — published and
    // preview); the full builder set is topped up by a lazy chunk on the builder
    // routes alone
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

    // The device glyphs are needed by the builder (picking an icon, the tabs, the
    // flyout) and by the preview (the banner of the current device) alike — hence a
    // chunk of their own on both surfaces
    await runOnBricksSurface(async () => {
        const { DEVICE_ICONS } = await import('./icons/deviceIcons');
        registerSystemIcons(DEVICE_ICONS);
    });

    await runOnBuilderRoute(async () => {
        const { BUILDER_ICONS } = await import('./icons/builderIcons');
        registerSystemIcons(BUILDER_ICONS);
    });
});
