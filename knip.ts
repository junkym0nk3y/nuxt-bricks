export default {
    entry: [
        'src/module.ts',
        'src/cli/**/*.{ts,mjs}',
        'build.config.ts',
        'src/runtime/plugins/**/*.ts',
        'src/runtime/server/**/*.ts',
        'src/runtime/middleware/**/*.ts',
        'src/runtime/layouts/**/*.vue',
        'src/runtime/modules/**/pages/**/*.vue',
        'src/runtime/modules/layouts-blocks/registry.ts',
        'src/runtime/modules/layouts-blocks/canvasBlockComponents.ts',
        // Публичный API потребителя: nuxt-bricks/persistence и nuxt-bricks/sanitize (exports в package.json)
        'src/runtime/modules/persistence/server/registry.ts',
        'src/runtime/modules/common/utils/sanitize/index.ts',
        'playground/**/*.{ts,vue}',
        // Юнит-тесты — законные потребители экспортов (иначе тестируемые
        // хелперы вроде RequestError флагаются как unused)
        'test/**/*.spec.ts',
    ],
    project: ['src/**/*.{ts,vue}'],
    ignore: ['playground/.nuxt/**'],
    ignoreDependencies: [/.*/],
    compilers: {
        vue: (text: string) =>
            [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gm)].map((m) => m[1]).join(';'),
    },
};
