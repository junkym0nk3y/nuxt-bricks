import JsonEditorVue from 'json-editor-vue';
import { defineNuxtPlugin } from '#imports';

export default defineNuxtPlugin((nuxtApp) => {
    nuxtApp.vueApp.use(JsonEditorVue, {
        // global props & attrs (one-way data flow)
    });
});
