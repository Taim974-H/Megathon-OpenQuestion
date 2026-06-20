import React, { useRef } from 'react'
import './App.css'
import { usePotholes } from './hooks/usePotholes'
import StatsBar from './components/StatsBar'
import Map from './components/Map'
import DangerPanel from './components/DangerPanel'

export default function App() {
  const { potholes, loading, error, lastUpdated, refresh } = usePotholes()
  const flyToRef = useRef(null)

  const handleFlyTo = ({ lng, lat, zoom }) => {
    if (flyToRef.current) {
      flyToRef.current({ lng, lat, zoom })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#0F0F0F' }}>
      <StatsBar
        potholes={potholes}
        loading={loading}
        lastUpdated={lastUpdated}
        onRefresh={refresh}
      />

      {error && (
        <div style={{
          background: '#2C1010',
          color: '#F44336',
          borderBottom: '1px solid #3D1515',
          padding: '8px 20px',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}>
          <span>⚠</span>
          <span>API error: {error}</span>
          <span style={{ color: '#AAAAAA', marginLeft: 8 }}>— Showing last known data (if any)</span>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Map
          potholes={potholes}
          flyToRef={flyToRef}
        />
        <DangerPanel
          potholes={potholes}
          onFlyTo={handleFlyTo}
        />
      </div>
    </div>
  )
}
