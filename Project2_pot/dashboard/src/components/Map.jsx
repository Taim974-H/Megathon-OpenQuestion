import React, { useState, useRef, useCallback } from 'react'
import ReactMapGL, { Marker, Popup, NavigationControl } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import PotholePin from './PotholePin'
import Tooltip from './Tooltip'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const INITIAL_VIEW = {
  longitude: 15,
  latitude: 48,
  zoom: 5,
}

function getLngLat(pothole) {
  // Support multiple coordinate field shapes from the backend
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

function isValidCoord(lng, lat) {
  return (
    typeof lng === 'number' &&
    typeof lat === 'number' &&
    !isNaN(lng) &&
    !isNaN(lat) &&
    lng >= -180 && lng <= 180 &&
    lat >= -90 && lat <= 90
  )
}

export default function Map({ potholes, flyToRef }) {
  const [viewState, setViewState] = useState(INITIAL_VIEW)
  const [hoveredPothole, setHoveredPothole] = useState(null)
  const [selectedPothole, setSelectedPothole] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const mapRef = useRef(null)

  // Expose flyTo so parent/DangerPanel can trigger it
  if (flyToRef) {
    flyToRef.current = ({ lng, lat, zoom = 15 }) => {
      setViewState((v) => ({ ...v, longitude: lng, latitude: lat, zoom }))
    }
  }

  const handleHover = useCallback((pothole) => {
    setHoveredPothole(pothole)
  }, [])

  const handleClick = useCallback((pothole) => {
    setSelectedPothole((prev) =>
      prev?.id === pothole.id ? null : pothole
    )
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (e.nativeEvent) {
      setTooltipPosition({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })
    }
  }, [])

  if (!MAPBOX_TOKEN) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0F0F0F',
        color: '#F44336',
        flexDirection: 'column',
        gap: 12,
        padding: 32,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 32 }}>⚠</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Mapbox token missing</div>
        <div style={{ fontSize: 13, color: '#AAAAAA', maxWidth: 400 }}>
          Set <code style={{ background: '#2A2A2A', padding: '2px 6px', borderRadius: 4 }}>VITE_MAPBOX_TOKEN</code> in
          your <code style={{ background: '#2A2A2A', padding: '2px 6px', borderRadius: 4 }}>.env</code> file.
          Get a free token at <a href="https://mapbox.com" target="_blank" rel="noreferrer" style={{ color: '#2196F3' }}>mapbox.com</a>.
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, position: 'relative' }} onMouseMove={handleMouseMove}>
      <ReactMapGL
        ref={mapRef}
        {...viewState}
        onMove={(e) => setViewState(e.viewState)}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        style={{ width: '100%', height: '100%' }}
        onClick={() => setSelectedPothole(null)}
      >
        <NavigationControl position="top-left" />

        {potholes.map((pothole) => {
          const { lng, lat } = getLngLat(pothole)
          if (!isValidCoord(lng, lat)) return null

          return (
            <Marker
              key={pothole.id ?? `${lat}-${lng}`}
              longitude={lng}
              latitude={lat}
              anchor="center"
            >
              <PotholePin
                pothole={pothole}
                onHover={handleHover}
                onClick={handleClick}
              />
            </Marker>
          )
        })}

        {selectedPothole && (() => {
          const { lng, lat } = getLngLat(selectedPothole)
          if (!isValidCoord(lng, lat)) return null
          return (
            <Popup
              longitude={lng}
              latitude={lat}
              anchor="bottom"
              onClose={() => setSelectedPothole(null)}
              closeOnClick={false}
              style={{ zIndex: 10 }}
            >
              <Tooltip pothole={selectedPothole} />
            </Popup>
          )
        })()}
      </ReactMapGL>

      {/* Hover tooltip rendered as overlay so it follows cursor */}
      {hoveredPothole && !selectedPothole && (
        <div
          style={{
            position: 'absolute',
            left: tooltipPosition.x + 14,
            top: tooltipPosition.y + 14,
            zIndex: 20,
            pointerEvents: 'none',
          }}
        >
          <Tooltip pothole={hoveredPothole} />
        </div>
      )}
    </div>
  )
}
