export interface VSCodeApi {
  postMessage(message: unknown): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

export interface PrimaryKeyInfo {
  columns: string[];
}

export interface TableStatePayload {
  schemaName: string;
  tableName: string;
  columns: ColumnInfo[];
  primaryKey: PrimaryKeyInfo | string[];
  rows: Record<string, unknown>[];
  currentPage: number;
  totalRows: number;
  paginationSize: number;
  batchMode: boolean;
  sort?: SortDescriptor | null;
  filters?: Record<string, string>;
  searchTerm?: string;
}

export interface SortDescriptor {
  column: string;
  direction: 'asc' | 'desc';
}

export type FilterMap = Record<string, string>;

export interface GridChangeInsert {
  type: 'insert';
  data: Record<string, unknown>;
}

export interface GridChangeUpdate {
  type: 'update';
  data: Record<string, unknown>;
  where: Record<string, unknown>;
}

export interface GridChangeDelete {
  type: 'delete';
  where: Record<string, unknown>;
}

export type GridChange = GridChangeInsert | GridChangeUpdate | GridChangeDelete;

export interface SchemaDesignerColumn {
  id: string;
  name: string;
  originalName: string | null;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  comment: string | null;
  isPrimaryKey: boolean;
  isNew: boolean;
  markedForDrop: boolean;
}

export interface SchemaDesignerInitialState {
  schemaName: string;
  tableName: string;
  columns: SchemaDesignerColumn[];
  typeOptions: string[];
  primaryKey: {
    columns: string[];
    constraintName: string | null;
  };
}

export interface SchemaDesignerPreviewPayload {
  columns: SchemaDesignerColumn[];
  useManualSql?: boolean;
  sql?: string;
}
