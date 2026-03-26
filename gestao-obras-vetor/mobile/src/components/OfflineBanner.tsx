import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetwork } from '../context/NetworkContext';

export default function OfflineBanner() {
  const { isOnline, pendingCount, isSyncing } = useNetwork();
  const translateY = useRef(new Animated.Value(-60)).current;

  const show = !isOnline || isSyncing || pendingCount > 0;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: show ? 0 : -60,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [show, translateY]);

  if (!show) return null;

  const isOffline = !isOnline;
  const bgColor = isOffline ? '#B71C1C' : '#E65100';
  const icone = isOffline ? 'wifi-off' : 'sync';
  const msg = isOffline
    ? 'Sem conexão · exibindo dados em cache'
    : `Sincronizando ${pendingCount} ação${pendingCount !== 1 ? 'ões' : ''} pendente${pendingCount !== 1 ? 's' : ''}...`;

  return (
    <Animated.View style={[styles.banner, { backgroundColor: bgColor, transform: [{ translateY }] }]}>
      <MaterialCommunityIcons name={icone as any} size={15} color="#FFF" />
      <Text style={styles.texto}>{msg}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 16,
    zIndex: 999,
  },
  texto: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
