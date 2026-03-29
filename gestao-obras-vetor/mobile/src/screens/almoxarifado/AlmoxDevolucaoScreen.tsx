import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppStackParamList } from '../../navigation/AppNavigator';
import { getAlocacoesAbertas, registrarDevolucaoFerramenta } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { CORES } from '../../utils/constants';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Route = RouteProp<AppStackParamList, 'AlmoxDevolucao'>;

interface Alocacao {
  id: number;
  ferramenta_nome: string;
  ferramenta_id: number;
  colaborador_nome?: string;
  quantidade: number;
  data_saida: string;
}

export default function AlmoxDevolucaoScreen() {
  const route = useRoute<Route>();
  const { projetoId } = route.params;
  const { success, error } = useNotification();

  const [alocacoes, setAlocacoes] = useState<Alocacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [enviando, setEnviando] = useState<number | null>(null);
  const [observacaoMap, setObservacaoMap] = useState<Record<number, string>>({});

  const carregar = useCallback(async () => {
    try {
      const resp = await getAlocacoesAbertas(projetoId);
      setAlocacoes(resp.data ?? []);
    } catch {
      error('Erro ao carregar alocações.');
    } finally {
      setCarregando(false);
      setRefresh(false);
    }
  }, [projetoId, error]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const devolver = (alocacao: Alocacao) => {
    Alert.alert(
      'Confirmar devolução',
      `Devolver ${alocacao.quantidade}x ${alocacao.ferramenta_nome}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Devolver',
          onPress: async () => {
            setEnviando(alocacao.id);
            try {
              await registrarDevolucaoFerramenta(alocacao.id, {
                observacoes: observacaoMap[alocacao.id] ?? '',
              });
              success('Devolução registrada!');
              setAlocacoes((prev) => prev.filter((a) => a.id !== alocacao.id));
            } catch {
              error('Erro ao registrar devolução.');
            } finally {
              setEnviando(null);
            }
          },
        },
      ]
    );
  };

  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={CORES.primaria} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={alocacoes}
      keyExtractor={(item) => String(item.id)}
      refreshControl={
        <RefreshControl
          refreshing={refresh}
          onRefresh={() => {
            setRefresh(true);
            carregar();
          }}
          colors={[CORES.primaria]}
        />
      }
      ListEmptyComponent={
        <View style={styles.vazio}>
          <MaterialCommunityIcons name="check-circle-outline" size={52} color={CORES.sucesso} />
          <Text style={styles.vazioTexto}>Nenhuma retirada em aberto.</Text>
        </View>
      }
      renderItem={({ item }) => {
        const dataFormatada = (() => {
          try {
            return format(parseISO(item.data_saida), "dd/MM/yyyy", { locale: ptBR });
          } catch {
            return item.data_saida;
          }
        })();

        return (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="hammer-wrench" size={22} color={CORES.primaria} />
              <View style={styles.cardInfo}>
                <Text style={styles.ferramentaNome}>{item.ferramenta_nome}</Text>
                {item.colaborador_nome ? (
                  <Text style={styles.colaboradorNome}>{item.colaborador_nome}</Text>
                ) : null}
                <Text style={styles.sub}>
                  {item.quantidade} un · Saída: {dataFormatada}
                </Text>
              </View>
            </View>

            <TextInput
              style={styles.obsInput}
              placeholder="Observação sobre a condição (opcional)"
              value={observacaoMap[item.id] ?? ''}
              onChangeText={(text) =>
                setObservacaoMap((prev) => ({ ...prev, [item.id]: text }))
              }
              placeholderTextColor={CORES.textoSecundario}
            />

            <TouchableOpacity
              style={[styles.botao, enviando === item.id && styles.botaoDesabilitado]}
              onPress={() => devolver(item)}
              disabled={enviando === item.id}
              activeOpacity={0.8}
            >
              {enviando === item.id ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.botaoTexto}>Registrar Devolução</Text>
              )}
            </TouchableOpacity>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  content: { padding: 16, paddingBottom: 40, gap: 0 },
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  vazio: { alignItems: 'center', paddingTop: 80, gap: 12 },
  vazioTexto: { fontSize: 15, color: CORES.textoSecundario },
  card: {
    backgroundColor: CORES.superficie,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  cardInfo: { flex: 1 },
  ferramentaNome: { fontSize: 16, fontWeight: '600', color: CORES.texto },
  colaboradorNome: { fontSize: 13, color: CORES.primaria, marginTop: 2 },
  sub: { fontSize: 12, color: CORES.textoSecundario, marginTop: 2 },
  obsInput: {
    backgroundColor: CORES.fundo,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CORES.borda,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: CORES.texto,
  },
  botao: {
    backgroundColor: CORES.sucesso,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  botaoDesabilitado: { opacity: 0.7 },
  botaoTexto: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
