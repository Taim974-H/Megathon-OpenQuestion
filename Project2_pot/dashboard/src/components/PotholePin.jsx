import React from 'react'
import { severityColor, markerSize } from '../utils/severity'

export default function PotholePin({ pothole, onHover, onClick }) {
  const confidence = pothole.confidence ?? pothole.confidence_score ?? 50
  const size = markerSize(confidence)
  const color = severityColor(pothole.severity)

  return (
    <div
      onMouseEnter={() => onHover(pothole)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(pothole)}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        border: '2px solid rgba(255,255,255,0.35)',
        cursor: 'pointer',
        boxShadow: `0 0 ${size / 2}px ${color}88`,
        transform: 'translate(-50%, -50%)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.25)'
        e.currentTarget.style.boxShadow = `0 0 ${size}px ${color}`
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = 'translate(-50%, -50%)'
        e.currentTarget.style.boxShadow = `0 0 ${size / 2}px ${color}88`
      }}
    />
  )
}
