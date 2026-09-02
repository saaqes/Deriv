declare global {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let google: any;
    interface Window {
        sendRequestsStatistic: (is_running: boolean) => void;
    }
    interface ImportMetaEnv {
        readonly DEV: boolean;
        readonly PROD: boolean;
        readonly MODE: string;
    }
    interface ImportMeta {
        readonly env: ImportMetaEnv;
    }
}

export {};
