import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Switch,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { getSettings, saveSettings, clearLocalHistory, getDeviceUuid } from '../services/storage';

const WARNING_DISTANCES = [
  { value: 50, label: '50 m' },
  { value: 100, label: '100 m' },
  { value: 200, label: '200 m' },
];

const SENSITIVITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

function SegmentedControl({ options, selectedValue, onSelect, accentColor = '#2196F3' }) {
  return (
    <View style={segStyles.row}>
      {options.map((opt, idx) => {
        const selected = opt.value === selectedValue;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[
              segStyles.segment,
              idx === 0 && segStyles.first,
              idx === options.length - 1 && segStyles.last,
              selected && { backgroundColor: accentColor + '22', borderColor: accentColor },
            ]}
            onPress={() => onSelect(opt.value)}
          >
            <Text style={[segStyles.label, selected && { color: accentColor, fontWeight: '700' }]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const segStyles = StyleSheet.create({
  row: { flexDirection: 'row' },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1A1A1A',
    borderRightWidth: 0,
  },
  first: { borderRadius: 0, borderTopLeftRadius: 8, borderBottomLeftRadius: 8 },
  last: { borderRadius: 0, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderRightWidth: 1 },
  label: { color: '#888', fontSize: 14 },
});

export default function SettingsScreen() {
  const [settings, setSettings] = useState(null);
  const [deviceUuid, setDeviceUuid] = useState('');
  const [apiUrlDraft, setApiUrlDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const s = await getSettings();
    const uuid = await getDeviceUuid();
    setSettings(s);
    setApiUrlDraft(s.apiUrl ?? 'http://localhost:3000');
    setDeviceUuid(uuid);
  }, []);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const update = async (key, value) => {
    setSaving(true);
    try {
      const merged = await saveSettings({ [key]: value });
      setSettings(merged);
    } catch (err) {
      Alert.alert('Error', 'Could not save setting: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleApiUrlSave = async () => {
    const trimmed = apiUrlDraft.trim();
    if (!trimmed) return;
    await update('apiUrl', trimmed);
    Alert.alert('Saved', 'API URL updated.');
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear History',
      'This removes locally cached data. Your detections will still exist on the server.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearLocalHistory();
            Alert.alert('Done', 'Local history cleared.');
          },
        },
      ]
    );
  };

  if (!settings) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#2196F3" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>

      {/* Warning distance */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Warning Distance</Text>
        <Text style={styles.sectionDesc}>Play an alert when a known pothole is within this distance.</Text>
        <SegmentedControl
          options={WARNING_DISTANCES}
          selectedValue={settings.warningDistance}
          onSelect={(v) => update('warningDistance', v)}
        />
      </View>

      {/* Sound toggle */}
      <View style={styles.section}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.rowTitle}>Audio Alerts</Text>
            <Text style={styles.rowDesc}>Play a sound when approaching a known pothole.</Text>
          </View>
          <Switch
            value={settings.soundEnabled !== false}
            onValueChange={(v) => update('soundEnabled', v)}
            trackColor={{ false: '#333', true: '#1565C0' }}
            thumbColor={settings.soundEnabled !== false ? '#2196F3' : '#555'}
          />
        </View>
      </View>

      {/* Sensitivity */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Detection Sensitivity</Text>
        <Text style={styles.sectionDesc}>High = detects smaller impacts. Low = only larger potholes.</Text>
        <SegmentedControl
          options={SENSITIVITY_OPTIONS}
          selectedValue={settings.sensitivity ?? 'normal'}
          onSelect={(v) => update('sensitivity', v)}
        />
      </View>

      {/* API URL */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>API URL</Text>
        <Text style={styles.sectionDesc}>Backend server address for logging and fetching potholes.</Text>
        <View style={styles.apiRow}>
          <TextInput
            style={styles.textInput}
            value={apiUrlDraft}
            onChangeText={setApiUrlDraft}
            placeholder="http://localhost:3000"
            placeholderTextColor="#555"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            onSubmitEditing={handleApiUrlSave}
          />
          <TouchableOpacity style={styles.saveBtn} onPress={handleApiUrlSave}>
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Device UUID */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device ID</Text>
        <Text style={styles.sectionDesc}>Your unique device identifier. Share this with support if needed.</Text>
        <View style={styles.uuidBox}>
          <Text style={styles.uuidText} selectable>{deviceUuid}</Text>
        </View>
      </View>

      {/* Clear history */}
      <TouchableOpacity style={styles.dangerBtn} onPress={handleClearHistory}>
        <Text style={styles.dangerBtnText}>Clear Local History</Text>
      </TouchableOpacity>

      {saving && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator color="#2196F3" size="small" />
          <Text style={styles.savingText}>Saving…</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  content: {
    padding: 20,
    paddingBottom: 50,
  },
  centered: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 24,
    marginTop: 10,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  sectionDesc: {
    color: '#555',
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 16,
    gap: 12,
  },
  rowLeft: {
    flex: 1,
  },
  rowTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  rowDesc: {
    color: '#555',
    fontSize: 12,
    lineHeight: 17,
  },
  apiRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    color: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#333',
  },
  saveBtn: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  uuidBox: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  uuidText: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'monospace',
    letterSpacing: 0.3,
  },
  dangerBtn: {
    backgroundColor: '#1A0A0A',
    borderWidth: 1,
    borderColor: '#F44336',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  dangerBtnText: {
    color: '#F44336',
    fontWeight: '600',
    fontSize: 15,
  },
  savingOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  savingText: {
    color: '#666',
    fontSize: 13,
  },
});
