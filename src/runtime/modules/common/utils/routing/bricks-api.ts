import { readFileSync } from 'fs';
import { join } from 'path';
import type { IBrickObject, IBrickRoute, IBricksManifest } from './types.d.ts';

/**
 * Reads the generated `bricks.json` (source of brick meta) and groups entries by category.
 *
 * @returns A map where each key is a category and its value contains
 *          a `components` array of `{ name, brickPath }` entries.
 */
export function getBricksCategoriesFromJson(
    row = false
): Record<string, IBrickRoute> | IBricksManifest {
    try {
        const jsonPath = join(process.cwd(), 'public/bricks.json');
        const rawContent = readFileSync(jsonPath, 'utf-8');
        const parsedContent = JSON.parse(rawContent) as IBricksManifest;

        if (row) {
            return parsedContent;
        }

        const { bricks } = parsedContent;

        const categories: Record<string, IBrickRoute> = {};

        bricks.forEach((brick: IBrickObject) => {
            const category = brick.category;
            const entry = (categories[category] ||= { components: [] });
            entry.components.push({
                name: brick.name,
                brickPath: brick.brickPath,
            });
        });

        return categories;
    } catch (error) {
        if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') {
            console.warn('[bricks.json] not found. Skipping...');
        } else {
            console.error('Failed to read bricks.json:', error);
        }
        return {};
    }
}
