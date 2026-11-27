/** Quote a CSV cell and keep user-provided spreadsheet formulas as text. */
export function escapeCsvCell(value: string | number | null | undefined): string {
  let cell = String(value ?? '')
  if (typeof value === 'string' && /^(?:[\t\r\n]|[\s\uFEFF]*[=+\-@＝＋－＠])/.test(cell)) {
    cell = `'${cell}`
  }
  return `"${cell.replaceAll('"', '""')}"`
}
