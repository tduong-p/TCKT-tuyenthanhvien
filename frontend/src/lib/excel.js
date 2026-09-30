// Excel helpers for the admin import/export: the browser reads and writes .xlsx, the server only sees JSON rows.
import * as XLSX from 'xlsx';

export async function readWorkbook(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  return {
    sheetNames: wb.SheetNames,
    rowsOf: name => XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' }),
  };
}

export function downloadXlsx(filename, columns, rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header: columns }), 'Sheet1');
  XLSX.writeFile(wb, filename);
}

export function stamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
