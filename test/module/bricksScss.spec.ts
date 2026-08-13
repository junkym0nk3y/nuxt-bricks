// #region Imports
// Node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Vitest
import { describe, expect, it } from 'vitest';

// Constants
import { DEFAULT_BRICKS_DEVICES } from '../../src/runtime/modules/common/constants/devices';

// Utils
import { buildBricksScssTemplate, resolveBricksMixinsPath } from '../../src/module-scss';
// #endregion

const MIXINS_PATH = '/pkg/dist/scss/mixins.scss';

const SOURCE_RUNTIME_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/runtime');

describe('buildBricksScssTemplate', () => {
    it('карта совпадает с набором устройств проекта', () => {
        const scss = buildBricksScssTemplate(DEFAULT_BRICKS_DEVICES, MIXINS_PATH);

        for (const device of DEFAULT_BRICKS_DEVICES) {
            expect(scss).toContain(`${device.key}: ${device.width},`);
        }
    });

    it('пробрасывает миксины пакета, а не переобъявляет их', () => {
        expect(buildBricksScssTemplate(DEFAULT_BRICKS_DEVICES, MIXINS_PATH)).toContain(
            `@forward '${MIXINS_PATH}' with (`
        );
    });

    it('windows-путь нормализуется: Sass понимает только прямые слэши', () => {
        const scss = buildBricksScssTemplate(
            DEFAULT_BRICKS_DEVICES,
            'C:\\pkg\\dist\\scss\\mixins.scss'
        );

        expect(scss).toContain("@forward 'C:/pkg/dist/scss/mixins.scss' with (");
    });
});

describe('resolveBricksMixinsPath', () => {
    it('в исходниках берёт файл рядом с рантаймом', () => {
        expect(resolveBricksMixinsPath(SOURCE_RUNTIME_DIR)).toBe(
            resolve(SOURCE_RUNTIME_DIR, 'assets/scss/public/mixins.scss')
        );
    });

    it('в собранном пакете берёт копию из dist/scss', () => {
        // mkdist партиалы не переносит, а не-партиалы компилирует в .css: по
        // runtime-пути в установленном пакете лежит mixins.css, и @forward на
        // .scss уронил бы сборку потребителя. Исходники кладёт туда build.config
        expect(resolveBricksMixinsPath('/pkg/dist/runtime')).toBe('/pkg/dist/scss/mixins.scss');
    });
});
