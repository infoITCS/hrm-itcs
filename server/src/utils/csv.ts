/**
 * Simple CSV generator utility.
 * Converts an array of objects to a CSV string.
 */
export function generateCSV(data: any[], columns: { header: string; key: string }[]): string {
    if (!data || data.length === 0) {
        return columns.map(c => `"${c.header}"`).join(',') + '\n';
    }

    const headerRow = columns.map(c => `"${c.header}"`).join(',');
    
    const rows = data.map(record => {
        return columns.map(col => {
            let val = record[col.key];
            
            // Handle nested keys (e.g., 'jobInfo.department')
            if (col.key.includes('.')) {
                const parts = col.key.split('.');
                val = record;
                for (const p of parts) {
                    val = val?.[p];
                }
            }

            if (val === null || val === undefined) return '""';
            
            // Format dates
            if (val instanceof Date) {
                val = val.toISOString();
            }

            // Escape quotes and wrap in quotes
            const stringVal = String(val).replace(/"/g, '""');
            return `"${stringVal}"`;
        }).join(',');
    });

    return [headerRow, ...rows].join('\n');
}
