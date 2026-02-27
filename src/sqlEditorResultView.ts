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

    showMultipleQueryResults(title: string, results: Array<{ label: string; rows: any[]; columns: string[] }>) {
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel('sqlEditorResult', title, vscode.ViewColumn.Beside, {
                enableScripts: true
            });
            this.panel.onDidDispose(() => { this.panel = undefined; });
        } else {
            this.panel.title = title;
            this.panel.reveal(vscode.ViewColumn.Beside);
        }

        this.panel.webview.html = this.buildMultiHtml(results);
    }

    private buildHtml(rows: any[], columns: string[]) {
        const head = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:8px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px;text-align:left;font-size:12px}td{color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}th{background:#fff;color:#000;font-weight:600}</style></head><body>`;
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

    private buildMultiHtml(results: Array<{ label: string; rows: any[]; columns: string[] }>) {
        const head = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:8px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}h3{margin:16px 0 8px 0;font-size:13px}table{border-collapse:collapse;width:100%;margin-bottom:16px}th,td{border:1px solid #ddd;padding:6px;text-align:left;font-size:12px}td{color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}th{background:#fff;color:#000;font-weight:600}.muted{color:var(--vscode-descriptionForeground);font-size:12px}</style></head><body>`;
        const tail = `</body></html>`;

        if (!results || results.length === 0) {
            return head + '<p><em>(No result sets)</em></p>' + tail;
        }

        const sections = results.map((result) => {
            const rows = result.rows || [];
            const columns = result.columns || Object.keys(rows[0] || {});

            if (rows.length === 0) {
                return `<h3>${this.escapeHtml(result.label)}</h3><p class="muted">(0 rows)</p>`;
            }

            const header = `<table><thead><tr>${columns.map(c => `<th>${this.escapeHtml(c)}</th>`).join('')}</tr></thead>`;
            const bodyRows = rows.map(r => `<tr>${columns.map(c => `<td>${this.escapeHtml(String(r[c] ?? ''))}</td>`).join('')}</tr>`).join('');
            const table = header + `<tbody>${bodyRows}</tbody></table>`;
            return `<h3>${this.escapeHtml(result.label)} <span class="muted">(${rows.length} rows)</span></h3>${table}`;
        }).join('');

        return head + sections + tail;
    }

    private escapeHtml(s: string) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
