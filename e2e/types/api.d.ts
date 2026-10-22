export interface IE2ePageInput {
    pagename: string;
    title: string;
    description?: string;
    published?: boolean;
    schema?: Record<string, unknown>;
}

export interface IE2ePage extends IE2ePageInput {
    id: number;
    revision: number;
}
