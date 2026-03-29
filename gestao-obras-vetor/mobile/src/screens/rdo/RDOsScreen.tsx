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
import { getRDOs } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { CORES, STATUS_RDO } from '../../utils/constants';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Route = RouteProp<AppStackParamList, 'RDOs'>;
type Nav = NativeStackNavigationProp<AppStackParamList>;

interface RDO {
  id: number;
  numero_rdo?: number;
  data_rdo: string;
  status: keyof typeof STATUS_RDO;
  criado_por_nome?: string;
  descricao_atividades?: string;
}

export default function RDOsScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { projetoId } = route.params;
  const { error } = useNotification();
  const { isGestor } = useAuth();

  const [rdos, setRdos] = useState<RDO[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const resp = await getRDOs(projetoId);
      setRdos(resp.data || []);
    } catch {
      error('Erro ao carregar RDOs.');
    } finally {
      setCarregando(false);
      setRefresh(false);
    }
  }, [projetoId, error]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const formatarData = (data: string) => {
    try {
      return format(parseISO(data.split('T')[0]), "dd 'de' MMMM 'de' yyyy", {
        locale: ptBR,
      });
    } catch {
      return data;
    }
  };

  const renderItem = ({ item }: { item: RDO }) => {
    const statusInfo = STATUS_RDO[item.status] ?? {
      label: item.status,
      cor: CORES.textoSecundario,
      corFundo: CORES.fundo,
    };
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() =>
          navigation.navigate('RDODetalhes', {
            rdoId: item.id,
            projetoId,
          })
        }
        activeOpacity={0.85}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardNumero}>
            RDO #{item.numero_rdo ?? item.id}
          </Text>
          <View
            style={[
              styles.badge,
              { backgroundColor: statusInfo.corFundo },
            ]}
          >
            <Text style={[styles.badgeTexto, { color: statusInfo.cor }]}>
              {statusInfo.label}
            </Text>
          </View>
        </View>
        <Text style={styles.cardData}>{formatarData(item.data_rdo)}</Text>
        {item.descricao_atividades ? (
          <Text style={styles.cardDesc} numberOfLines={2}>
            {item.descricao_atividades}
          </Text>
        ) : null}
        {item.criado_por_nome ? (
          <Text style={styles.cardMeta}>
            <MaterialCommunityIcons
              name="account-outline"
              size={12}
              color={CORES.textoSecundario}
            />{' '}
            {item.criado_por_nome}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={rdos}
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
                name="clipboard-text-outline"
                size={56}
                color={CORES.desabilitado}
              />
              <Text style={styles.vazioTexto}>Nenhum RDO encontrado</Text>
            </View>
          ) : null
        }
      />

      {/* FAB - Novo RDO */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('RDOForm', { projetoId })}
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
  cardNumero: {
    fontSize: 15,
    fontWeight: '700',
    color: CORES.texto,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeTexto: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardData: {
    fontSize: 13,
    color: CORES.textoSecundario,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: CORES.texto,
    marginTop: 6,
    lineHeight: 18,
  },
  cardMeta: {
    fontSize: 12,
    color: CORES.textoSecundario,
    marginTop: 8,
  },
  vazio: { alignItems: 'center', marginTop: 80 },
  vazioTexto: {
    color: CORES.textoSecundario,
    fontSize: 15,
    marginTop: 12,
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: CORES.primaria,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
});
