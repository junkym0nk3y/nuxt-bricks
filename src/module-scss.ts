/**
 * Доставка публичного SCSS-API до потребителя.
 *
 * Миксины должны считать брейкпоинты по тем же числам, что рантайм, поэтому
 * резолвнутый набор устройств пишется в файл `buildDir` и подключается алиасом
 * `#bricks-scss`.
 *
 * Автоматического препенда через `vite.css.preprocessorOptions.scss.additionalData`
 * здесь НЕТ намеренно: он применяется ко всем компилируемым SCSS, включая блоки
 * `<style module>`, и ломает CSS Modules во всём приложении — классы приезжают
 * пустыми (`class="undefined"`), интерфейс остаётся без стилей. Проверено вживую
 * на playground. Поэтому `@use '#bricks-scss' as bricks;` автор брика пишет сам,
 * первой строкой своего блока стилей.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { addTemplate } from '@nuxt/kit';
import type { Nuxt } from '@nuxt/schema';
import type { TBricksProjectDeviceSet } from './runtime/modules/common/types/devices';

/** Алиас, под которым потребитель видит сгенерированную карту и миксины. */
const BRICKS_SCSS_ALIAS = '#bricks-scss';

/**
 * Резолвит путь к `mixins.scss`, на который ссылается сгенерированный мост.
 *
 * В исходниках файл лежит рядом с рантаймом, а в собранном пакете — копией в
 * `dist/scss`: mkdist партиалы `_*.scss` не переносит вовсе, а не-партиалы
 * компилирует в `.css`, поэтому по runtime-пути в установленном пакете лежит
 * `mixins.css`. `@forward` на несуществующий `.scss` уронил бы сборку
 * потребителя с «Can't find stylesheet to import» — берём тот путь, который
 * существует, тем же приёмом, что и остальные стили модуля.
 *
 * @param runtimeDir - Абсолютный путь к каталогу рантайма модуля.
 * @returns Абсолютный путь к файлу миксинов.
 */
export function resolveBricksMixinsPath(runtimeDir: string): string {
    const sourcePath = resolve(runtimeDir, 'assets/scss/public/mixins.scss');

    return existsSync(sourcePath) ? sourcePath : resolve(runtimeDir, '../scss/mixins.scss');
}

/**
 * Собирает содержимое файла-моста: пробрасывает публичные миксины с картой
 * устройств проекта.
 *
 * @param devices - Резолвнутый набор устройств проекта.
 * @param mixinsPath - Абсолютный путь к `mixins.scss` пакета.
 * @returns Содержимое SCSS-файла.
 */
export function buildBricksScssTemplate(
    devices: TBricksProjectDeviceSet,
    mixinsPath: string
): string {
    const entries = devices.map((device) => `        ${device.key}: ${device.width},`).join('\n');

    return `// Сгенерировано модулем nuxt-bricks: карта устройств проекта.
// Правится опцией bricks.devices в nuxt.config — здесь править нечего.
@forward '${mixinsPath.replace(/\\/g, '/')}' with (
    $devices: (
${entries}
    )
);
`;
}

/**
 * Регистрирует SCSS-мост: шаблон с картой устройств и алиас `#bricks-scss`.
 *
 * @param nuxt - Инстанс Nuxt.
 * @param devices - Резолвнутый набор устройств проекта.
 * @param mixinsPath - Абсолютный путь к `mixins.scss` пакета.
 */
export function setupBricksScss(
    nuxt: Nuxt,
    devices: TBricksProjectDeviceSet,
    mixinsPath: string
): void {
    // addTemplate, а не прямая запись в buildDir: buildDir очищается после
    // setup'а, и записанный руками файл до сборки не доживает
    const template = addTemplate({
        filename: 'bricks-scss.scss',
        write: true,
        getContents: () => buildBricksScssTemplate(devices, mixinsPath),
    });

    nuxt.options.alias[BRICKS_SCSS_ALIAS] = template.dst;
}
