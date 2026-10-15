export declare const shared: Record<string, { singleton: boolean; requiredVersion: string }>;
export declare const remoteBase: (name: string) => string;
export declare const devServer: (port: number) => Record<string, unknown>;
export declare const dropFromBuild: (...files: string[]) => import("vite").Plugin;
