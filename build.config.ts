import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
    entries: [
        // CLI-скрипт миграций копируется в dist/cli как есть (без бандлинга).
        {
            builder: 'mkdist',
            input: 'src/cli',
            outDir: 'dist/cli',
        },
        // Публичный SCSS-API — исходниками, а не скомпилированным CSS.
        // Дефолтный mkdist партиалы `_*.scss` в dist не кладёт вовсе, а
        // не-партиалы компилирует в `.css`: миксины не доехали бы до потребителя
        // ни в каком виде. `builder: 'copy'` переносит файлы байт в байт.
        {
            builder: 'copy',
            input: 'src/runtime/assets/scss/public',
            outDir: 'dist/scss',
        },
    ],
    failOnWarn: false,
});
