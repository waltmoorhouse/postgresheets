import { buildTableBodyHtml } from '../src/webviewUtils';

describe('webview updateTable handler', () => {
    test('builds correct tbody html for columns and rows', () => {
        const columns = ['id', 'name', 'age'];
        const rows = [
            { id: 1, name: 'Alice', age: 30 },
            { id: 2, name: 'Bob & Sons', age: null }
        ];

        const html = buildTableBodyHtml(columns, rows);

        expect(html).toContain('<tr>');
        expect(html).toContain('<td>1</td>');
        expect(html).toContain('<td>Alice</td>');
        expect(html).toContain('<td>30</td>');
        // ensure escaping
        expect(html).toContain('<td>Bob &amp; Sons</td>');
        // null becomes NULL
        expect(html).toContain('<td>NULL</td>');
    });
});
