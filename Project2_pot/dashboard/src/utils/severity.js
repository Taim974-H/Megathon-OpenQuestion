export const severityColor = (severity) => ({
  low: '#4CAF50',
  medium: '#FF9800',
  high: '#F44336',
}[severity] ?? '#AAAAAA')

export const severityLabel = (severity) =>
  severity ? severity.toUpperCase() : 'UNKNOWN'

export const confidenceLabel = (confidence) =>
  `${Math.round(confidence)}%`

export const markerSize = (confidence) =>
  8 + (confidence / 99) * 12
