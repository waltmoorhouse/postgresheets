/**
 * SQL Terminal Provider - Custom terminal with PostgreSQL connection context
 * Allows running raw SQL commands with connection-aware prompt
 */

import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { QueryHistory } from './queryHistory';

interface TerminalState {
    connectionId: string;
    connectionName: string;
    database: string;
    schema: string;
}

export class SqlTerminalProvider {
    private terminals: Map<vscode.Terminal, TerminalState> = new Map();
    private readonly connectionManager: ConnectionManager;
    private readonly queryHistory: QueryHistory;

    constructor(
        private readonly context: vscode.ExtensionContext,
        connectionManager: ConnectionManager,
        queryHistory: QueryHistory
    ) {
        this.connectionManager = connectionManager;
        this.queryHistory = queryHistory;

        // Clean up terminals when they are closed
        context.subscriptions.push(
            vscode.window.onDidCloseTerminal(terminal => {
                this.terminals.delete(terminal);
            })
        );
    }

    async openSqlTerminal(connectionId?: string): Promise<void> {
        // Get available connections
        const connections = await this.connectionManager.getConnections();
        
        if (connections.length === 0) {
            vscode.window.showErrorMessage('No PostgreSQL connections available. Please add a connection first.');
            return;
        }

        // If no connection specified, prompt user to select one
        let selectedConnection = connections.find(c => c.id === connectionId);
        
        if (!selectedConnection) {
            const picks = connections.map(conn => ({
                label: conn.name,
                description: `${conn.host}:${conn.port}/${conn.database}`,
                id: conn.id
            }));

            const selected = await vscode.window.showQuickPick(picks, {
                placeHolder: 'Select a PostgreSQL connection'
            });

            if (!selected) {
                return;
            }

            selectedConnection = connections.find(c => c.id === selected.id);
        }

        if (!selectedConnection) {
            return;
        }

        // Prompt for schema (default: public)
        const schema = await vscode.window.showInputBox({
            prompt: 'Enter schema name',
            value: 'public',
            placeHolder: 'public'
        });

        if (!schema) {
            return;
        }

        // Create custom terminal with WriteProcess
        const writeEmitter = new vscode.EventEmitter<string>();
        const closeEmitter = new vscode.EventEmitter<number>();
        let currentLine = '';
        let commandBuffer = '';
        let inMultiLine = false;

        const pty: vscode.Pseudoterminal = {
            onDidWrite: writeEmitter.event,
            onDidClose: closeEmitter.event,
            
            open: () => {
                const prompt = `\x1b[32m${selectedConnection!.username}@${selectedConnection!.name}/${selectedConnection!.database}/${schema}\x1b[0m > `;
                writeEmitter.fire(`\x1b[1mPostgreSQL SQL Terminal\x1b[0m\r\n`);
                writeEmitter.fire(`Connected to: ${selectedConnection!.name} (${selectedConnection!.host}:${selectedConnection!.port})\r\n`);
                writeEmitter.fire(`Database: ${selectedConnection!.database}\r\n`);
                writeEmitter.fire(`Schema: ${schema}\r\n`);
                writeEmitter.fire(`\r\nType SQL commands and press Enter. Use ; to execute. Type \\q to quit.\r\n\r\n`);
                writeEmitter.fire(prompt);
            },

            close: () => {
                closeEmitter.fire(0);
            },

            handleInput: async (data: string) => {
                const prompt = `\x1b[32m${selectedConnection!.username}@${selectedConnection!.name}/${selectedConnection!.database}/${schema}\x1b[0m > `;
                const multiPrompt = `\x1b[32m${selectedConnection!.username}@${selectedConnection!.name}/${selectedConnection!.database}/${schema}\x1b[0m .. `;

                // Handle special characters
                if (data === '\r') {
                    // Enter key
                    writeEmitter.fire('\r\n');
                    
                    if (currentLine.trim() === '\\q' || currentLine.trim() === 'exit' || currentLine.trim() === 'quit') {
                        writeEmitter.fire('Bye!\r\n');
                        closeEmitter.fire(0);
                        return;
                    }

                    // Add line to command buffer
                    commandBuffer += currentLine + ' ';
                    
                    // Check if command should be executed (ends with semicolon)
                    if (currentLine.trim().endsWith(';')) {
                        const sql = commandBuffer.trim();
                        await this.executeQuery(
                            writeEmitter,
                            selectedConnection!.id,
                            selectedConnection!.name,
                            selectedConnection!.database,
                            schema,
                            sql
                        );
                        commandBuffer = '';
                        inMultiLine = false;
                        writeEmitter.fire(prompt);
                    } else {
                        // Multi-line mode
                        inMultiLine = true;
                        writeEmitter.fire(multiPrompt);
                    }
                    
                    currentLine = '';
                } else if (data === '\x7f') {
                    // Backspace
                    if (currentLine.length > 0) {
                        currentLine = currentLine.slice(0, -1);
                        writeEmitter.fire('\b \b');
                    }
                } else if (data === '\x03') {
                    // Ctrl+C - cancel current command
                    writeEmitter.fire('^C\r\n');
                    currentLine = '';
                    commandBuffer = '';
                    inMultiLine = false;
                    writeEmitter.fire(prompt);
                } else {
                    // Regular character
                    currentLine += data;
                    writeEmitter.fire(data);
                }
            }
        };

        const terminal = vscode.window.createTerminal({
            name: `SQL: ${selectedConnection.name}/${selectedConnection.database}`,
            pty
        });

        this.terminals.set(terminal, {
            connectionId: selectedConnection.id,
            connectionName: selectedConnection.name,
            database: selectedConnection.database,
            schema: schema
        });

        terminal.show();
    }

    private async executeQuery(
        writeEmitter: vscode.EventEmitter<string>,
        connectionId: string,
        connectionName: string,
        database: string,
        schema: string,
        sql: string
    ): Promise<void> {
        const startTime = Date.now();

        try {
            const client = await this.connectionManager.getClient(connectionId);
            if (!client) {
                writeEmitter.fire(`\x1b[31mError: Not connected to database\x1b[0m\r\n`);
                return;
            }

            // Set search path to the specified schema
            await client.query(`SET search_path TO "${schema}", public`);

            // Execute the query
            const result = await client.query(sql);
            const executionTime = Date.now() - startTime;

            // Log to query history
            await this.queryHistory.addQuery(sql, connectionId, connectionName, database, executionTime);

            // Display results
            if (result.command === 'SELECT' || result.command === 'SHOW') {
                // Display result rows
                if (result.rows.length === 0) {
                    writeEmitter.fire(`\x1b[33m(0 rows)\x1b[0m\r\n`);
                } else {
                    // Format as simple table
                    const columns = Object.keys(result.rows[0]);
                    const maxWidths = columns.map(col => 
                        Math.max(col.length, ...result.rows.map(row => String(row[col] ?? '').length))
                    );

                    // Header
                    const headerRow = columns.map((col, i) => col.padEnd(maxWidths[i])).join(' | ');
                    const separator = maxWidths.map(w => '-'.repeat(w)).join('-+-');
                    
                    writeEmitter.fire(headerRow + '\r\n');
                    writeEmitter.fire(separator + '\r\n');

                    // Rows (limit to first 100)
                    const displayRows = result.rows.slice(0, 100);
                    for (const row of displayRows) {
                        const rowStr = columns.map((col, i) => 
                            String(row[col] ?? '').padEnd(maxWidths[i])
                        ).join(' | ');
                        writeEmitter.fire(rowStr + '\r\n');
                    }

                    if (result.rows.length > 100) {
                        writeEmitter.fire(`\x1b[33m... and ${result.rows.length - 100} more rows\x1b[0m\r\n`);
                    }

                    writeEmitter.fire(`\x1b[33m(${result.rows.length} rows)\x1b[0m\r\n`);
                }
            } else {
                // Other commands (INSERT, UPDATE, DELETE, etc.)
                writeEmitter.fire(`\x1b[32m${result.command}\x1b[0m `);
                if (result.rowCount !== null && result.rowCount !== undefined) {
                    writeEmitter.fire(`\x1b[33m${result.rowCount}\x1b[0m `);
                }
                writeEmitter.fire('\r\n');
            }

            writeEmitter.fire(`\x1b[90m(${executionTime}ms)\x1b[0m\r\n`);

        } catch (error) {
            const executionTime = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            writeEmitter.fire(`\x1b[31mERROR: ${errorMsg}\x1b[0m\r\n`);
            writeEmitter.fire(`\x1b[90m(${executionTime}ms)\x1b[0m\r\n`);
        }
    }
}
