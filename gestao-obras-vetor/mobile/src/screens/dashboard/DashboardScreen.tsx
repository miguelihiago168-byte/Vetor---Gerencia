import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BarChart } from 'react-native-chart-kit';
import { getCurvaS, getDashboardAvanco, getRDOStats } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { AppStackParamList } from '../../navigation/AppNavigator';
import { CORES } from '../../utils/constants';

type Route = RouteProp<AppStackParamList, 'Dashboard'>;

const screenWidth = Dimensions.get('window').width;

interface DadosAvanco {
  percentual_previsto: number;
  percentual_executado: number;
  atividades_total: number;
  atividades_concluidas: number;
  atividades_em_andamento: number;
}

interface DadosStats {
  total: number;
  aprovados: number;
  em_analise: number;
  reprovados: number;
  em_preenchimento: number;
}

function StatCard({
  label,
  valor,
  cor,
  icon,
}: {
  label: string;
  valor: number | string;
  cor: string;
  icon: string;
}) {
  return (
    <View style={[styles.statCard, { borderTopColor: cor }]}>
      <MaterialCommunityIcons name={icon as never} size={24} color={cor} />
      <Text style={styles.statValor}>{valor}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const route = useRoute<Route>();
  const { projetoId } = route.params;
  const { error } = useNotification();

  const [avanco, setAvanco] = useState<DadosAvanco | null>(null);
  const [stats, setStats] = useState<DadosStats | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [rAvanco, rStats] = await Promise.all([
        getDashboardAvanco(projetoId),
        getRDOStats(projetoId),
      ]);

      let previstoCurvaS: number | null = null;
      try {
        const curvaResp = await getCurvaS(projetoId);
        const indicadorPlanejado = Number(curvaResp.data?.indicadores?.avanco_planejado);
        if (!Number.isNaN(indicadorPlanejado)) {
          previstoCurvaS = indicadorPlanejado;
        }
      } catch {
        // Curva S pode retornar erro quando EAP não está totalmente estruturada.
      }

      const avancoRaw = rAvanco.data ?? {};
      const avancoGeral = avancoRaw.avanco_geral ?? {};
      const atividadesPrincipais = Array.isArray(avancoRaw.atividades_principais)
        ? avancoRaw.atividades_principais
        : [];

      const percentualPrevisto = atividadesPrincipais.length > 0
        ? atividadesPrincipais.reduce(
            (acc: number, item: { percentual_previsto?: number }) =>
              acc + Number(item.percentual_previsto ?? 0),
            0,
          ) / atividadesPrincipais.length
        : 0;

      const percentualPrevistoFinal =
        previstoCurvaS !== null && previstoCurvaS !== undefined
          ? previstoCurvaS
          : percentualPrevisto;

      setAvanco({
        percentual_previsto: Number(percentualPrevistoFinal || 0),
        percentual_executado: Number(avancoGeral.avanco_medio || 0),
        atividades_total: Number(avancoGeral.total_atividades || 0),
        atividades_concluidas: Number(avancoGeral.concluidas || 0),
        atividades_em_andamento: Number(avancoGeral.em_andamento || 0),
      });

      const statsRaw = rStats.data ?? {};
      setStats({
        total: Number(statsRaw.total_rdos ?? statsRaw.total ?? 0),
        aprovados: Number(statsRaw.aprovados ?? 0),
        em_analise: Number(statsRaw.em_analise ?? 0),
        reprovados: Number(statsRaw.reprovados ?? 0),
        em_preenchimento: Number(statsRaw.em_preenchimento ?? 0),
      });
    } catch {
      error('Erro ao carregar dados do dashboard.');
    } finally {
      setCarregando(false);
      setRefresh(false);
    }
  }, [projetoId, error]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={CORES.primaria} />
      </View>
    );
  }

  const previsto = avanco?.percentual_previsto ?? 0;
  const executado = avanco?.percentual_executado ?? 0;
  const desvio = executado - previsto;

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
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroKicker}>Dashboard da obra</Text>
            <Text style={styles.heroTitle}>Avanço físico</Text>
          </View>
          <View style={[styles.deltaBadge, { backgroundColor: desvio >= 0 ? CORES.sucessoClaro : CORES.erroClaro }]}>
            <Text style={[styles.deltaText, { color: desvio >= 0 ? CORES.sucesso : CORES.erro }]}>
              {desvio >= 0 ? '+' : ''}{desvio.toFixed(1)}%
            </Text>
          </View>
        </View>
        <View style={styles.heroProgress}>
          <View style={[styles.heroProgressFill, { width: `${Math.min(Math.max(executado, 0), 100)}%` }]} />
        </View>
        <View style={styles.heroMetrics}>
          <View>
            <Text style={styles.heroMetricLabel}>Previsto</Text>
            <Text style={styles.heroMetricValue}>{previsto.toFixed(1)}%</Text>
          </View>
          <View>
            <Text style={styles.heroMetricLabel}>Executado</Text>
            <Text style={styles.heroMetricValue}>{executado.toFixed(1)}%</Text>
          </View>
          <View>
            <Text style={styles.heroMetricLabel}>Atividades</Text>
            <Text style={styles.heroMetricValue}>{avanco?.atividades_total ?? 0}</Text>
          </View>
        </View>
      </View>

      {/* Avanço físico */}
      <View style={styles.secao}>
        <Text style={styles.secaoTitulo}>Avanço Físico</Text>
        <View style={styles.avancoCard}>
          {/* Previsto */}
          <View style={styles.avancoItem}>
            <Text style={styles.avancoLabel}>Previsto</Text>
            <Text style={[styles.avancoValor, { color: CORES.primaria }]}>
              {previsto.toFixed(1)}%
            </Text>
            <View style={styles.barraFundo}>
              <View
                style={[
                  styles.barraPreenchimento,
                  {
                    width: `${Math.min(previsto, 100)}%`,
                    backgroundColor: CORES.primaria,
                  },
                ]}
              />
            </View>
          </View>
          {/* Executado */}
          <View style={styles.avancoItem}>
            <Text style={styles.avancoLabel}>Executado</Text>
            <Text style={[styles.avancoValor, { color: CORES.sucesso }]}>
              {executado.toFixed(1)}%
            </Text>
            <View style={styles.barraFundo}>
              <View
                style={[
                  styles.barraPreenchimento,
                  {
                    width: `${Math.min(executado, 100)}%`,
                    backgroundColor: CORES.sucesso,
                  },
                ]}
              />
            </View>
          </View>
        </View>
      </View>

      {/* Gráfico de barras */}
      {avanco && (previsto > 0 || executado > 0) && (
        <View style={styles.secao}>
          <Text style={styles.secaoTitulo}>Comparativo</Text>
          <BarChart
            data={{
              labels: ['Previsto', 'Executado'],
              datasets: [{ data: [Math.max(previsto, 0.01), Math.max(executado, 0.01)] }],
            }}
            width={screenWidth - 58}
            height={180}
            yAxisLabel=""
            yAxisSuffix="%"
            chartConfig={{
              backgroundColor: CORES.superficie,
              backgroundGradientFrom: CORES.superficie,
              backgroundGradientTo: CORES.superficie,
              decimalPlaces: 1,
              color: (opacity = 1) => `rgba(21, 101, 192, ${opacity})`,
              labelColor: () => CORES.textoSecundario,
              barPercentage: 0.6,
            }}
            style={{ borderRadius: 12 }}
          />
        </View>
      )}

      {/* Stats de atividades */}
      {avanco && (
        <View style={styles.secao}>
          <Text style={styles.secaoTitulo}>Atividades (EAP)</Text>
          <View style={styles.statsGrid}>
            <StatCard
              label="Total"
              valor={avanco.atividades_total ?? 0}
              cor={CORES.primaria}
              icon="format-list-bulleted"
            />
            <StatCard
              label="Concluídas"
              valor={avanco.atividades_concluidas ?? 0}
              cor={CORES.sucesso}
              icon="check-circle-outline"
            />
            <StatCard
              label="Em andamento"
              valor={avanco.atividades_em_andamento ?? 0}
              cor={CORES.alerta}
              icon="progress-clock"
            />
          </View>
        </View>
      )}

      {/* Stats de RDOs */}
      {stats && (
        <View style={styles.secao}>
          <Text style={styles.secaoTitulo}>RDOs</Text>
          <View style={styles.statsGrid}>
            <StatCard
              label="Total"
              valor={stats.total ?? 0}
              cor={CORES.primaria}
              icon="clipboard-text-outline"
            />
            <StatCard
              label="Aprovados"
              valor={stats.aprovados ?? 0}
              cor={CORES.sucesso}
              icon="check-all"
            />
            <StatCard
              label="Em análise"
              valor={stats.em_analise ?? 0}
              cor={CORES.info}
              icon="magnify"
            />
            <StatCard
              label="Reprovados"
              valor={stats.reprovados ?? 0}
              cor={CORES.erro}
              icon="close-circle-outline"
            />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  content: { padding: 16, gap: 0, paddingBottom: 32 },
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hero: {
    backgroundColor: CORES.primariaEscura,
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
    elevation: 2,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroKicker: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  heroTitle: { color: '#FFF', fontSize: 24, fontWeight: '900', marginTop: 4 },
  deltaBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  deltaText: { fontSize: 13, fontWeight: '900' },
  heroProgress: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginTop: 18,
  },
  heroProgressFill: { height: '100%', borderRadius: 999, backgroundColor: CORES.secundaria },
  heroMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  heroMetricLabel: { color: 'rgba(255,255,255,0.68)', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  heroMetricValue: { color: '#FFF', fontSize: 20, fontWeight: '900', marginTop: 3 },
  secao: { marginBottom: 20 },
  secaoTitulo: {
    fontSize: 16,
    fontWeight: '700',
    color: CORES.texto,
    marginBottom: 10,
  },
  avancoCard: {
    backgroundColor: CORES.superficie,
    borderRadius: 12,
    padding: 16,
    gap: 16,
    elevation: 2,
    borderWidth: 1,
    borderColor: CORES.borda,
  },
  avancoItem: {},
  avancoLabel: {
    fontSize: 13,
    color: CORES.textoSecundario,
    marginBottom: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  avancoValor: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  barraFundo: {
    height: 8,
    backgroundColor: CORES.borda,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barraPreenchimento: {
    height: '100%',
    borderRadius: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    backgroundColor: CORES.superficie,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    flex: 1,
    minWidth: '45%',
    borderTopWidth: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: CORES.borda,
    gap: 4,
  },
  statValor: {
    fontSize: 24,
    fontWeight: 'bold',
    color: CORES.texto,
  },
  statLabel: {
    fontSize: 11,
    color: CORES.textoSecundario,
    textAlign: 'center',
  },
});
