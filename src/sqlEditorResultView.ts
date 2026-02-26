import * as vscode from 'vscode';

export class SqlEditorResultView {
    private panel?: vscode.WebviewPanel;
    constructor(private readonly context: vscode.ExtensionContext) {}

    showQueryResult(title: string, rows: any[], columns: string[]) {
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel('sqlEditorResult', title, vscode.ViewColumn.Beside, {
                enableScripts: true
            });
            this.panel.onDidDispose(() => { this.panel = undefined; });
        } else {
            this.panel.title = title;
            this.panel.reveal(vscode.ViewColumn.Beside);
        }

        this.panel.webview.html = this.buildHtml(rows, columns);
    }

    private buildHtml(rows: any[], columns: string[]) {
        const head = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:8px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px;text-align:left;font-size:12px}th{background:#f3f3f3}</style></head><body>`;
        const tail = `</body></html>`;

        if (!rows || rows.length === 0) {
            return head + '<p><em>(0 rows)</em></p>' + tail;
        }

        const cols = columns.length > 0 ? columns : Object.keys(rows[0] || {});
        const header = `<table><thead><tr>${cols.map(c => `<th>${this.escapeHtml(c)}</th>`).join('')}</tr></thead>`;
        const bodyRows = rows.map(r => `<tr>${cols.map(c => `<td>${this.escapeHtml(String(r[c] ?? ''))}</td>`).join('')}</tr>`).join('');
        const table = header + `<tbody>${bodyRows}</tbody></table>`;

        return head + table + tail;
    }

    private escapeHtml(s: string) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
