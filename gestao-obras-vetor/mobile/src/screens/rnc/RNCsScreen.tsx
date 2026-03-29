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
import { getRNCs } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { CORES, STATUS_RNC } from '../../utils/constants';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Route = RouteProp<AppStackParamList, 'RNCs'>;
type Nav = NativeStackNavigationProp<AppStackParamList>;

interface RNC {
  id: number;
  numero_rnc?: number;
  titulo: string;
  status: keyof typeof STATUS_RNC;
  criado_em?: string;
  responsavel_nome?: string;
  tipo?: string;
}

export default function RNCsScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { projetoId } = route.params;
  const { error } = useNotification();

  const [rncs, setRncs] = useState<RNC[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const resp = await getRNCs(projetoId);
      setRncs(resp.data || []);
    } catch {
      error('Erro ao carregar RNCs.');
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

  const renderItem = ({ item }: { item: RNC }) => {
    const statusInfo = STATUS_RNC[item.status] ?? {
      label: item.status,
      cor: CORES.textoSecundario,
      corFundo: CORES.fundo,
    };
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() =>
          navigation.navigate('RNCDetalhes', { rncId: item.id, projetoId })
        }
        activeOpacity={0.85}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardNumero}>
            RNC #{item.numero_rnc ?? item.id}
          </Text>
          <View style={[styles.badge, { backgroundColor: statusInfo.corFundo }]}>
            <Text style={[styles.badgeTexto, { color: statusInfo.cor }]}>
              {statusInfo.label}
            </Text>
          </View>
        </View>
        <Text style={styles.cardTitulo} numberOfLines={2}>
          {item.titulo}
        </Text>
        {item.tipo ? (
          <Text style={styles.cardMeta}>{item.tipo}</Text>
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
        data={rncs}
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
                name="alert-circle-outline"
                size={56}
                color={CORES.desabilitado}
              />
              <Text style={styles.vazioTexto}>Nenhuma RNC encontrada</Text>
            </View>
          ) : null
        }
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('RNCForm', { projetoId })}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="plus" size={28} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  lista: { padding: 16, gap: 12, paddingBottom: 90 },
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
    marginBottom: 6,
  },
  cardNumero: { fontSize: 13, fontWeight: '600', color: CORES.textoSecundario },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeTexto: { fontSize: 12, fontWeight: '600' },
  cardTitulo: { fontSize: 15, fontWeight: '700', color: CORES.texto, marginBottom: 4 },
  cardMeta: { fontSize: 12, color: CORES.textoSecundario, marginTop: 2 },
  cardData: { fontSize: 12, color: CORES.textoSecundario, marginTop: 4 },
  vazio: { alignItems: 'center', marginTop: 80 },
  vazioTexto: { color: CORES.textoSecundario, fontSize: 15, marginTop: 12 },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: CORES.erro,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
});
