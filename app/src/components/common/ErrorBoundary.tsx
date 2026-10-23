import { Component } from "react"
import type { ErrorInfo, ReactNode } from "react"
import { AlertTriangle } from "lucide-react"

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)]">
            <div className="text-center">
              <div className="mb-4 flex justify-center">
                <AlertTriangle className="size-10 text-[var(--error)]" />
              </div>
              <h1 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">
                Facenox hit an unexpected error
              </h1>
              <p className="mb-6 text-sm text-[var(--text-muted)]">
                Reload the window to try again. If it keeps happening, open the system log from
                Settings &gt; Data &amp; storage.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg bg-cyan-400 px-5 py-2 text-sm font-semibold text-black shadow-sm transition-all hover:bg-cyan-300 active:scale-95">
                Reload window
              </button>
            </div>
          </div>
        )
      )
    }

    return this.props.children
  }
}
