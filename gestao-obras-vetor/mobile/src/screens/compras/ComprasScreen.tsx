import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppStackParamList } from '../../navigation/AppNavigator';
import { listarRequisicoesProjeto } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { CORES } from '../../utils/constants';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Route = RouteProp<AppStackParamList, 'Compras'>;
type Nav = NativeStackNavigationProp<AppStackParamList>;

interface Requisicao {
  id: number;
  numero?: number;
  titulo: string;
  status_geral?: string;
  criado_em?: string;
  criado_por_nome?: string;
  total_itens?: number;
  itens_comprados?: number;
}

const STATUS_CORES: Record<string, { cor: string; corFundo: string }> = {
  pendente: { cor: CORES.textoSecundario, corFundo: CORES.fundo },
  em_andamento: { cor: CORES.alerta, corFundo: CORES.alertaClaro },
  concluido: { cor: CORES.sucesso, corFundo: CORES.sucessoClaro },
  cancelado: { cor: CORES.erro, corFundo: CORES.erroClaro },
};

export default function ComprasScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { projetoId } = route.params;
  const { error } = useNotification();

  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const resp = await listarRequisicoesProjeto(projetoId);
      setRequisicoes(resp.data || []);
    } catch {
      error('Erro ao carregar requisições.');
    } finally {
      setCarregando(false);
      setRefresh(false);
    }
  }, [projetoId, error]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const formatarData = (data?: string) => {
    if (!data) return '';
    try {
      return format(parseISO(data.split('T')[0]), 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return data;
    }
  };

  const renderItem = ({ item }: { item: Requisicao }) => {
    const s = item.status_geral ?? 'pendente';
    const cores = STATUS_CORES[s] ?? STATUS_CORES.pendente;
    const progresso =
      item.total_itens && item.total_itens > 0
        ? Math.round(((item.itens_comprados ?? 0) / item.total_itens) * 100)
        : 0;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() =>
          navigation.navigate('ComprasDetalhe', {
            requisicaoId: item.id,
            projetoId,
          })
        }
        activeOpacity={0.85}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardNumero}>
            REQ #{item.numero ?? item.id}
          </Text>
          <View style={[styles.badge, { backgroundColor: cores.corFundo }]}>
            <Text style={[styles.badgeTexto, { color: cores.cor }]}>
              {s.replace('_', ' ')}
            </Text>
          </View>
        </View>
        <Text style={styles.cardTitulo} numberOfLines={2}>
          {item.titulo}
        </Text>
        {item.total_itens ? (
          <View style={styles.progressoContainer}>
            <View style={styles.progressoBarra}>
              <View
                style={[
                  styles.progressoPreenchimento,
                  { width: `${progresso}%` },
                ]}
              />
            </View>
            <Text style={styles.progressoTexto}>
              {item.itens_comprados ?? 0}/{item.total_itens} itens ({progresso}%)
            </Text>
          </View>
        ) : null}
        {item.criado_em ? (
          <Text style={styles.cardData}>{formatarData(item.criado_em)}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={requisicoes}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.lista}
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
        ListHeaderComponent={
          carregando ? (
            <ActivityIndicator
              size="large"
              color={CORES.primaria}
              style={{ marginTop: 40 }}
            />
          ) : null
        }
        ListEmptyComponent={
          !carregando ? (
            <View style={styles.vazio}>
              <MaterialCommunityIcons
                name="cart-outline"
                size={56}
                color={CORES.desabilitado}
              />
              <Text style={styles.vazioTexto}>Nenhuma requisição</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  lista: { padding: 16, gap: 12, paddingBottom: 32 },
  card: {
    backgroundColor: CORES.superficie,
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardNumero: { fontSize: 13, fontWeight: '600', color: CORES.textoSecundario },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeTexto: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  cardTitulo: { fontSize: 15, fontWeight: '700', color: CORES.texto, marginBottom: 10 },
  progressoContainer: { marginBottom: 6 },
  progressoBarra: {
    height: 6,
    backgroundColor: CORES.borda,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressoPreenchimento: {
    height: '100%',
    backgroundColor: CORES.sucesso,
    borderRadius: 3,
  },
  progressoTexto: { fontSize: 12, color: CORES.textoSecundario },
  cardData: { fontSize: 12, color: CORES.textoSecundario, marginTop: 4 },
  vazio: { alignItems: 'center', marginTop: 80 },
  vazioTexto: { color: CORES.textoSecundario, fontSize: 15, marginTop: 12 },
});
