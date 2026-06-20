import React from 'react'
import { severityColor, severityLabel, confidenceLabel } from '../utils/severity'

function timeAgo(dateStr) {
  if (!dateStr) return 'Unknown'
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days !== 1 ? 's' : ''} ago`
}

const styles = {
  container: {
    background: '#1A1A1A',
    border: '1px solid #2A2A2A',
    borderRadius: 8,
    padding: '10px 14px',
    minWidth: 180,
    boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
    pointerEvents: 'none',
    fontSize: 13,
    lineHeight: 1.6,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    color: '#FFFFFF',
  },
  label: {
    color: '#AAAAAA',
  },
  severityBadge: (severity) => ({
    display: 'inline-block',
    padding: '1px 8px',
    borderRadius: 4,
    background: severityColor(severity),
    color: '#fff',
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: 0.5,
  }),
}

export default function Tooltip({ pothole }) {
  if (!pothole) return null

  return (
    <div style={styles.container}>
      <div style={{ ...styles.row, marginBottom: 4 }}>
        <span style={styles.label}>Severity</span>
        <span style={styles.severityBadge(pothole.severity)}>
          {severityLabel(pothole.severity)}
        </span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>Confidence</span>
        <span>{confidenceLabel(pothole.confidence ?? pothole.confidence_score ?? 0)}</span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>Reports</span>
        <span>{pothole.report_count ?? pothole.reports ?? 1}</span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>Last reported</span>
        <span>{timeAgo(pothole.last_reported ?? pothole.created_at ?? pothole.updatedAt)}</span>
      </div>
    </div>
  )
}
