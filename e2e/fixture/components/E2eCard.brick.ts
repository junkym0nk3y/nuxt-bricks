import E2eCard from './E2eCard.vue';

export const brick = {
    category: 'E2E',
    description: 'Minimal component for browser-level contract tests',
    values: {
        headline: {
            default: 'E2E card',
            type: 'input',
        },
        // The gallery is here for the accessibility test of the sidebar editor: no
        // block of the package declares such a property, so without a consumer
        // component that editor cannot be opened in a browser at all
        gallery: {
            default: [],
            type: 'image-gallery',
        },
        // The JSON editor is reachable only through a property of type `object`, and
        // no block of the package declares one — without this property that editor
        // cannot be opened in a browser at all, so the accessibility gate would walk
        // past it
        meta: {
            default: { locale: 'en', tags: ['card'] },
            type: 'object',
        },
    },
};

export default E2eCard;
