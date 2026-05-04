import { useState, useEffect } from 'react'
import { DEBUG, getRequestLog, type DebugRequestEntry } from '../lib/debug'
import { useAuthStore } from '../stores/authStore'

/**
 * Floating debug panel — only rendered in development.
 * Shows current screen, auth state, and the last N API calls with timing.
 */
export function DebugPanel({ currentScreen }: { currentScreen: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [entries, setEntries] = useState<readonly DebugRequestEntry[]>([])
  const { userId, userName } = useAuthStore()

  // Poll request log every second while open
  useEffect(() => {
    if (!isOpen) return
    const id = setInterval(() => setEntries([...getRequestLog()]), 1000)
    return () => clearInterval(id)
  }, [isOpen])

  if (!DEBUG) return null

  // Collapsed fab
  if (!isOpen) {
    return (
      <button
        onClick={() => { setIsOpen(true); setEntries([...getRequestLog()]) }}
        style={{
          position: 'fixed',
          bottom: 80,
          right: 12,
          zIndex: 99999,
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(0,0,0,0.7)',
          color: '#0f0',
          fontSize: 16,
          cursor: 'pointer',
          fontFamily: 'monospace',
          lineHeight: 1,
        }}
        title="Open debug panel"
      >
        🐛
      </button>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 99999,
      maxHeight: '45vh',
      overflow: 'auto',
      background: 'rgba(0,0,0,0.92)',
      color: '#e0e0e0',
      fontFamily: '"SF Mono", "Fira Code", monospace',
      fontSize: 11,
      lineHeight: 1.5,
      padding: '8px 12px 12px',
      borderTop: '2px solid #333',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: '#0f0', fontWeight: 700 }}>🐛 DEBUG PANEL</span>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: 'none', border: 'none', color: '#888',
            cursor: 'pointer', fontSize: 14, lineHeight: 1,
          }}
        >✕</button>
      </div>

      {/* State summary */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
        <span>
          <span style={{ color: '#888' }}>Screen: </span>
          <span style={{ color: '#6cf' }}>{currentScreen}</span>
        </span>
        <span>
          <span style={{ color: '#888' }}>Auth: </span>
          <span style={{ color: userId ? '#0f0' : '#f44' }}>
            {userId ? `✓ ${userName ?? 'user'}` : '✗ logged out'}
          </span>
        </span>
        <span>
          <span style={{ color: '#888' }}>Requests: </span>
          <span>{entries.length}</span>
        </span>
      </div>

      {/* Request log table */}
      {entries.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr style={{ color: '#888', textAlign: 'left' }}>
              <th style={{ padding: '2px 6px' }}>Method</th>
              <th style={{ padding: '2px 6px' }}>URL</th>
              <th style={{ padding: '2px 6px' }}>Status</th>
              <th style={{ padding: '2px 6px' }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {[...entries].reverse().slice(0, 20).map((e, i) => (
              <tr key={i} style={{ borderTop: '1px solid #333' }}>
                <td style={{ padding: '2px 6px', color: '#cf9' }}>{e.method}</td>
                <td style={{
                  padding: '2px 6px',
                  maxWidth: 200,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>{e.url}</td>
                <td style={{
                  padding: '2px 6px',
                  color: e.status && e.status < 400 ? '#0f0' : '#f44',
                }}>{e.status ?? '—'}</td>
                <td style={{ padding: '2px 6px', color: '#ff0' }}>{e.durationMs}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
