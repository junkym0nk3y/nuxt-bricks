/**
 * Типы генератора манифеста brick-компонентов (`src/bricks-manifest.ts`):
 * параметры скана и контракт сериализованной очереди. Сам манифест — общий с
 * рантаймом контракт из `runtime/modules/common/types/brickManifest.d.ts`.
 */
import type { IBricksManifest } from '../runtime/modules/common/types/brickManifest';

/** Параметры генерации манифеста. */
export interface IBricksManifestOptions {
    /** `nuxt.options.srcDir` — база и для поиска файлов, и для ключей загрузчика. */
    srcDir: string;
    /** Каталог манифеста (см. resolveBricksManifestDir). */
    manifestDir: string;
}

/** Сериализованная очередь генерации манифеста (см. createBricksManifestQueue). */
export interface IBricksManifestQueue {
    /**
     * Ставит генерацию в очередь. Возвращённый промис всегда относится к скану,
     * начавшемуся после вызова; после `dispose()` — к `undefined`.
     */
    enqueue: () => Promise<IBricksManifest | undefined>;
    /**
     * Закрывает очередь и дожидается незавершённого скана.
     * Новые заявки после вызова не выполняются.
     */
    dispose: () => Promise<void>;
}
