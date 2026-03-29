import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <MaterialCommunityIcons name="alert-circle-outline" size={56} color="#C62828" />
        <Text style={styles.titulo}>Algo deu errado</Text>
        <ScrollView style={styles.detalhes}>
          <Text style={styles.erro}>{this.state.error?.message}</Text>
        </ScrollView>
        <TouchableOpacity style={styles.botao} onPress={this.reset}>
          <Text style={styles.botaoTexto}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#F5F5F5',
    gap: 16,
  },
  titulo: { fontSize: 20, fontWeight: '700', color: '#212121', textAlign: 'center' },
  detalhes: {
    maxHeight: 160,
    width: '100%',
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    padding: 12,
  },
  erro: { fontSize: 12, color: '#C62828', fontFamily: 'monospace' },
  botao: {
    backgroundColor: '#1565C0',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
  },
  botaoTexto: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});
