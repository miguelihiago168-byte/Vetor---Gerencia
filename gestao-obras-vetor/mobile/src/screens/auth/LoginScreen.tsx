import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { login } from '../../services/api';
import { CORES } from '../../utils/constants';

export default function LoginScreen() {
  const [loginInput, setLoginInput] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);

  const { loginAuth } = useAuth();
  const { error } = useNotification();

  const handleLogin = async () => {
    if (!loginInput.trim() || !senha.trim()) {
      error('Preencha login e senha.');
      return;
    }
    setCarregando(true);
    try {
      const resp = await login({ login: loginInput.trim(), senha: senha.trim() });
      const { token, usuario } = resp.data;
      await loginAuth(token, usuario);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Erro ao fazer login. Verifique o servidor.';
      error(msg);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior="height">
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>V</Text>
          </View>
          <Text style={styles.titulo}>Vetor Obras</Text>
          <Text style={styles.subtitulo}>Gestão de Obras</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Entrar no sistema</Text>

          <Text style={styles.label}>Login</Text>
          <TextInput
            style={styles.input}
            value={loginInput}
            onChangeText={setLoginInput}
            placeholder="Ex: 000001"
            placeholderTextColor={CORES.desabilitado}
            keyboardType="numeric"
            maxLength={6}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Senha</Text>
          <TextInput
            style={styles.input}
            value={senha}
            onChangeText={setSenha}
            placeholder="Senha"
            placeholderTextColor={CORES.desabilitado}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={handleLogin}
            returnKeyType="done"
          />

          <TouchableOpacity
            style={[styles.botao, carregando && styles.botaoDesabilitado]}
            onPress={handleLogin}
            disabled={carregando}
            activeOpacity={0.85}
          >
            {carregando ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.botaoTexto}>ENTRAR</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.rodape}>Vetor — Uso interno</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CORES.primaria,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    elevation: 4,
  },
  logoText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: CORES.primaria,
  },
  titulo: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
  },
  subtitulo: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  cardTitulo: {
    fontSize: 18,
    fontWeight: '600',
    color: CORES.texto,
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: CORES.textoSecundario,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: CORES.borda,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: CORES.texto,
    backgroundColor: CORES.fundo,
    marginBottom: 16,
  },
  botao: {
    backgroundColor: CORES.primaria,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    elevation: 2,
  },
  botaoDesabilitado: {
    opacity: 0.7,
  },
  botaoTexto: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  rodape: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 24,
  },
});
