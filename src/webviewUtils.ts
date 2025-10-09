export function buildTableBodyHtml(columns: string[], rows: any[]): string {
    return rows.map(row => {
        const rowHtml = columns.map(col => {
            const cell = row[col];
            // basic escaping for < and &
            const text = cell === null || cell === undefined ? 'NULL' : String(cell).replace(/&/g, '&amp;').replace(/</g, '&lt;');
            return `<td>${text}</td>`;
        }).join('');
        return `<tr>${rowHtml}</tr>`;
    }).join('');
}
