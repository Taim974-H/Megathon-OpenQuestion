import React from 'react'
import { severityColor, severityLabel, confidenceLabel } from '../utils/severity'

function getLngLat(pothole) {
  const lng =
    pothole.longitude ??
    pothole.lng ??
    pothole.location?.coordinates?.[0] ??
    pothole.location?.lng
  const lat =
    pothole.latitude ??
    pothole.lat ??
    pothole.location?.coordinates?.[1] ??
    pothole.location?.lat
  return { lng: parseFloat(lng), lat: parseFloat(lat) }
}

const styles = {
  panel: {
    width: 300,
    minWidth: 300,
    background: '#1A1A1A',
    borderLeft: '1px solid #2A2A2A',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '14px 16px',
    borderBottom: '1px solid #2A2A2A',
    fontSize: 14,
    fontWeight: 700,
    color: '#FFFFFF',
    letterSpacing: 0.3,
    flexShrink: 0,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
  },
  item: (hovered) => ({
    padding: '12px 16px',
    borderBottom: '1px solid #2A2A2A',
    cursor: 'pointer',
    background: hovered ? '#252525' : 'transparent',
    transition: 'background 0.15s',
  }),
  itemTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  badge: (severity) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    background: severityColor(severity),
    color: '#fff',
    fontWeight: 700,
    fontSize: 10,
    letterSpacing: 0.5,
  }),
  reports: {
    fontSize: 11,
    color: '#AAAAAA',
  },
  coords: {
    fontSize: 11,
    color: '#AAAAAA',
    marginBottom: 6,
    fontFamily: 'monospace',
  },
  confBarTrack: {
    height: 4,
    background: '#2A2A2A',
    borderRadius: 2,
    overflow: 'hidden',
  },
  confBarFill: (confidence, severity) => ({
    height: '100%',
    width: `${Math.min(100, Math.max(0, confidence))}%`,
    background: severityColor(severity),
    borderRadius: 2,
    transition: 'width 0.3s ease',
  }),
  confLabel: {
    fontSize: 11,
    color: '#AAAAAA',
    marginTop: 3,
    textAlign: 'right',
  },
  empty: {
    padding: 24,
    color: '#AAAAAA',
    fontSize: 13,
    textAlign: 'center',
  },
}

function PanelItem({ pothole, index, onFlyTo }) {
  const [hovered, setHovered] = React.useState(false)
  const confidence = pothole.confidence ?? pothole.confidence_score ?? 0
  const reports = pothole.report_count ?? pothole.reports ?? 1
  const { lng, lat } = getLngLat(pothole)

  const handleClick = () => {
    if (!isNaN(lng) && !isNaN(lat)) {
      onFlyTo({ lng, lat, zoom: 15 })
    }
  }

  return (
    <div
      style={styles.item(hovered)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
    >
      <div style={styles.itemTop}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#555', fontSize: 11, minWidth: 16 }}>#{index + 1}</span>
          <span style={styles.badge(pothole.severity)}>
            {severityLabel(pothole.severity)}
          </span>
        </div>
        <span style={styles.reports}>{reports} report{reports !== 1 ? 's' : ''}</span>
      </div>

      {!isNaN(lng) && !isNaN(lat) && (
        <div style={styles.coords}>
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </div>
      )}

      <div style={styles.confBarTrack}>
        <div style={styles.confBarFill(confidence, pothole.severity)} />
      </div>
      <div style={styles.confLabel}>
        Confidence: {confidenceLabel(confidence)}
      </div>
    </div>
  )
}

export default function DangerPanel({ potholes, onFlyTo }) {
  return (
    <div style={styles.panel}>
      <div style={styles.header}>Most Dangerous Potholes</div>
      <div style={styles.list}>
        {potholes.length === 0 ? (
          <div style={styles.empty}>No potholes loaded yet.</div>
        ) : (
          potholes.map((p, i) => (
            <PanelItem
              key={p.id ?? i}
              pothole={p}
              index={i}
              onFlyTo={onFlyTo}
            />
          ))
        )}
      </div>
    </div>
  )
}
