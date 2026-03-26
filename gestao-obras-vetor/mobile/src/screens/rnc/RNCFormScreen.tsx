import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppStackParamList } from '../../navigation/AppNavigator';
import { getRNC, createRNC, updateRNC } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { CORES } from '../../utils/constants';

type Route = RouteProp<AppStackParamList, 'RNCForm'>;
type Nav = NativeStackNavigationProp<AppStackParamList>;

const TIPOS_RNC = [
  'Qualidade',
  'Segurança',
  'Meio Ambiente',
  'Prazo',
  'Documentação',
  'Outro',
];

export default function RNCFormScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { projetoId, rncId } = route.params;
  const { success, error } = useNotification();

  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [causaRaiz, setCausaRaiz] = useState('');
  const [acaoCorretiva, setAcaoCorretiva] = useState('');
  const [prazoCorrecao, setPrazoCorrecao] = useState('');
  const [carregando, setCarregando] = useState(!!rncId);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!rncId) return;
    try {
      const resp = await getRNC(rncId);
      const r = resp.data;
      if (r.titulo) setTitulo(String(r.titulo));
      if (r.tipo) setTipo(String(r.tipo));
      if (r.descricao) setDescricao(String(r.descricao));
      if (r.causa_raiz) setCausaRaiz(String(r.causa_raiz));
      if (r.acao_corretiva) setAcaoCorretiva(String(r.acao_corretiva));
      if (r.prazo_correcao)
        setPrazoCorrecao(String(r.prazo_correcao).split('T')[0]);
    } catch {
      error('Erro ao carregar RNC.');
    } finally {
      setCarregando(false);
    }
  }, [rncId, error]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvar = async () => {
    if (!titulo.trim()) {
      error('Informe o título da RNC.');
      return;
    }
    setSalvando(true);
    try {
      const payload: Record<string, unknown> = {
        projeto_id: projetoId,
        titulo: titulo.trim(),
        tipo,
        descricao,
        causa_raiz: causaRaiz,
        acao_corretiva: acaoCorretiva,
        prazo_correcao: prazoCorrecao || undefined,
      };

      if (rncId) {
        await updateRNC(rncId, payload);
      } else {
        await createRNC(payload);
      }

      success(rncId ? 'RNC atualizada!' : 'RNC criada com sucesso!');
      navigation.goBack();
    } catch {
      error('Erro ao salvar RNC.');
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={CORES.primaria} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Título */}
      <Campo label="Título *">
        <TextInput
          style={styles.input}
          value={titulo}
          onChangeText={setTitulo}
          placeholder="Descreva resumidamente a não conformidade"
          placeholderTextColor={CORES.desabilitado}
        />
      </Campo>

      {/* Tipo */}
      <Campo label="Tipo">
        <View style={styles.chipGrid}>
          {TIPOS_RNC.map((op) => (
            <TouchableOpacity
              key={op}
              style={[styles.chip, tipo === op && styles.chipAtivo]}
              onPress={() => setTipo((prev) => (prev === op ? '' : op))}
            >
              <Text
                style={[
                  styles.chipTexto,
                  tipo === op && styles.chipTextoAtivo,
                ]}
              >
                {op}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Campo>

      {/* Descrição */}
      <Campo label="Descrição">
        <TextInput
          style={[styles.input, styles.textarea]}
          value={descricao}
          onChangeText={setDescricao}
          placeholder="Descreva detalhadamente a não conformidade..."
          placeholderTextColor={CORES.desabilitado}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </Campo>

      {/* Causa raiz */}
      <Campo label="Causa Raiz">
        <TextInput
          style={[styles.input, styles.textarea]}
          value={causaRaiz}
          onChangeText={setCausaRaiz}
          placeholder="Identifique a causa raiz..."
          placeholderTextColor={CORES.desabilitado}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </Campo>

      {/* Ação corretiva */}
      <Campo label="Ação Corretiva">
        <TextInput
          style={[styles.input, styles.textarea]}
          value={acaoCorretiva}
          onChangeText={setAcaoCorretiva}
          placeholder="Descreva a ação corretiva proposta..."
          placeholderTextColor={CORES.desabilitado}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </Campo>

      {/* Prazo */}
      <Campo label="Prazo de correção">
        <TextInput
          style={styles.input}
          value={prazoCorrecao}
          onChangeText={setPrazoCorrecao}
          placeholder="AAAA-MM-DD"
          placeholderTextColor={CORES.desabilitado}
          keyboardType="numbers-and-punctuation"
        />
      </Campo>

      <TouchableOpacity
        style={[styles.salvarBtn, salvando && styles.botaoDesabilitado]}
        onPress={salvar}
        disabled={salvando}
        activeOpacity={0.85}
      >
        {salvando ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <MaterialCommunityIcons
              name="content-save-outline"
              size={20}
              color="#FFF"
            />
            <Text style={styles.salvarTexto}>
              {rncId ? 'Atualizar RNC' : 'Criar RNC'}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function Campo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.campoContainer}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  content: { padding: 16, gap: 0, paddingBottom: 40 },
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  campoContainer: { marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: CORES.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: CORES.borda,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: CORES.texto,
    backgroundColor: CORES.superficie,
  },
  textarea: { minHeight: 90, paddingTop: 12 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CORES.borda,
    backgroundColor: CORES.superficie,
  },
  chipAtivo: { backgroundColor: CORES.erro, borderColor: CORES.erro },
  chipTexto: { fontSize: 13, color: CORES.textoSecundario },
  chipTextoAtivo: { color: '#FFF', fontWeight: '600' },
  salvarBtn: {
    backgroundColor: CORES.erro,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    elevation: 2,
  },
  botaoDesabilitado: { opacity: 0.7 },
  salvarTexto: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
});
