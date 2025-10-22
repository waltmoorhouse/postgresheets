/**
 * Permissions Manager View - UI for managing PostgreSQL table permissions
 */

import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { DatabaseTreeItem } from './databaseTreeProvider';
import { RoleManager, TablePermission } from './roleManager';

export class PermissionsManagerView {
    private readonly context: vscode.ExtensionContext;
    private readonly connectionManager: ConnectionManager;
    private readonly roleManager: RoleManager;
    private readonly panels = new Map<string, vscode.WebviewPanel>();

    constructor(context: vscode.ExtensionContext, connectionManager: ConnectionManager) {
        this.context = context;
        this.connectionManager = connectionManager;
        this.roleManager = new RoleManager(connectionManager);
    }

    async openPermissionsManager(item: DatabaseTreeItem): Promise<void> {
        const connectionId = item.connectionId;
        const schemaName = item.schemaName;
        const tableName = item.tableName;

        if (!connectionId || !schemaName || !tableName) {
            vscode.window.showErrorMessage('Unable to open permissions manager - missing connection or table information.');
            return;
        }

        const panelKey = `${connectionId}:${schemaName}.${tableName}:permissions`;
        const existingPanel = this.panels.get(panelKey);
        if (existingPanel) {
            existingPanel.reveal(vscode.ViewColumn.Two);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'postgresPermissionsManager',
            `Permissions - ${schemaName}.${tableName}`,
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

        await this.loadPermissions(panel, connectionId, schemaName, tableName);
    }

    private async loadPermissions(
        panel: vscode.WebviewPanel,
        connectionId: string,
        schemaName: string,
        tableName: string
    ): Promise<void> {
        try {
            const permissions = await this.roleManager.getTablePermissions(connectionId, schemaName, tableName);
            panel.webview.html = this.buildHtml(schemaName, tableName, permissions);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load permissions: ${error}`);
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
                await this.loadPermissions(panel, connectionId, schemaName, tableName);
                break;
            case 'grant':
                await this.grantPermissionsPrompt(connectionId, schemaName, tableName, panel);
                break;
            case 'revoke':
                await this.revokePermissionsPrompt(connectionId, schemaName, tableName, message.role, panel);
                break;
        }
    }

    private async grantPermissionsPrompt(
        connectionId: string,
        schemaName: string,
        tableName: string,
        panel: vscode.WebviewPanel
    ): Promise<void> {
        const role = await vscode.window.showInputBox({
            prompt: 'Enter role name to grant permissions',
            placeHolder: 'username'
        });

        if (!role) return;

        const privilegeOptions = await vscode.window.showQuickPick(
            [
                { label: 'SELECT', picked: true },
                { label: 'INSERT', picked: true },
                { label: 'UPDATE', picked: true },
                { label: 'DELETE', picked: false }
            ],
            { canPickMany: true, placeHolder: 'Select privileges to grant' }
        );

        if (!privilegeOptions || privilegeOptions.length === 0) return;

        const privileges = privilegeOptions.map(p => p.label);

        try {
            await this.roleManager.grantTablePrivileges(connectionId, role, schemaName, tableName, privileges);
            vscode.window.showInformationMessage(`Granted ${privileges.join(', ')} to ${role}`);
            await this.loadPermissions(panel, connectionId, schemaName, tableName);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to grant permissions: ${error}`);
        }
    }

    private async revokePermissionsPrompt(
        connectionId: string,
        schemaName: string,
        tableName: string,
        role: string,
        panel: vscode.WebviewPanel
    ): Promise<void> {
        const confirmed = await vscode.window.showWarningMessage(
            `Revoke all permissions from ${role}?`,
            { modal: true },
            'Revoke'
        );

        if (confirmed !== 'Revoke') return;

        try {
            await this.roleManager.revokeTablePrivileges(connectionId, role, schemaName, tableName);
            vscode.window.showInformationMessage(`Revoked permissions from ${role}`);
            await this.loadPermissions(panel, connectionId, schemaName, tableName);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to revoke permissions: ${error}`);
        }
    }

    private buildHtml(schemaName: string, tableName: string, permissions: TablePermission[]): string {
        // Group permissions by grantee
        const grouped = permissions.reduce((acc, perm) => {
            if (!acc[perm.grantee]) {
                acc[perm.grantee] = [];
            }
            acc[perm.grantee].push(perm);
            return acc;
        }, {} as Record<string, TablePermission[]>);

        const permissionRows = Object.entries(grouped).map(([grantee, perms]) => `
            <tr>
                <td>${grantee}</td>
                <td>${perms.map(p => p.privilege).join(', ')}</td>
                <td>${perms.some(p => p.isGrantable) ? 'Yes' : 'No'}</td>
                <td>
                    <button onclick="revoke('${grantee}')">Revoke</button>
                </td>
            </tr>
        `).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Permissions - ${schemaName}.${tableName}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h1 { margin-top: 0; }
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
            padding: 4px 12px;
            cursor: pointer;
            margin: 2px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .toolbar {
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <h1>Permissions - ${schemaName}.${tableName}</h1>
    
    <div class="toolbar">
        <button onclick="grant()">Grant Permissions</button>
        <button onclick="refresh()">Refresh</button>
    </div>

    <table>
        <thead>
            <tr>
                <th>Role/User</th>
                <th>Privileges</th>
                <th>Grant Option</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            ${permissionRows || '<tr><td colspan="4">No permissions found</td></tr>'}
        </tbody>
    </table>

    <script>
        const vscode = acquireVsCodeApi();
        
        function grant() {
            vscode.postMessage({ command: 'grant' });
        }
        
        function revoke(role) {
            vscode.postMessage({ command: 'revoke', role });
        }
        
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'refresh') {
                location.reload();
            }
        });
    </script>
</body>
</html>`;
    }
}
