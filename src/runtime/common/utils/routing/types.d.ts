export interface ILandObject {
    name: string;
    category: string;
    storyPath: string;
}

export interface INuxtLandRoute {
    components: Array<{
        name: string;
        storyPath: string;
    }>;
}

export interface IBricksLandFile {
    stories: ILandObject[];
    hash: string;
}
