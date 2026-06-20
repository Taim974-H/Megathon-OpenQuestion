import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import PotholeCard from '../components/PotholeCard';
import { getDeviceHistory } from '../services/api';
import { getDeviceUuid } from '../services/storage';

export default function HistoryScreen() {
  const [potholes, setPotholes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchHistory = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const uuid = await getDeviceUuid();
      const data = await getDeviceHistory(uuid);
      // Newest first
      const sorted = Array.isArray(data)
        ? [...data].sort((a, b) => {
            const ta = new Date(a.created_at || a.detected_at || 0).getTime();
            const tb = new Date(b.created_at || b.detected_at || 0).getTime();
            return tb - ta;
          })
        : [];
      setPotholes(sorted);
    } catch (err) {
      setError('Could not load history. Make sure the API is reachable.');
      console.warn('[HistoryScreen] fetch error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [fetchHistory])
  );

  const onRefresh = () => fetchHistory(true);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#2196F3" size="large" />
        <Text style={styles.loadingText}>Loading history…</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={potholes.length === 0 && styles.emptyContainer}
      data={potholes}
      keyExtractor={(item, index) => String(item.id ?? index)}
      renderItem={({ item }) => <PotholeCard pothole={item} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Detection History</Text>
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <Text style={styles.countText}>
              {potholes.length} {potholes.length === 1 ? 'pothole' : 'potholes'} recorded
            </Text>
          )}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🛣️</Text>
          <Text style={styles.emptyTitle}>No potholes detected yet</Text>
          <Text style={styles.emptySubtitle}>
            Start monitoring on the Home screen to begin logging road hazards.
          </Text>
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#2196F3"
          colors={['#2196F3']}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  emptyContainer: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  countText: {
    color: '#666',
    fontSize: 13,
  },
  errorText: {
    color: '#F44336',
    fontSize: 13,
  },
  centered: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#666',
    fontSize: 14,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
