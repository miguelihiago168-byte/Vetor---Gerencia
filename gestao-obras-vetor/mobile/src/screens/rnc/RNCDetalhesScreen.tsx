import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppStackParamList } from '../../navigation/AppNavigator';
import { getRNC, updateStatusRNC, enviarRncParaAprovacao } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { CORES, STATUS_RNC } from '../../utils/constants';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Route = RouteProp<AppStackParamList, 'RNCDetalhes'>;
type Nav = NativeStackNavigationProp<AppStackParamList>;

export default function RNCDetalhesScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { rncId, projetoId } = route.params;
  const { success, error } = useNotification();
  const { isGestor, usuario } = useAuth();

  const [rnc, setRnc] = useState<Record<string, unknown> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [alterandoStatus, setAlterandoStatus] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const resp = await getRNC(rncId);
      setRnc(resp.data);
    } catch {
      error('Erro ao carregar RNC.');
    } finally {
      setCarregando(false);
      setRefresh(false);
    }
  }, [rncId, error]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const alterarStatus = (novoStatus: string, label: string) => {
    Alert.alert('Confirmar', `${label}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: async () => {
          setAlterandoStatus(true);
          try {
            await updateStatusRNC(rncId, novoStatus);
            success('Status atualizado!');
            carregar();
          } catch {
            error('Erro ao alterar status.');
          } finally {
            setAlterandoStatus(false);
          }
        },
      },
    ]);
  };

  const enviarParaAprovacao = () => {
    Alert.alert('Confirmar', 'Enviar RNC para aprovação do gestor?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Enviar',
        onPress: async () => {
          setAlterandoStatus(true);
          try {
            await enviarRncParaAprovacao(rncId);
            success('RNC enviada para aprovação!');
            carregar();
          } catch {
            error('Erro ao enviar para aprovação.');
          } finally {
            setAlterandoStatus(false);
          }
        },
      },
    ]);
  };

  const formatarData = (data: unknown) => {
    if (!data || typeof data !== 'string') return '-';
    try {
      return format(parseISO(data.split('T')[0]), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return String(data);
    }
  };

  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={CORES.primaria} />
      </View>
    );
  }

  if (!rnc) return null;

  const status = (rnc.status as string) ?? 'aberto';
  const statusInfo = STATUS_RNC[status as keyof typeof STATUS_RNC] ?? {
    label: status,
    cor: CORES.textoSecundario,
    corFundo: CORES.fundo,
  };
  const isCriador = rnc.criado_por === usuario?.id;

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
      {/* Header */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <Text style={styles.numero}>
            RNC #{(rnc.numero_rnc as number) ?? rncId}
          </Text>
          <View style={[styles.badge, { backgroundColor: statusInfo.corFundo }]}>
            <Text style={[styles.badgeTexto, { color: statusInfo.cor }]}>
              {statusInfo.label}
            </Text>
          </View>
        </View>
        <Text style={styles.titulo}>{rnc.titulo as string}</Text>
        {alterandoStatus && (
          <ActivityIndicator color={CORES.primaria} style={{ marginTop: 8 }} />
        )}
      </View>

      {/* Ações */}
      <View style={styles.secao}>
        <Text style={styles.secaoTitulo}>Ações</Text>
        <View style={styles.acoesRow}>
          {status === 'em_correcao' && (
            <TouchableOpacity
              style={[styles.acaoBotao, { backgroundColor: CORES.infoClaro }]}
              onPress={enviarParaAprovacao}
            >
              <MaterialCommunityIcons name="send-outline" size={18} color={CORES.info} />
              <Text style={[styles.acaoBotaoTexto, { color: CORES.info }]}>
                Enviar p/ Aprovação
              </Text>
            </TouchableOpacity>
          )}
          {isGestor && status === 'em_aprovacao' && (
            <>
              <TouchableOpacity
                style={[styles.acaoBotao, { backgroundColor: CORES.sucessoClaro }]}
                onPress={() => alterarStatus('concluido', 'Concluir RNC')}
              >
                <MaterialCommunityIcons name="check" size={18} color={CORES.sucesso} />
                <Text style={[styles.acaoBotaoTexto, { color: CORES.sucesso }]}>
                  Concluir
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.acaoBotao, { backgroundColor: CORES.alertaClaro }]}
                onPress={() => alterarStatus('em_correcao', 'Devolver para correção')}
              >
                <MaterialCommunityIcons name="undo" size={18} color={CORES.alerta} />
                <Text style={[styles.acaoBotaoTexto, { color: CORES.alerta }]}>
                  Devolver
                </Text>
              </TouchableOpacity>
            </>
          )}
          {(status === 'aberto' || status === 'em_correcao') && (
            <TouchableOpacity
              style={[styles.acaoBotao, { backgroundColor: CORES.primariaMuitoClara }]}
              onPress={() => navigation.navigate('RNCForm', { projetoId, rncId })}
            >
              <MaterialCommunityIcons name="pencil-outline" size={18} color={CORES.primaria} />
              <Text style={[styles.acaoBotaoTexto, { color: CORES.primaria }]}>
                Editar
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Informações */}
      <View style={styles.secao}>
        <Text style={styles.secaoTitulo}>Informações</Text>
        <View style={styles.infoCard}>
          <InfoRow label="Tipo" value={(rnc.tipo as string) ?? '-'} />
          <InfoRow label="Responsável" value={(rnc.responsavel_nome as string) ?? '-'} />
          <InfoRow label="Criado em" value={formatarData(rnc.criado_em)} />
          <InfoRow label="Previsão" value={formatarData(rnc.prazo_correcao)} />
        </View>
      </View>

      {rnc.descricao ? (
        <View style={styles.secao}>
          <Text style={styles.secaoTitulo}>Descrição</Text>
          <View style={styles.infoCard}>
            <Text style={styles.textoDesc}>{rnc.descricao as string}</Text>
          </View>
        </View>
      ) : null}

      {rnc.causa_raiz ? (
        <View style={styles.secao}>
          <Text style={styles.secaoTitulo}>Causa Raiz</Text>
          <View style={styles.infoCard}>
            <Text style={styles.textoDesc}>{rnc.causa_raiz as string}</Text>
          </View>
        </View>
      ) : null}

      {rnc.acao_corretiva ? (
        <View style={styles.secao}>
          <Text style={styles.secaoTitulo}>Ação Corretiva</Text>
          <View style={styles.infoCard}>
            <Text style={styles.textoDesc}>{rnc.acao_corretiva as string}</Text>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  content: { padding: 16, gap: 0, paddingBottom: 40 },
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerCard: {
    backgroundColor: CORES.superficie,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  numero: { fontSize: 13, fontWeight: '600', color: CORES.textoSecundario },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeTexto: { fontSize: 12, fontWeight: '600' },
  titulo: { fontSize: 18, fontWeight: '700', color: CORES.texto },
  secao: { marginBottom: 16 },
  secaoTitulo: {
    fontSize: 14,
    fontWeight: '700',
    color: CORES.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  acoesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  acaoBotao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  acaoBotaoTexto: { fontSize: 13, fontWeight: '600' },
  infoCard: {
    backgroundColor: CORES.superficie,
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: CORES.borda,
    paddingBottom: 8,
  },
  infoLabel: { fontSize: 13, color: CORES.textoSecundario, flex: 1 },
  infoValue: { fontSize: 13, color: CORES.texto, fontWeight: '500', flex: 2, textAlign: 'right' },
  textoDesc: { fontSize: 14, color: CORES.texto, lineHeight: 20 },
});
