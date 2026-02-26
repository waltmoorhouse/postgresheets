import { CreateTableWizard } from '../src/createTableWizard';

describe('CreateTableWizard normalization', () => {
  test('normalizePreviewPayload includes constraints', () => {
    const wizard = new CreateTableWizard({} as any, {} as any, () => {});

    const payload: any = {
      tableName: '  mytable  ',
      columns: [
        { id: 'c1', name: 'col', type: 'text', nullable: true, defaultValue: null, comment: null, isPrimaryKey: false }
      ],
      constraints: [
        {
          id: 'con1',
          name: 'idx1',
          type: 'index',
          columns: ['col'],
          referencedSchema: null,
          referencedTable: null,
          referencedColumns: [],
          onUpdate: null,
          onDelete: null,
          method: 'btree',
          isNew: true,
          markedForDrop: false
        }
      ]
    };

    const normalized = (wizard as any).normalizePreviewPayload(payload);
    expect(normalized.tableName).toBe('mytable');
    expect(normalized.columns).toHaveLength(1);
    expect(normalized.constraints).toHaveLength(1);
    expect(normalized.constraints[0].name).toBe('idx1');
    expect(normalized.constraints[0].type).toBe('index');
  });
});
