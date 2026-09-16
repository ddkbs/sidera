import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}

/** Keeps one broken subtree (a node, a view) from blanking the whole app. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error:', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)
    return (
      <div className="grid h-full place-items-center p-6 text-center text-sm">
        <div>
          <p className="font-medium">Something went wrong here.</p>
          <p className="mt-1 max-w-sm text-muted-foreground">{error.message}</p>
          <button onClick={this.reset} className="mt-3 rounded-md border px-3 py-1.5 transition hover:bg-accent">
            Try again
          </button>
        </div>
      </div>
    )
  }
}
