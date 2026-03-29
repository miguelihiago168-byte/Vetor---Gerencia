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
  Image,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppStackParamList } from '../../navigation/AppNavigator';
import { getRDO, updateStatusRDO, getAnexos } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { CORES, STATUS_RDO, API_URL } from '../../utils/constants';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Route = RouteProp<AppStackParamList, 'RDODetalhes'>;
type Nav = NativeStackNavigationProp<AppStackParamList>;

export default function RDODetalhesScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { rdoId, projetoId } = route.params;
  const { success, error } = useNotification();
  const { isGestor } = useAuth();

  const [rdo, setRdo] = useState<Record<string, unknown> | null>(null);
  const [anexos, setAnexos] = useState<unknown[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [alterandoStatus, setAlterandoStatus] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [rResp, aResp] = await Promise.all([
        getRDO(rdoId),
        getAnexos(rdoId),
      ]);
      setRdo(rResp.data);
      setAnexos(aResp.data || []);
    } catch {
      error('Erro ao carregar RDO.');
    } finally {
      setCarregando(false);
      setRefresh(false);
    }
  }, [rdoId, error]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const alterarStatus = (novoStatus: string) => {
    const labels: Record<string, string> = {
      em_analise: 'Enviar para Análise',
      aprovado: 'Aprovar',
      reprovado: 'Reprovar',
      em_preenchimento: 'Devolver para Preenchimento',
    };
    Alert.alert(
      labels[novoStatus] ?? 'Alterar status',
      `Confirma alterar status para "${STATUS_RDO[novoStatus as keyof typeof STATUS_RDO]?.label ?? novoStatus}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setAlterandoStatus(true);
            try {
              await updateStatusRDO(rdoId, novoStatus);
              success('Status atualizado com sucesso!');
              carregar();
            } catch {
              error('Erro ao alterar status.');
            } finally {
              setAlterandoStatus(false);
            }
          },
        },
      ],
    );
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

  if (!rdo) return null;

  const status = (rdo.status as string) ?? 'em_preenchimento';
  const statusInfo = STATUS_RDO[status as keyof typeof STATUS_RDO] ?? {
    label: status,
    cor: CORES.textoSecundario,
    corFundo: CORES.fundo,
  };

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
            RDO #{(rdo.numero_rdo as number) ?? rdoId}
          </Text>
          <View style={[styles.badge, { backgroundColor: statusInfo.corFundo }]}>
            <Text style={[styles.badgeTexto, { color: statusInfo.cor }]}>
              {statusInfo.label}
            </Text>
          </View>
        </View>
        <Text style={styles.data}>
          {formatarData(rdo.data_rdo as string)}
        </Text>
        {alterandoStatus && (
          <ActivityIndicator
            color={CORES.primaria}
            style={{ marginTop: 8 }}
          />
        )}
      </View>

      {/* Ações de status */}
      <View style={styles.secao}>
        <Text style={styles.secaoTitulo}>Ações</Text>
        <View style={styles.acoesRow}>
          {status === 'em_preenchimento' && (
            <TouchableOpacity
              style={[styles.acaoBotao, { backgroundColor: CORES.infoClaro }]}
              onPress={() => alterarStatus('em_analise')}
            >
              <MaterialCommunityIcons
                name="send-outline"
                size={18}
                color={CORES.info}
              />
              <Text style={[styles.acaoBotaoTexto, { color: CORES.info }]}>
                Enviar p/ Análise
              </Text>
            </TouchableOpacity>
          )}
          {isGestor && status === 'em_analise' && (
            <>
              <TouchableOpacity
                style={[
                  styles.acaoBotao,
                  { backgroundColor: CORES.sucessoClaro },
                ]}
                onPress={() => alterarStatus('aprovado')}
              >
                <MaterialCommunityIcons
                  name="check"
                  size={18}
                  color={CORES.sucesso}
                />
                <Text
                  style={[styles.acaoBotaoTexto, { color: CORES.sucesso }]}
                >
                  Aprovar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.acaoBotao, { backgroundColor: CORES.erroClaro }]}
                onPress={() => alterarStatus('reprovado')}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={18}
                  color={CORES.erro}
                />
                <Text style={[styles.acaoBotaoTexto, { color: CORES.erro }]}>
                  Reprovar
                </Text>
              </TouchableOpacity>
            </>
          )}
          {isGestor && status === 'reprovado' && (
            <TouchableOpacity
              style={[
                styles.acaoBotao,
                { backgroundColor: CORES.alertaClaro },
              ]}
              onPress={() => alterarStatus('em_preenchimento')}
            >
              <MaterialCommunityIcons
                name="undo"
                size={18}
                color={CORES.alerta}
              />
              <Text style={[styles.acaoBotaoTexto, { color: CORES.alerta }]}>
                Devolver
              </Text>
            </TouchableOpacity>
          )}
          {status === 'em_preenchimento' && (
            <TouchableOpacity
              style={[
                styles.acaoBotao,
                { backgroundColor: CORES.primariaMuitoClara },
              ]}
              onPress={() =>
                navigation.navigate('RDOForm', { projetoId, rdoId })
              }
            >
              <MaterialCommunityIcons
                name="pencil-outline"
                size={18}
                color={CORES.primaria}
              />
              <Text
                style={[styles.acaoBotaoTexto, { color: CORES.primaria }]}
              >
                Editar
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Detalhes */}
      <View style={styles.secao}>
        <Text style={styles.secaoTitulo}>Informações</Text>
        <View style={styles.infoCard}>
          <InfoRow label="Data" value={formatarData(rdo.data_rdo as string)} />
          <InfoRow
            label="Clima manhã"
            value={(rdo.clima_manha as string) ?? '-'}
          />
          <InfoRow
            label="Clima tarde"
            value={(rdo.clima_tarde as string) ?? '-'}
          />
          <InfoRow
            label="Efetivo"
            value={String(rdo.efetivo_total ?? '-')}
          />
          <InfoRow
            label="Criado por"
            value={(rdo.criado_por_nome as string) ?? '-'}
          />
        </View>
      </View>

      {rdo.descricao_atividades ? (
        <View style={styles.secao}>
          <Text style={styles.secaoTitulo}>Atividades executadas</Text>
          <View style={styles.infoCard}>
            <Text style={styles.textoDescricao}>
              {rdo.descricao_atividades as string}
            </Text>
          </View>
        </View>
      ) : null}

      {rdo.ocorrencias ? (
        <View style={styles.secao}>
          <Text style={styles.secaoTitulo}>Ocorrências</Text>
          <View style={styles.infoCard}>
            <Text style={styles.textoDescricao}>
              {rdo.ocorrencias as string}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Fotos/Anexos */}
      {anexos.length > 0 && (
        <View style={styles.secao}>
          <Text style={styles.secaoTitulo}>Fotos / Anexos ({anexos.length})</Text>
          <View style={styles.fotosGrid}>
            {(anexos as { id: number; nome_original?: string; caminho?: string }[]).map((anx) => {
              const isImagem =
                anx.nome_original?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ??
                anx.caminho?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
              const uri = `${API_URL.replace('/api', '')}/api/anexos/download/${anx.id}`;
              return isImagem ? (
                <Image
                  key={anx.id}
                  source={{ uri }}
                  style={styles.foto}
                  resizeMode="cover"
                />
              ) : (
                <View key={anx.id} style={styles.arquivoAnexo}>
                  <MaterialCommunityIcons
                    name="file-outline"
                    size={24}
                    color={CORES.primaria}
                  />
                  <Text style={styles.arquivoNome} numberOfLines={1}>
                    {anx.nome_original ?? 'Arquivo'}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
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
  },
  numero: { fontSize: 18, fontWeight: 'bold', color: CORES.texto },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeTexto: { fontSize: 12, fontWeight: '600' },
  data: { fontSize: 13, color: CORES.textoSecundario, marginTop: 4 },
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
  infoValue: {
    fontSize: 13,
    color: CORES.texto,
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  textoDescricao: { fontSize: 14, color: CORES.texto, lineHeight: 20 },
  fotosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  foto: {
    width: '47%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: CORES.borda,
  },
  arquivoAnexo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CORES.superficie,
    borderRadius: 8,
    padding: 10,
    width: '100%',
    elevation: 1,
  },
  arquivoNome: { fontSize: 13, color: CORES.texto, flex: 1 },
});
