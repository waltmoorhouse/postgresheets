/**
 * Table Statistics View Provider - UI for viewing table statistics and metrics
 */

import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { DatabaseTreeItem } from './databaseTreeProvider';
import { TableStatsView, TableStats, IndexStats } from './tableStatsView';

export class TableStatsViewProvider {
    private readonly context: vscode.ExtensionContext;
    private readonly connectionManager: ConnectionManager;
    private readonly statsView: TableStatsView;
    private readonly panels = new Map<string, vscode.WebviewPanel>();

    constructor(context: vscode.ExtensionContext, connectionManager: ConnectionManager) {
        this.context = context;
        this.connectionManager = connectionManager;
        this.statsView = new TableStatsView(connectionManager);
    }

    async openStatsView(item: DatabaseTreeItem): Promise<void> {
        const connectionId = item.connectionId;
        const schemaName = item.schemaName;
        const tableName = item.tableName;

        if (!connectionId || !schemaName || !tableName) {
            vscode.window.showErrorMessage('Unable to open table statistics - missing connection or table information.');
            return;
        }

        const panelKey = `${connectionId}:${schemaName}.${tableName}:stats`;
        const existingPanel = this.panels.get(panelKey);
        if (existingPanel) {
            existingPanel.reveal(vscode.ViewColumn.Two);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'postgresTableStats',
            `Statistics - ${schemaName}.${tableName}`,
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panels.set(panelKey, panel);

        panel.onDidDispose(() => {
            this.panels.delete(panelKey);
        });

        panel.webview.onDidReceiveMessage(async (message) => {
            await this.handleMessage(message, panel, connectionId, schemaName, tableName);
        });

        await this.loadStats(panel, connectionId, schemaName, tableName);
    }

    private async loadStats(
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        tableName: string
    ): Promise<void> {
        try {
            const [tableStats, indexStats, bloatAnalysis] = await Promise.all([
                this.statsView.getTableStats(connectionId, schemaName, tableName),
                this.statsView.getIndexStats(connectionId, schemaName, tableName),
                this.statsView.analyzeTableBloat(connectionId, schemaName, tableName)
            ]);

            panel.webview.postMessage({
                command: 'loadStats',
                data: {
                    tableStats,
                    indexStats,
                    bloatAnalysis
                }
            });

            panel.webview.html = this.buildHtml(schemaName, tableName);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load table statistics: ${error}`);
        } finally {
            this.connectionManager.markIdle(connectionId);
        }
    }

    private async handleMessage(
        message: any,
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        tableName: string
    ): Promise<void> {
        switch (message.command) {
            case 'refresh':
                await this.loadStats(panel, connectionId, schemaName, tableName);
                break;
            case 'runVacuum':
                const confirmVacuum = await vscode.window.showWarningMessage(
                    `Run VACUUM on ${schemaName}.${tableName}? This may take some time for large tables.`,
                    { modal: true },
                    'Run VACUUM'
                );
                if (confirmVacuum === 'Run VACUUM') {
                    await this.runVacuum(connectionId, schemaName, tableName, panel);
                }
                break;
            case 'runAnalyze':
                const confirmAnalyze = await vscode.window.showWarningMessage(
                    `Run ANALYZE on ${schemaName}.${tableName}?`,
                    { modal: true },
                    'Run ANALYZE'
                );
                if (confirmAnalyze === 'Run ANALYZE') {
                    await this.runAnalyze(connectionId, schemaName, tableName, panel);
                }
                break;
        }
    }

    private async runVacuum(
        connectionId: string,
        schemaName: string,
        tableName: string,
        panel: vscode.WebviewPanel
    ): Promise<void> {
        try {
            const client = await this.connectionManager.getClient(connectionId);
            if (!client) {
                throw new Error('Could not connect to database');
            }

            await client.query(`VACUUM "${schemaName}"."${tableName}"`);
            vscode.window.showInformationMessage(`VACUUM completed for ${schemaName}.${tableName}`);
            
            // Refresh stats
            await this.loadStats(panel, connectionId, schemaName, tableName);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to run VACUUM: ${error}`);
        } finally {
            this.connectionManager.markIdle(connectionId);
        }
    }

    private async runAnalyze(
        connectionId: string,
        schemaName: string,
        tableName: string,
        panel: vscode.WebviewPanel
    ): Promise<void> {
        try {
            const client = await this.connectionManager.getClient(connectionId);
            if (!client) {
                throw new Error('Could not connect to database');
            }

            await client.query(`ANALYZE "${schemaName}"."${tableName}"`);
            vscode.window.showInformationMessage(`ANALYZE completed for ${schemaName}.${tableName}`);
            
            // Refresh stats
            await this.loadStats(panel, connectionId, schemaName, tableName);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to run ANALYZE: ${error}`);
        } finally {
            this.connectionManager.markIdle(connectionId);
        }
    }

    private buildHtml(schemaName: string, tableName: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Table Statistics - ${schemaName}.${tableName}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h1 { margin-top: 0; }
        h2 { margin-top: 30px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 5px; }
        .stats-section {
            margin: 20px 0;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
            margin: 15px 0;
        }
        .stat-card {
            border: 1px solid var(--vscode-panel-border);
            padding: 15px;
            border-radius: 4px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
        }
        .stat-label {
            font-size: 0.9em;
            opacity: 0.8;
            margin-bottom: 5px;
        }
        .stat-value {
            font-size: 1.5em;
            font-weight: bold;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            padding: 8px;
            text-align: left;
            border: 1px solid var(--vscode-panel-border);
        }
        th {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 16px;
            cursor: pointer;
            margin: 2px;
            border-radius: 2px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .toolbar {
            margin: 20px 0;
        }
        .warning {
            color: var(--vscode-editorWarning-foreground);
        }
        .good {
            color: var(--vscode-testing-iconPassed);
        }
        .loading {
            text-align: center;
            padding: 40px;
            opacity: 0.7;
        }
    </style>
</head>
<body>
    <h1>Table Statistics: ${schemaName}.${tableName}</h1>
    
    <div class="toolbar">
        <button onclick="refresh()">Refresh</button>
        <button onclick="runVacuum()">Run VACUUM</button>
        <button onclick="runAnalyze()">Run ANALYZE</button>
    </div>

    <div id="content">
        <div class="loading">Loading statistics...</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        function runVacuum() {
            vscode.postMessage({ command: 'runVacuum' });
        }

        function runAnalyze() {
            vscode.postMessage({ command: 'runAnalyze' });
        }

        function formatSize(bytes) {
            const units = ['B', 'KB', 'MB', 'GB', 'TB'];
            let size = bytes;
            let unitIndex = 0;
            while (size >= 1024 && unitIndex < units.length - 1) {
                size /= 1024;
                unitIndex++;
            }
            return size.toFixed(2) + ' ' + units[unitIndex];
        }

        function formatDate(dateString) {
            if (!dateString) return 'Never';
            const date = new Date(dateString);
            return date.toLocaleString();
        }

        function formatPercent(ratio) {
            return (ratio * 100).toFixed(2) + '%';
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'loadStats') {
                const { tableStats, indexStats, bloatAnalysis } = message.data;
                renderStats(tableStats, indexStats, bloatAnalysis);
            }
        });

        function renderStats(tableStats, indexStats, bloatAnalysis) {
            const content = document.getElementById('content');
            
            const bloatClass = bloatAnalysis.estimatedBloatRatio > 0.2 ? 'warning' : 'good';
            const liveRatioClass = tableStats.liveRatio > 0.8 ? 'good' : 'warning';

            content.innerHTML = \`
                <div class="stats-section">
                    <h2>Table Overview</h2>
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-label">Total Rows</div>
                            <div class="stat-value">\${tableStats.rowCount.toLocaleString()}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Table Size</div>
                            <div class="stat-value">\${formatSize(tableStats.sizeBytes)}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Number of Indexes</div>
                            <div class="stat-value">\${tableStats.indexes}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Dead Tuples</div>
                            <div class="stat-value">\${tableStats.deadTuples.toLocaleString()}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Live Tuple Ratio</div>
                            <div class="stat-value \${liveRatioClass}">\${formatPercent(tableStats.liveRatio)}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Last VACUUM</div>
                            <div class="stat-value" style="font-size: 1.0em;">\${formatDate(tableStats.lastVacuum)}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Last ANALYZE</div>
                            <div class="stat-value" style="font-size: 1.0em;">\${formatDate(tableStats.lastAnalyze)}</div>
                        </div>
                    </div>
                </div>

                <div class="stats-section">
                    <h2>Bloat Analysis</h2>
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-label">Estimated Bloat</div>
                            <div class="stat-value \${bloatClass}">\${formatPercent(bloatAnalysis.estimatedBloatRatio)}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Bloat Size</div>
                            <div class="stat-value \${bloatClass}">\${formatSize(bloatAnalysis.estimatedBloatBytes)}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Recommendation</div>
                            <div class="stat-value" style="font-size: 1.0em;">\${bloatAnalysis.recommendation}</div>
                        </div>
                    </div>
                </div>

                <div class="stats-section">
                    <h2>Index Statistics</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Index Name</th>
                                <th>Size</th>
                                <th>Scans</th>
                                <th>Tuples Read</th>
                                <th>Tuples Fetched</th>
                                <th>Last Used</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            \${indexStats.map(idx => \`
                                <tr>
                                    <td>\${idx.indexName}</td>
                                    <td>\${formatSize(idx.sizeBytes)}</td>
                                    <td>\${idx.scans.toLocaleString()}</td>
                                    <td>\${idx.tuples.toLocaleString()}</td>
                                    <td>\${idx.reads.toLocaleString()}</td>
                                    <td>\${formatDate(idx.lastUsed)}</td>
                                    <td class="\${idx.isUnused ? 'warning' : 'good'}">
                                        \${idx.isUnused ? 'Unused' : 'Active'}
                                    </td>
                                </tr>
                            \`).join('')}
                        </tbody>
                    </table>
                    \${indexStats.filter(idx => idx.isUnused).length > 0 ? 
                        '<p class="warning">⚠️ Some indexes are unused and may be candidates for removal.</p>' : 
                        '<p class="good">✓ All indexes are being used.</p>'}
                </div>
            \`;
        }
    </script>
</body>
</html>`;
    }
}
