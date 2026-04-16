import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // You can also log the error to an error reporting service here
    console.error('Uncaught error in ErrorBoundary:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    // In a full implementation, you might want a more sophisticated
    // retry mechanism depending on what threw.
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
          <h2 style={{ color: '#d93025' }}>Something went wrong.</h2>
          <p style={{ color: '#5f6368', marginBottom: '1rem' }}>
            We encountered an unexpected error rendering this section.
          </p>
          {this.state.error && (
            <pre style={{ 
              background: '#f1f3f4', 
              padding: '1rem', 
              borderRadius: '4px',
              overflowX: 'auto',
              textAlign: 'left',
              fontSize: '0.85rem'
            }}>
              {this.state.error.message}
            </pre>
          )}
          <button 
            onClick={this.handleRetry}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#1a73e8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
