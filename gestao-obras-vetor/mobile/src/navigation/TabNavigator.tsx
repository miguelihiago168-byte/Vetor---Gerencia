import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CORES } from '../utils/constants';
import ProjetosScreen from '../screens/projetos/ProjetosScreen';
import NotificacoesScreen from '../screens/notificacoes/NotificacoesScreen';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: CORES.primaria,
        tabBarInactiveTintColor: CORES.textoSecundario,
        tabBarStyle: {
          borderTopColor: CORES.borda,
          backgroundColor: CORES.superficie,
          elevation: 8,
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 12 },
        headerStyle: { backgroundColor: CORES.primaria },
        headerTintColor: '#FFF',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Tab.Screen
        name="Projetos"
        component={ProjetosScreen}
        options={{
          title: 'Projetos',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="briefcase-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Notificacoes"
        component={NotificacoesScreen}
        options={{
          title: 'Notificações',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="bell-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
