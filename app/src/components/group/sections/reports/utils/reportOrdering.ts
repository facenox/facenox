interface ReportOrderFields {
  date: string
  name: string
  person_id: string
  visit_number?: number
}

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })

function compareText(a: string, b: string): number {
  return (
    a < b ? -1
    : a > b ? 1
    : 0
  )
}

export function compareReportNames(a: string, b: string): number {
  return nameCollator.compare(a, b) || compareText(a, b)
}

/** A report is a dated roster, not a live stream of recognition events. */
export function compareReportRows(a: ReportOrderFields, b: ReportOrderFields): number {
  return (
    compareText(b.date, a.date) ||
    compareReportNames(a.name, b.name) ||
    compareText(a.person_id, b.person_id) ||
    (a.visit_number ?? 1) - (b.visit_number ?? 1)
  )
}
