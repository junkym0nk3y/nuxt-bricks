import { readFileSync } from 'fs';
import { join } from 'path';
import type { ILandObject, INuxtLandRoute, IBricksLandFile } from './types.d.ts';

/**
 * Reads the generated `bricks.json` (source of landing meta) and groups entries by category.
 *
 * @returns A map where each key is a category and its value contains
 *          a `components` array of `{ name, storyPath }` entries.
 */
export function getLandingCategoriesFromJson(
    row = false
): Record<string, INuxtLandRoute> | IBricksLandFile {
    try {
        const jsonPath = join(process.cwd(), 'public/bricks.json');
        const rawContent = readFileSync(jsonPath, 'utf-8');
        const parsedContent = JSON.parse(rawContent) as IBricksLandFile;

        if (row) {
            return parsedContent;
        }

        const { stories } = parsedContent;

        const categories: Record<string, INuxtLandRoute> = {};

        stories.forEach((story: ILandObject) => {
            const category = story.category;
            const entry = (categories[category] ||= { components: [] });
            entry.components.push({
                name: story.name,
                storyPath: story.storyPath,
            });
        });

        return categories;
    } catch (error: any) {
        if (error?.code === 'ENOENT') {
            console.warn('[bricks.json] not found. Skipping...');
        } else {
            console.error('Failed to read bricks.json:', error);
        }
        return {};
    }
}
