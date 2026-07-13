import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { LineChart } from 'react-native-chart-kit';
import { AppStackParamList } from '../../navigation/AppNavigator';
import { CORES } from '../../utils/constants';
import { getCurvaS, obterDadosGantt } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';

type Route = RouteProp<AppStackParamList, 'Planejamento'>;

type CurvaSerie = {
  data: string;
  planejado: number;
  real: number;
};

type CurvaSResponse = {
  indicadores?: {
    avanco_planejado?: number;
    avanco_real?: number;
    desvio?: number;
    spi?: number;
    spi_status?: string;
  };
  serie?: CurvaSerie[];
  atrasos?: Array<{
    id_atividade?: string;
    nome?: string;
    status?: string;
    dias_atraso?: number;
    percentual_executado?: number;
  }>;
};

type GanttAtividade = {
  id: number;
  nome?: string;
  codigo_eap?: string;
  percentual_executado?: number;
  no_caminho_critico?: boolean;
  atrasado?: boolean;
};

type GanttResponse = {
  atividades?: GanttAtividade[];
};

const screenWidth = Dimensions.get('window').width;

function KPI({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.kpiCard, { borderTopColor: color }]}> 
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
    </View>
  );
}

export default function PlanejamentoScreen() {
  const route = useRoute<Route>();
  const { projetoId } = route.params;
  const { error } = useNotification();

  const [curvaS, setCurvaS] = useState<CurvaSResponse | null>(null);
  const [gantt, setGantt] = useState<GanttResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [curvaResp, ganttResp] = await Promise.all([
        getCurvaS(projetoId),
        obterDadosGantt(projetoId, {
          incluirNaoConfirmadas: 'false',
          mostrarCaminoCritico: 'true',
        }),
      ]);

      setCurvaS(curvaResp.data ?? null);
      setGantt(ganttResp.data ?? null);
    } catch {
      error('Erro ao carregar Planejamento.');
    } finally {
      setCarregando(false);
      setRefreshing(false);
    }
  }, [projetoId, error]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const indicadores = curvaS?.indicadores ?? {};

  const curvaSerie = useMemo(() => {
    const serie = curvaS?.serie ?? [];
    if (serie.length === 0) {
      return {
        labels: ['-'],
        planejado: [0],
        real: [0],
      };
    }

    const maxPontos = 8;
    const step = Math.max(1, Math.floor(serie.length / maxPontos));
    const reduzida = serie.filter((_, idx) => idx % step === 0 || idx === serie.length - 1);

    return {
      labels: reduzida.map((p) => {
        const [ano, mes, dia] = String(p.data).split('-');
        return dia && mes ? `${dia}/${mes}` : String(p.data);
      }),
      planejado: reduzida.map((p) => Number(p.planejado || 0)),
      real: reduzida.map((p) => Number(p.real || 0)),
    };
  }, [curvaS?.serie]);

  const resumoCronograma = useMemo(() => {
    const atividades = gantt?.atividades ?? [];
    const total = atividades.length;
    const atrasadas = atividades.filter((a) => a.atrasado).length;
    const criticas = atividades.filter((a) => a.no_caminho_critico).length;
    const concluidas = atividades.filter((a) => Number(a.percentual_executado || 0) >= 100).length;

    return {
      total,
      atrasadas,
      criticas,
      concluidas,
      concluidasPct: total > 0 ? Math.round((concluidas / total) * 100) : 0,
    };
  }, [gantt?.atividades]);

  if (carregando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={CORES.primaria} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            carregar();
          }}
          colors={[CORES.primaria]}
        />
      }
    >
      <View style={styles.hero}>
        <View>
          <Text style={styles.heroKicker}>Planejamento</Text>
          <Text style={styles.heroTitle}>Curva S e caminho crítico</Text>
        </View>
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeValue}>{Number(indicadores.spi || 0).toFixed(2)}</Text>
          <Text style={styles.heroBadgeLabel}>SPI</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Curva S</Text>

      <View style={styles.kpiGrid}>
        <KPI
          label="Planejado"
          value={`${Number(indicadores.avanco_planejado || 0).toFixed(2)}%`}
          color={CORES.primaria}
        />
        <KPI
          label="Real"
          value={`${Number(indicadores.avanco_real || 0).toFixed(2)}%`}
          color={CORES.sucesso}
        />
        <KPI
          label="Desvio"
          value={`${Number(indicadores.desvio || 0).toFixed(2)}%`}
          color={Number(indicadores.desvio || 0) < 0 ? CORES.erro : CORES.info}
        />
        <KPI
          label="SPI"
          value={Number(indicadores.spi || 0).toFixed(3)}
          color={CORES.alerta}
        />
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.cardTitle}>Planejado x Real</Text>
        <LineChart
          data={{
            labels: curvaSerie.labels,
            datasets: [
              { data: curvaSerie.planejado, color: () => CORES.primaria, strokeWidth: 2 },
              { data: curvaSerie.real, color: () => CORES.sucesso, strokeWidth: 2 },
            ],
            legend: ['Planejado', 'Real'],
          }}
          width={screenWidth - 58}
          height={220}
          yAxisSuffix="%"
          fromZero
          chartConfig={{
            backgroundColor: CORES.superficie,
            backgroundGradientFrom: CORES.superficie,
            backgroundGradientTo: CORES.superficie,
            decimalPlaces: 1,
            color: () => CORES.primaria,
            labelColor: () => CORES.textoSecundario,
            propsForDots: { r: '3' },
          }}
          bezier
          style={styles.chart}
        />
      </View>

      <Text style={styles.sectionTitle}>Planejamento (Cronograma)</Text>
      <View style={styles.kpiGrid}>
        <KPI label="Atividades" value={String(resumoCronograma.total)} color={CORES.primaria} />
        <KPI label="Concluídas" value={`${resumoCronograma.concluidasPct}%`} color={CORES.sucesso} />
        <KPI label="Críticas" value={String(resumoCronograma.criticas)} color={CORES.alerta} />
        <KPI label="Atrasadas" value={String(resumoCronograma.atrasadas)} color={CORES.erro} />
      </View>

      <View style={styles.listCard}>
        <Text style={styles.cardTitle}>Atividades em atraso</Text>
        {(curvaS?.atrasos ?? []).length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma atividade em atraso no momento.</Text>
        ) : (
          (curvaS?.atrasos ?? []).slice(0, 10).map((item, idx) => (
            <View key={`${item.id_atividade || idx}`} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{item.nome || item.id_atividade || 'Atividade'}</Text>
                <Text style={styles.itemSub}>{item.status || 'Atrasada'}</Text>
              </View>
              <Text style={styles.itemBadge}>{item.dias_atraso || 0}d</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  content: { padding: 16, paddingBottom: 28 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hero: {
    backgroundColor: CORES.primariaEscura,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroKicker: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  heroTitle: { color: '#FFF', fontSize: 20, fontWeight: '900', marginTop: 4, maxWidth: 210 },
  heroBadge: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: CORES.secundaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadgeValue: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  heroBadgeLabel: { color: 'rgba(255,255,255,0.82)', fontSize: 11, fontWeight: '800' },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: CORES.texto,
    marginBottom: 10,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    backgroundColor: CORES.superficie,
    borderRadius: 10,
    padding: 12,
    minWidth: '47%',
    flex: 1,
    borderTopWidth: 3,
    elevation: 2,
  },
  kpiLabel: {
    color: CORES.textoSecundario,
    fontSize: 12,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  chartCard: {
    backgroundColor: CORES.superficie,
    borderRadius: 12,
    padding: 10,
    marginBottom: 18,
    elevation: 2,
    overflow: 'hidden',
  },
  chart: {
    borderRadius: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: CORES.texto,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  listCard: {
    backgroundColor: CORES.superficie,
    borderRadius: 12,
    padding: 12,
    elevation: 2,
  },
  emptyText: {
    color: CORES.textoSecundario,
    fontSize: 13,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: CORES.borda,
    gap: 10,
  },
  itemTitle: {
    fontSize: 13,
    color: CORES.texto,
    fontWeight: '600',
  },
  itemSub: {
    fontSize: 12,
    color: CORES.textoSecundario,
    marginTop: 2,
  },
  itemBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: CORES.erro,
    backgroundColor: CORES.erroClaro,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
});
