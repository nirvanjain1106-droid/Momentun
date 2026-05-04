import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, info: unknown) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {

  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary]', error, info)
    this.props.onError?.(error, info)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{
          height: '100vh',
          background: '#FAF6F2',
          display: 'flex',
          flexDirection: 'column' as const,
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          padding: '24px'
        }}>
          <p style={{ fontSize: '40px' }}>⚠️</p>
          <p style={{
            fontSize: '17px',
            fontWeight: 600,
            color: '#1A1210'
          }}>
            Something went wrong
          </p>
          <pre style={{
            fontSize: '12px',
            color: '#9C8880',
            maxWidth: '340px',
            overflow: 'auto',
            padding: '12px',
            background: '#F2EDE8',
            borderRadius: '8px'
          }}>
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => this.setState({
              hasError: false, error: null
            })}
            style={{
              background: '#B8472A',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              padding: '12px 24px',
              cursor: 'pointer',
              fontFamily: 'var(--font-family)',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
