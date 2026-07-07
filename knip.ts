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
        // Публичный API потребителя: nuxt-bricks/persistence (exports в package.json)
        'src/runtime/modules/persistence/server/registry.ts',
        'playground/**/*.{ts,vue}',
    ],
    project: ['src/**/*.{ts,vue}'],
    ignore: ['playground/.nuxt/**'],
    ignoreDependencies: [/.*/],
    compilers: {
        vue: (text: string) =>
            [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gm)].map((m) => m[1]).join(';'),
    },
};
