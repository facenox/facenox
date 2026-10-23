interface ErrorTextProps {
  message: string
  summary?: string
}

/** Keep actionable messages visible; put raw transport diagnostics behind a disclosure. */
export function ErrorText({ message, summary }: ErrorTextProps) {
  const technical =
    /^\s*(?:HTTP\s+\d{3}\b|(?:TypeError:\s*)?(?:fetch failed|failed to fetch)\b|(?:Connection|Backup export) failed:\s*HTTP\b|Backend (?:not available|service not started)\b)/i.test(
      message,
    ) || /^\s*<(?:!doctype|html|head)\b/i.test(message)

  if (!technical) return <span>{message}</span>

  return (
    <div className="min-w-0">
      <p>{summary || "Facenox could not complete the request."}</p>
      <details className="mt-1 text-left text-xs">
        <summary className="cursor-pointer rounded underline underline-offset-2 focus-visible:outline focus-visible:outline-2">
          Technical details
        </summary>
        <pre className="mt-2 max-h-40 overflow-auto font-mono text-[11px] break-words whitespace-pre-wrap">
          {message}
        </pre>
      </details>
    </div>
  )
}
