import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
    // CLI-скрипты (миграции, хеш пароля) копируются в dist/cli как есть (без бандлинга).
    entries: [
        {
            builder: 'mkdist',
            input: 'src/cli',
            outDir: 'dist/cli',
        },
    ],
    failOnWarn: false,
});
