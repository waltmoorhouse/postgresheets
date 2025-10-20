// Minimal runtime mock of the VS Code API for unit tests.
export class EventEmitter<T = any> {
    private listeners: Array<(e: T) => void> = [];
    readonly event = (listener: (e: T) => void) => {
        this.listeners.push(listener);
        return { dispose: () => {} };
    };
    fire(e: T) {
        for (const l of this.listeners) l(e);
    }
}

export const window = {
    showInputBox: (_opts?: any) => Promise.resolve(undefined),
    showInformationMessage: (_msg?: string) => undefined,
    showErrorMessage: (_msg?: string) => undefined,
    showQuickPick: (_items?: any) => Promise.resolve(undefined),
    withProgress: async (_opts: any, cb: any) => cb({ report: () => {} }, { onCancellationRequested: (_: any) => {} })
};

export const commands = { executeCommand: (_cmd: string, ..._args: any[]) => undefined };

export class ThemeIcon {}

export const ProgressLocation = { Notification: 15 };

export type ExtensionContext = any;
