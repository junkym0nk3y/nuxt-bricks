import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
    // CLI-генератор brick-манифеста копируется в dist/cli как есть (без бандлинга).
    entries: [
        {
            builder: 'mkdist',
            input: 'src/cli',
            outDir: 'dist/cli',
        },
    ],
    failOnWarn: false,
});
