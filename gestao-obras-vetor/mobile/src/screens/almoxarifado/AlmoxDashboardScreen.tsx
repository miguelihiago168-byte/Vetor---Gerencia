import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppStackParamList } from '../../navigation/AppNavigator';
import { getDashboardAlmoxarifado } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { CORES } from '../../utils/constants';

type Route = RouteProp<AppStackParamList, 'AlmoxDashboard'>;
type Nav = NativeStackNavigationProp<AppStackParamList>;

interface DashboardData {
  total_ferramentas?: number;
  ferramentas_disponiveis?: number;
  ferramentas_alocadas?: number;
  alocacoes_abertas?: number;
}

export default function AlmoxDashboardScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { projetoId, projetoNome } = route.params;
  const { error } = useNotification();

  const [dados, setDados] = useState<DashboardData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const resp = await getDashboardAlmoxarifado(projetoId);
      setDados(resp.data);
    } catch {
      error('Erro ao carregar almoxarifado.');
    } finally {
      setCarregando(false);
      setRefresh(false);
    }
  }, [projetoId, error]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={CORES.primaria} />
      </View>
    );
  }

  const stats = [
    {
      label: 'Total Ferramentas',
      valor: dados?.total_ferramentas ?? 0,
      icone: 'toolbox-outline',
      cor: CORES.primaria,
      fundo: CORES.primariaMuitoClara,
    },
    {
      label: 'Disponíveis',
      valor: dados?.ferramentas_disponiveis ?? 0,
      icone: 'check-circle-outline',
      cor: CORES.sucesso,
      fundo: CORES.sucessoClaro,
    },
    {
      label: 'Alocadas',
      valor: dados?.ferramentas_alocadas ?? 0,
      icone: 'hard-hat',
      cor: CORES.aviso,
      fundo: CORES.avisoClaro,
    },
    {
      label: 'Retiradas abertas',
      valor: dados?.alocacoes_abertas ?? 0,
      icone: 'clipboard-list-outline',
      cor: CORES.erro,
      fundo: CORES.erroClaro,
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
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
    >
      {/* Stat cards */}
      <View style={styles.grid}>
        {stats.map((s) => (
          <View key={s.label} style={[styles.statCard, { backgroundColor: s.fundo }]}>
            <MaterialCommunityIcons name={s.icone as any} size={28} color={s.cor} />
            <Text style={[styles.statValor, { color: s.cor }]}>{s.valor}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Ações rápidas */}
      <Text style={styles.secaoTitulo}>Movimentações</Text>

      <TouchableOpacity
        style={styles.acaoCard}
        onPress={() => navigation.navigate('AlmoxRetirada', { projetoId })}
        activeOpacity={0.8}
      >
        <View style={[styles.acaoIcone, { backgroundColor: CORES.primariaMuitoClara }]}>
          <MaterialCommunityIcons name="export" size={26} color={CORES.primaria} />
        </View>
        <View style={styles.acaoTexto}>
          <Text style={styles.acaoTitulo}>Registrar Retirada</Text>
          <Text style={styles.acaoDesc}>Registrar saída de ferramenta ou equipamento</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={CORES.textoSecundario} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.acaoCard}
        onPress={() => navigation.navigate('AlmoxDevolucao', { projetoId })}
        activeOpacity={0.8}
      >
        <View style={[styles.acaoIcone, { backgroundColor: CORES.sucessoClaro }]}>
          <MaterialCommunityIcons name="import" size={26} color={CORES.sucesso} />
        </View>
        <View style={styles.acaoTexto}>
          <Text style={styles.acaoTitulo}>Registrar Devolução</Text>
          <Text style={styles.acaoDesc}>Dar entrada de ferramenta ou equipamento</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={CORES.textoSecundario} />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  content: { padding: 16, gap: 0, paddingBottom: 40 },
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statCard: {
    width: '47%',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 6,
  },
  statValor: { fontSize: 32, fontWeight: '800' },
  statLabel: { fontSize: 12, color: CORES.textoSecundario, textAlign: 'center' },
  secaoTitulo: {
    fontSize: 14,
    fontWeight: '700',
    color: CORES.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  acaoCard: {
    backgroundColor: CORES.superficie,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
    elevation: 2,
  },
  acaoIcone: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  acaoTexto: { flex: 1 },
  acaoTitulo: { fontSize: 16, fontWeight: '600', color: CORES.texto },
  acaoDesc: { fontSize: 12, color: CORES.textoSecundario, marginTop: 2 },
});
