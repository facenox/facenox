import { Component } from "react"
import type { ErrorInfo, ReactNode } from "react"

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
              <div className="mb-4">
                <i className="fa-solid fa-triangle-exclamation text-4xl text-[var(--error)]" />
              </div>
              <h1 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">
                Something went wrong
              </h1>
              <p className="mb-6 text-sm text-[var(--text-muted)]">
                Restart the application to continue.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg border border-[var(--border-primary)] bg-[var(--accent-subtle)] px-4 py-2 text-sm text-[var(--accent)] transition-colors hover:border-[var(--border-hover)]">
                Restart
              </button>
            </div>
          </div>
        )
      )
    }

    return this.props.children
  }
}
