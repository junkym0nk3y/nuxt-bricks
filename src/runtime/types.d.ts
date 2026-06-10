export * from './common/types/index';

declare module './common/utils/routing/generate-stories-json.mjs' {
    export default function generateStoriesJson(isPlayground?: boolean): Promise<void>;
}
