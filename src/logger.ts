// Lightweight debug logger used to gate developer logs in production builds.
// Enable by setting the environment variable POSTGRES_SHEETS_DEBUG=1 when launching
// VS Code or the test runner.
export function debug(...args: any[]): void {
    if (process.env.POSTGRES_SHEETS_DEBUG === '1') {
        // eslint-disable-next-line no-console
        console.log('[postgres-sheets]', ...args);
    }
}

export function info(...args: any[]): void {
    if (process.env.POSTGRES_SHEETS_DEBUG === '1') {
        // eslint-disable-next-line no-console
        console.info('[postgres-sheets]', ...args);
    }
}
