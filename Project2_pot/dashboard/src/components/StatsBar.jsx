import React from 'react'

function formatTime(date) {
  if (!date) return '--'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const styles = {
  bar: {
    height: 60,
    minHeight: 60,
    background: '#1A1A1A',
    borderBottom: '1px solid #2A2A2A',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    gap: 32,
    flexShrink: 0,
  },
  brand: {
    fontSize: 16,
    fontWeight: 700,
    color: '#2196F3',
    letterSpacing: 0.5,
    marginRight: 8,
    whiteSpace: 'nowrap',
  },
  divider: {
    width: 1,
    height: 28,
    background: '#2A2A2A',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  statLabel: {
    fontSize: 10,
    color: '#AAAAAA',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: (color) => ({
    fontSize: 20,
    fontWeight: 700,
    color: color ?? '#FFFFFF',
    lineHeight: 1,
  }),
  spacer: {
    flex: 1,
  },
  updatedText: {
    fontSize: 12,
    color: '#AAAAAA',
    whiteSpace: 'nowrap',
  },
  refreshBtn: (loading) => ({
    background: loading ? '#1A3A5C' : '#2196F3',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 6,
    padding: '7px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1,
    transition: 'background 0.2s, opacity 0.2s',
    whiteSpace: 'nowrap',
  }),
}

export default function StatsBar({ potholes, loading, lastUpdated, onRefresh }) {
  const total = potholes.length
  const highCount = potholes.filter((p) => p.severity === 'high').length
  const mediumCount = potholes.filter((p) => p.severity === 'medium').length

  return (
    <div style={styles.bar}>
      <span style={styles.brand}>PotholeTracker</span>
      <div style={styles.divider} />

      <div style={styles.stat}>
        <span style={styles.statLabel}>Tracked</span>
        <span style={styles.statValue()}>{loading ? '…' : total}</span>
      </div>

      <div style={styles.stat}>
        <span style={styles.statLabel}>High Severity</span>
        <span style={styles.statValue('#F44336')}>{loading ? '…' : highCount}</span>
      </div>

      <div style={styles.stat}>
        <span style={styles.statLabel}>Medium Severity</span>
        <span style={styles.statValue('#FF9800')}>{loading ? '…' : mediumCount}</span>
      </div>

      <div style={styles.spacer} />

      <span style={styles.updatedText}>
        {loading ? 'Refreshing…' : `Updated ${formatTime(lastUpdated)}`}
      </span>

      <button
        style={styles.refreshBtn(loading)}
        onClick={onRefresh}
        disabled={loading}
      >
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  )
}
