import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
    entries: [
        // The migration CLI script is copied into dist/cli as is, unbundled.
        {
            builder: 'mkdist',
            input: 'src/cli',
            outDir: 'dist/cli',
        },
        // The public SCSS API ships as sources, not as compiled CSS. The default
        // mkdist builder drops `_*.scss` partials from dist entirely and compiles
        // non-partials into `.css`: the mixins would reach the consumer in no form
        // at all. `builder: 'copy'` moves the files byte for byte.
        {
            builder: 'copy',
            input: 'src/runtime/assets/scss/public',
            outDir: 'dist/scss',
        },
    ],
    failOnWarn: false,
});
