/**
 * Database Backup and Restore Manager for PostgreSQL Data Editor
 * Handles pg_dump and pg_restore operations with progress tracking
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import { ConnectionManager } from './connectionManager';
import { info, debug } from './logger';

export interface BackupOptions {
    format: 'custom' | 'plain' | 'directory' | 'tar';
    compress?: number; // 0-9 compression level
    dataOnly?: boolean;
    schemaOnly?: boolean;
    includeSchemas?: string[];
    excludeSchemas?: string[];
    includeTables?: string[];
    excludeTables?: string[];
    verbose?: boolean;
}

export interface RestoreOptions {
    clean?: boolean; // Drop database objects before recreating
    createDb?: boolean; // Create database before restoring
    dataOnly?: boolean;
    schemaOnly?: boolean;
    ifExists?: boolean; // Use IF EXISTS when dropping objects
    noOwner?: boolean; // Skip restoration of ownership
    verbose?: boolean;
    singleTransaction?: boolean; // Execute restore as a single transaction
}

export interface BackupProgress {
    phase: 'connecting' | 'dumping' | 'complete' | 'error';
    message: string;
    percentage?: number;
}

export class BackupRestoreManager {
    constructor(private connectionManager: ConnectionManager) {}

    /**
     * Backup a database using pg_dump
     */
    async backupDatabase(
        connectionId: string,
        outputPath: string,
        options: BackupOptions = { format: 'custom' },
        progressCallback?: (progress: BackupProgress) => void
    ): Promise<void> {
        const connections = await this.connectionManager.getConnections();
        const config = connections.find(c => c.id === connectionId);
        if (!config) {
            throw new Error('Connection not found');
        }

        const password = await this.connectionManager['context'].secrets.get(`postgres-password-${connectionId}`);

        return new Promise((resolve, reject) => {
            progressCallback?.({
                phase: 'connecting',
                message: 'Connecting to database...',
                percentage: 0
            });

            const args = this.buildDumpArgs(config, outputPath, options);
            
            debug(`Running pg_dump with args: ${args.join(' ')}`);
            
            const dumpProcess = spawn('pg_dump', args, {
                env: {
                    ...process.env,
                    PGPASSWORD: password
                }
            });

            let errorOutput = '';
            let stdOutput = '';

            dumpProcess.stderr.on('data', (data) => {
                const message = data.toString();
                errorOutput += message;
                
                if (options.verbose) {
                    debug(`pg_dump stderr: ${message}`);
                }

                progressCallback?.({
                    phase: 'dumping',
                    message: message.trim(),
                    percentage: 50
                });
            });

            dumpProcess.stdout.on('data', (data) => {
                stdOutput += data.toString();
                
                if (options.verbose) {
                    debug(`pg_dump stdout: ${data.toString()}`);
                }
            });

            dumpProcess.on('close', (code) => {
                if (code === 0) {
                    progressCallback?.({
                        phase: 'complete',
                        message: `Backup completed successfully: ${outputPath}`,
                        percentage: 100
                    });
                    resolve();
                } else {
                    const error = errorOutput || `pg_dump exited with code ${code}`;
                    progressCallback?.({
                        phase: 'error',
                        message: error,
                        percentage: 0
                    });
                    reject(new Error(error));
                }
            });

            dumpProcess.on('error', (err) => {
                const message = `Failed to start pg_dump: ${err.message}`;
                progressCallback?.({
                    phase: 'error',
                    message,
                    percentage: 0
                });
                reject(new Error(message));
            });
        });
    }

    /**
     * Restore a database using pg_restore or psql
     */
    async restoreDatabase(
        connectionId: string,
        inputPath: string,
        options: RestoreOptions = {},
        progressCallback?: (progress: BackupProgress) => void
    ): Promise<void> {
        const connections = await this.connectionManager.getConnections();
        const config = connections.find(c => c.id === connectionId);
        if (!config) {
            throw new Error('Connection not found');
        }

        const password = await this.connectionManager['context'].secrets.get(`postgres-password-${connectionId}`);

        // Detect format from file extension
        const isPlainSql = inputPath.endsWith('.sql');
        
        return new Promise((resolve, reject) => {
            progressCallback?.({
                phase: 'connecting',
                message: 'Connecting to database...',
                percentage: 0
            });

            const args = isPlainSql
                ? this.buildPsqlArgs(config, inputPath, options)
                : this.buildRestoreArgs(config, inputPath, options);
            
            const command = isPlainSql ? 'psql' : 'pg_restore';
            
            debug(`Running ${command} with args: ${args.join(' ')}`);
            
            const restoreProcess = spawn(command, args, {
                env: {
                    ...process.env,
                    PGPASSWORD: password
                }
            });

            let errorOutput = '';
            let stdOutput = '';

            restoreProcess.stderr.on('data', (data) => {
                const message = data.toString();
                errorOutput += message;
                
                if (options.verbose) {
                    debug(`${command} stderr: ${message}`);
                }

                progressCallback?.({
                    phase: 'dumping',
                    message: message.trim(),
                    percentage: 50
                });
            });

            restoreProcess.stdout.on('data', (data) => {
                stdOutput += data.toString();
                
                if (options.verbose) {
                    debug(`${command} stdout: ${data.toString()}`);
                }
            });

            restoreProcess.on('close', (code) => {
                if (code === 0) {
                    progressCallback?.({
                        phase: 'complete',
                        message: 'Restore completed successfully',
                        percentage: 100
                    });
                    resolve();
                } else {
                    const error = errorOutput || `${command} exited with code ${code}`;
                    progressCallback?.({
                        phase: 'error',
                        message: error,
                        percentage: 0
                    });
                    reject(new Error(error));
                }
            });

            restoreProcess.on('error', (err) => {
                const message = `Failed to start ${command}: ${err.message}`;
                progressCallback?.({
                    phase: 'error',
                    message,
                    percentage: 0
                });
                reject(new Error(message));
            });
        });
    }

    /**
     * Build pg_dump arguments
     */
    private buildDumpArgs(
        config: any,
        outputPath: string,
        options: BackupOptions
    ): string[] {
        const args = [
            '-h', config.host,
            '-p', config.port.toString(),
            '-U', config.user,
            '-d', config.database
        ];

        // Format
        const formatMap = {
            custom: 'c',
            plain: 'p',
            directory: 'd',
            tar: 't'
        };
        args.push('-F', formatMap[options.format]);

        // Output file
        args.push('-f', outputPath);

        // Compression (only for custom and directory formats)
        if (options.compress !== undefined && (options.format === 'custom' || options.format === 'directory')) {
            args.push('-Z', options.compress.toString());
        }

        // Data/schema only
        if (options.dataOnly) {
            args.push('--data-only');
        }
        if (options.schemaOnly) {
            args.push('--schema-only');
        }

        // Schema filters
        if (options.includeSchemas) {
            options.includeSchemas.forEach(schema => {
                args.push('-n', schema);
            });
        }
        if (options.excludeSchemas) {
            options.excludeSchemas.forEach(schema => {
                args.push('-N', schema);
            });
        }

        // Table filters
        if (options.includeTables) {
            options.includeTables.forEach(table => {
                args.push('-t', table);
            });
        }
        if (options.excludeTables) {
            options.excludeTables.forEach(table => {
                args.push('-T', table);
            });
        }

        // Verbose
        if (options.verbose) {
            args.push('--verbose');
        }

        return args;
    }

    /**
     * Build pg_restore arguments
     */
    private buildRestoreArgs(
        config: any,
        inputPath: string,
        options: RestoreOptions
    ): string[] {
        const args = [
            '-h', config.host,
            '-p', config.port.toString(),
            '-U', config.user,
            '-d', config.database
        ];

        // Clean
        if (options.clean) {
            args.push('--clean');
        }

        // Create database
        if (options.createDb) {
            args.push('--create');
        }

        // Data/schema only
        if (options.dataOnly) {
            args.push('--data-only');
        }
        if (options.schemaOnly) {
            args.push('--schema-only');
        }

        // IF EXISTS
        if (options.ifExists) {
            args.push('--if-exists');
        }

        // No owner
        if (options.noOwner) {
            args.push('--no-owner');
        }

        // Single transaction
        if (options.singleTransaction) {
            args.push('--single-transaction');
        }

        // Verbose
        if (options.verbose) {
            args.push('--verbose');
        }

        // Input file
        args.push(inputPath);

        return args;
    }

    /**
     * Build psql arguments for plain SQL restore
     */
    private buildPsqlArgs(
        config: any,
        inputPath: string,
        options: RestoreOptions
    ): string[] {
        const args = [
            '-h', config.host,
            '-p', config.port.toString(),
            '-U', config.user,
            '-d', config.database,
            '-f', inputPath
        ];

        // Single transaction
        if (options.singleTransaction) {
            args.push('--single-transaction');
        }

        // Verbose
        if (options.verbose) {
            args.push('--echo-all');
        }

        return args;
    }

    /**
     * Check if pg_dump is available
     */
    async checkPgDumpAvailable(): Promise<boolean> {
        return new Promise((resolve) => {
            const process = spawn('pg_dump', ['--version']);
            process.on('close', (code) => {
                resolve(code === 0);
            });
            process.on('error', () => {
                resolve(false);
            });
        });
    }

    /**
     * Check if pg_restore is available
     */
    async checkPgRestoreAvailable(): Promise<boolean> {
        return new Promise((resolve) => {
            const process = spawn('pg_restore', ['--version']);
            process.on('close', (code) => {
                resolve(code === 0);
            });
            process.on('error', () => {
                resolve(false);
            });
        });
    }

    /**
     * Get suggested backup filename
     */
    getSuggestedBackupFilename(databaseName: string, format: BackupOptions['format']): string {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const extensions = {
            custom: 'dump',
            plain: 'sql',
            directory: 'dir',
            tar: 'tar'
        };
        return `${databaseName}_${timestamp}.${extensions[format]}`;
    }
}
