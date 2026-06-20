import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';

import HomeScreen from '../screens/HomeScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

// Minimal icon renderer — no icon library dependency
function TabIcon({ symbol, focused, color }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20, color: focused ? color : '#555' }}>{symbol}</Text>
    </View>
  );
}

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#0F0F0F', borderBottomColor: '#1E1E1E' },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: '#0F0F0F',
          borderTopColor: '#1E1E1E',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: '#2196F3',
        tabBarInactiveTintColor: '#555',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Home',
          headerTitle: 'Pothole Tracker',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon symbol="🚗" focused={focused} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: 'History',
          headerTitle: 'Detection History',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon symbol="📋" focused={focused} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          headerTitle: 'Settings',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon symbol="⚙️" focused={focused} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
