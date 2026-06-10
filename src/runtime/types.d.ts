export * from './types/index';

declare module './utils/routing/generate-stories-json.mjs' {
    export default function generateStoriesJson(isPlayground?: boolean): Promise<void>;
}
