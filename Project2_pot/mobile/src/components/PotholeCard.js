import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const SEVERITY_COLORS = {
  low: '#4CAF50',
  medium: '#FF9800',
  high: '#F44336',
};

const SEVERITY_LABELS = {
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
};

function formatDate(dateString) {
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Unknown date';
  }
}

function formatTime(dateString) {
  try {
    const d = new Date(dateString);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatCoords(lat, lng) {
  if (lat == null || lng == null) return 'Unknown location';
  return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
}

export default function PotholeCard({ pothole }) {
  const {
    severity = 'low',
    latitude,
    longitude,
    created_at,
    detected_at,
    g_force,
    car_type,
  } = pothole;

  const dateStr = created_at || detected_at;
  const color = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.low;

  return (
    <View style={styles.card}>
      {/* Left accent bar */}
      <View style={[styles.accentBar, { backgroundColor: color }]} />

      <View style={styles.content}>
        {/* Top row: severity badge + date/time */}
        <View style={styles.topRow}>
          <View style={[styles.badge, { backgroundColor: color + '33', borderColor: color }]}>
            <Text style={[styles.badgeText, { color }]}>
              {SEVERITY_LABELS[severity] ?? severity.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.dateText}>
            {formatDate(dateStr)}{'  '}{formatTime(dateStr)}
          </Text>
        </View>

        {/* Location */}
        <Text style={styles.locationText} numberOfLines={1}>
          {formatCoords(latitude, longitude)}
        </Text>

        {/* Bottom row: G-force + car type */}
        <View style={styles.bottomRow}>
          {g_force != null && (
            <Text style={styles.metaText}>
              {Number(g_force).toFixed(2)} G
            </Text>
          )}
          {car_type && (
            <Text style={styles.metaText}>
              {car_type.charAt(0).toUpperCase() + car_type.slice(1)}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    marginHorizontal: 16,
    marginVertical: 6,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  accentBar: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 10,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dateText: {
    color: '#888',
    fontSize: 12,
    flex: 1,
    textAlign: 'right',
  },
  locationText: {
    color: '#CCC',
    fontSize: 13,
    marginBottom: 6,
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 16,
  },
  metaText: {
    color: '#666',
    fontSize: 12,
  },
});
