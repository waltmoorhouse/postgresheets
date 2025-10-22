/**
 * Role Management for PostgreSQL Data Editor
 * Provides UI and operations for managing database roles and permissions
 */

import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { info, debug } from './logger';

export interface RoleInfo {
    name: string;
    isSuperuser: boolean;
    canCreateDb: boolean;
    canCreateRole: boolean;
    canLogin: boolean;
    isInherit: boolean;
    memberOf: string[];
}

export interface TablePermission {
    grantee: string;
    privilege: string;
    isGrantable: boolean;
}

export class RoleManager {
    constructor(private connectionManager: ConnectionManager) {}

    /**
     * Get all roles in the database
     */
    async getRoles(connectionId: string): Promise<RoleInfo[]> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            throw new Error('Could not connect to database');
        }

        try {
            const result = await client.query(`
                SELECT 
                    r.rolname,
                    r.rolsuper,
                    r.rolcreatedb,
                    r.rolcreaterole,
                    r.rolcanlogin,
                    r.rolinherit,
                    COALESCE(array_agg(m.rolname), ARRAY[]::text[]) as member_of
                FROM pg_role r
                LEFT JOIN pg_auth_members am ON am.member = r.oid
                LEFT JOIN pg_role m ON m.oid = am.roleid
                GROUP BY r.oid, r.rolname, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolcanlogin, r.rolinherit
                ORDER BY r.rolname
            `);

            return result.rows.map(row => ({
                name: row.rolname,
                isSuperuser: row.rolsuper,
                canCreateDb: row.rolcreatedb,
                canCreateRole: row.rolcreaterole,
                canLogin: row.rolcanlogin,
                isInherit: row.rolinherit,
                memberOf: row.member_of || []
            }));
        } catch (err) {
            debug(`Error fetching roles: ${err}`);
            throw err;
        }
    }

    /**
     * Create a new role
     */
    async createRole(
        connectionId: string,
        roleName: string,
        options: {
            password?: string;
            canLogin?: boolean;
            canCreateDb?: boolean;
            canCreateRole?: boolean;
            isSuperuser?: boolean;
        } = {}
    ): Promise<void> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            throw new Error('Could not connect to database');
        }

        try {
            const parts: string[] = [`CREATE ROLE "${roleName}"`];

            if (options.password) {
                parts.push(`WITH PASSWORD '${options.password.replace(/'/g, "''")}'`);
            }

            if (options.canLogin) {
                parts.push('LOGIN');
            }
            if (options.canCreateDb) {
                parts.push('CREATEDB');
            }
            if (options.canCreateRole) {
                parts.push('CREATEROLE');
            }
            if (options.isSuperuser) {
                parts.push('SUPERUSER');
            }

            const sql = parts.join(' ');
            await client.query(sql);
            info(`Role ${roleName} created successfully`);
        } catch (err) {
            debug(`Error creating role: ${err}`);
            throw err;
        }
    }

    /**
     * Drop a role
     */
    async dropRole(connectionId: string, roleName: string): Promise<void> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            throw new Error('Could not connect to database');
        }

        try {
            const sql = `DROP ROLE "${roleName}"`;
            await client.query(sql);
            info(`Role ${roleName} dropped successfully`);
        } catch (err) {
            debug(`Error dropping role: ${err}`);
            throw err;
        }
    }

    /**
     * Grant privileges on a table to a role
     */
    async grantTablePrivileges(
        connectionId: string,
        roleName: string,
        schemaName: string,
        tableName: string,
        privileges: string[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
        withGrantOption: boolean = false
    ): Promise<void> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            throw new Error('Could not connect to database');
        }

        try {
            const privList = privileges.join(', ');
            const grantOption = withGrantOption ? ' WITH GRANT OPTION' : '';
            const sql = `
                GRANT ${privList} ON "${schemaName || 'public'}"."${tableName}" 
                TO "${roleName}"${grantOption}
            `.trim();

            await client.query(sql);
            info(`Privileges granted to ${roleName} on ${tableName}`);
        } catch (err) {
            debug(`Error granting privileges: ${err}`);
            throw err;
        }
    }

    /**
     * Revoke privileges on a table from a role
     */
    async revokeTablePrivileges(
        connectionId: string,
        roleName: string,
        schemaName: string,
        tableName: string,
        privileges: string[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
    ): Promise<void> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            throw new Error('Could not connect to database');
        }

        try {
            const privList = privileges.join(', ');
            const sql = `
                REVOKE ${privList} ON "${schemaName || 'public'}"."${tableName}" 
                FROM "${roleName}"
            `.trim();

            await client.query(sql);
            info(`Privileges revoked from ${roleName} on ${tableName}`);
        } catch (err) {
            debug(`Error revoking privileges: ${err}`);
            throw err;
        }
    }

    /**
     * Get table permissions for all roles
     */
    async getTablePermissions(
        connectionId: string,
        schemaName: string,
        tableName: string
    ): Promise<TablePermission[]> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            throw new Error('Could not connect to database');
        }

        try {
            const result = await client.query(`
                SELECT 
                    grantee,
                    privilege_type as privilege,
                    is_grantable::boolean
                FROM information_schema.table_privileges
                WHERE table_schema = $1 AND table_name = $2
                ORDER BY grantee, privilege_type
            `, [schemaName || 'public', tableName]);

            return result.rows.map(row => ({
                grantee: row.grantee,
                privilege: row.privilege,
                isGrantable: row.is_grantable
            }));
        } catch (err) {
            debug(`Error fetching table permissions: ${err}`);
            throw err;
        }
    }

    /**
     * Grant schema privileges to a role
     */
    async grantSchemaPrivileges(
        connectionId: string,
        roleName: string,
        schemaName: string,
        privileges: string[] = ['USAGE', 'CREATE']
    ): Promise<void> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            throw new Error('Could not connect to database');
        }

        try {
            const privList = privileges.join(', ');
            const sql = `GRANT ${privList} ON SCHEMA "${schemaName}" TO "${roleName}"`;

            await client.query(sql);
            info(`Schema privileges granted to ${roleName}`);
        } catch (err) {
            debug(`Error granting schema privileges: ${err}`);
            throw err;
        }
    }

    /**
     * Add a role as a member of another role
     */
    async addRoleMember(
        connectionId: string,
        memberRole: string,
        parentRole: string,
        admin: boolean = false
    ): Promise<void> {
        const client = await this.connectionManager.getClient(connectionId);
        if (!client) {
            throw new Error('Could not connect to database');
        }

        try {
            const adminOption = admin ? 'WITH ADMIN OPTION' : '';
            const sql = `GRANT "${parentRole}" TO "${memberRole}" ${adminOption}`.trim();

            await client.query(sql);
            info(`${memberRole} added as member of ${parentRole}`);
        } catch (err) {
            debug(`Error adding role member: ${err}`);
            throw err;
        }
    }
}
