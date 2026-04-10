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
import { useRoute, RouteProp } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppStackParamList } from '../../navigation/AppNavigator';
import {
  detalharRequisicao,
  analisarItemRequisicao,
  marcarItemComprado,
  selecionarCotacaoItem,
  cancelarItemRequisicao,
  devolverCotacaoItem,
  finalizarCotacaoItem,
} from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { CORES, STATUS_ITEM_COMPRA } from '../../utils/constants';

type Route = RouteProp<AppStackParamList, 'ComprasDetalhe'>;

interface Item {
  id: number;
  descricao: string;
  quantidade: number;
  unidade?: string;
  status?: keyof typeof STATUS_ITEM_COMPRA;
  status_item?: string;
  cotacoes?: Cotacao[];
  cotacao_selecionada_id?: number;
}

interface Cotacao {
  id: number;
  fornecedor_nome?: string;
  preco_unitario?: number;
  valor_unitario?: number;
  selecionada?: number;
}

const statusItemToSlug = (status?: string): string => {
  const s = String(status || '').toLowerCase();
  if (s === 'aguardando análise') return 'pendente';
  if (s === 'reprovado') return 'reprovado';
  if (s === 'em cotação') return 'em_cotacao';
  if (s === 'cotação finalizada') return 'cotado';
  if (s === 'aprovado para compra') return 'aprovado';
  if (s === 'comprado') return 'comprado';
  if (s === 'cancelado') return 'cancelado';
  return s;
};

export default function ComprasDetalheScreen() {
  const route = useRoute<Route>();
  const { requisicaoId, projetoId } = route.params;
  const { success, error } = useNotification();
  const { isGestor, isAdm } = useAuth();

  const [req, setReq] = useState<Record<string, unknown> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const resp = await detalharRequisicao(requisicaoId);
      setReq(resp.data);
    } catch {
      error('Erro ao carregar requisição.');
    } finally {
      setCarregando(false);
      setRefresh(false);
    }
  }, [requisicaoId, error]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const aprovarItem = (item: Item) => {
    Alert.alert('Aprovar item', `Aprovar "${item.descricao}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Aprovar',
        onPress: async () => {
          try {
            await analisarItemRequisicao(requisicaoId, item.id, {
              aprovado: true,
            });
            success('Item aprovado!');
            carregar();
          } catch {
            error('Erro ao aprovar item.');
          }
        },
      },
    ]);
  };

  const marcarComprado = (item: Item) => {
    Alert.alert('Marcar comprado', `Confirmar compra de "${item.descricao}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: async () => {
          try {
            await marcarItemComprado(requisicaoId, item.id);
            success('Item marcado como comprado!');
            carregar();
          } catch {
            error('Erro ao marcar item.');
          }
        },
      },
    ]);
  };

  const selecionarCotacao = (item: Item, cotacaoId: number) => {
    Alert.alert('Selecionar cotação', 'Confirma a seleção desta cotação?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Selecionar',
        onPress: async () => {
          try {
            await selecionarCotacaoItem(requisicaoId, item.id, cotacaoId);
            success('Cotação selecionada!');
            carregar();
          } catch {
            error('Erro ao selecionar cotação.');
          }
        },
      },
    ]);
  };

  const cancelarItem = (item: Item) => {
    Alert.alert('Cancelar item', `Cancelar "${item.descricao}"?`, [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Cancelar item',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelarItemRequisicao(requisicaoId, item.id, {
              motivo: 'Cancelado via aplicativo mobile',
            });
            success('Item cancelado.');
            carregar();
          } catch {
            error('Erro ao cancelar item.');
          }
        },
      },
    ]);
  };

  const devolverCotacao = (item: Item) => {
    Alert.alert('Devolver cotação', `Devolver "${item.descricao}" para cotação?`, [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Devolver',
        onPress: async () => {
          try {
            await devolverCotacaoItem(requisicaoId, item.id, {
              motivo: 'Ajuste solicitado via aplicativo mobile',
            });
            success('Item devolvido para cotação.');
            carregar();
          } catch {
            error('Erro ao devolver cotação.');
          }
        },
      },
    ]);
  };

  const finalizarCotacao = (item: Item) => {
    Alert.alert('Finalizar cotação', `Finalizar cotação de "${item.descricao}"?`, [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Finalizar',
        onPress: async () => {
          try {
            await finalizarCotacaoItem(requisicaoId, item.id);
            success('Cotação finalizada.');
            carregar();
          } catch {
            error('Erro ao finalizar cotação.');
          }
        },
      },
    ]);
  };

  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={CORES.primaria} />
      </View>
    );
  }

  if (!req) return null;

  const itens = (req.itens as Item[]) ?? [];

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
        <Text style={styles.titulo}>{req.titulo as string}</Text>
        <Text style={styles.sub}>
          {itens.length} {itens.length === 1 ? 'item' : 'itens'}
        </Text>
        {req.observacao_geral ? (
          <Text style={styles.obs}>{req.observacao_geral as string}</Text>
        ) : null}
      </View>

      {/* Itens */}
      <Text style={styles.secaoTitulo}>Itens da Requisição</Text>
      {itens.map((item) => {
        const statusOriginal = item.status_item ?? item.status ?? '';
        const status = statusItemToSlug(statusOriginal);
        const statusInfo = STATUS_ITEM_COMPRA[statusOriginal as keyof typeof STATUS_ITEM_COMPRA] ??
          STATUS_ITEM_COMPRA[status as keyof typeof STATUS_ITEM_COMPRA] ?? {
          label: statusOriginal || status,
          cor: CORES.textoSecundario,
          corFundo: CORES.fundo,
        };
        return (
          <View key={item.id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemDesc} numberOfLines={2}>
                {item.descricao}
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

            <Text style={styles.itemQtd}>
              {item.quantidade} {item.unidade ?? 'un'}
            </Text>

            {/* Cotações */}
            {item.cotacoes && item.cotacoes.length > 0 && (
              <View style={styles.cotacoesContainer}>
                <Text style={styles.cotacoesTitulo}>Cotações:</Text>
                {item.cotacoes.map((cot) => (
                  <View
                    key={cot.id}
                    style={[
                      styles.cotacaoRow,
                      cot.selecionada
                        ? styles.cotacaoSelecionada
                        : undefined,
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cotacaoFornecedor}>
                        {cot.fornecedor_nome ?? 'Fornecedor'}
                      </Text>
                      <Text style={styles.cotacaoPreco}>
                        R$ {Number(cot.valor_unitario ?? cot.preco_unitario ?? 0).toFixed(2)}/un
                      </Text>
                    </View>
                    {!cot.selecionada &&
                      isGestor &&
                      (status === 'em_cotacao' || status === 'cotado') && (
                        <TouchableOpacity
                          style={styles.selecionarBtn}
                          onPress={() => selecionarCotacao(item, cot.id)}
                        >
                          <Text style={styles.selecionarBtnTexto}>
                            Selecionar
                          </Text>
                        </TouchableOpacity>
                      )}
                    {cot.selecionada ? (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={20}
                        color={CORES.sucesso}
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            {/* Ações */}
            <View style={styles.itemAcoes}>
              {isGestor && status === 'pendente' && (
                <TouchableOpacity
                  style={[
                    styles.acaoBotao,
                    { backgroundColor: CORES.sucessoClaro },
                  ]}
                  onPress={() => aprovarItem(item)}
                >
                  <Text style={[styles.acaoBotaoTexto, { color: CORES.sucesso }]}>
                    Aprovar
                  </Text>
                </TouchableOpacity>
              )}
              {isAdm && status === 'em_cotacao' && (
                <TouchableOpacity
                  style={[
                    styles.acaoBotao,
                    { backgroundColor: CORES.infoClaro },
                  ]}
                  onPress={() => finalizarCotacao(item)}
                >
                  <Text style={[styles.acaoBotaoTexto, { color: CORES.info }]}>Finalizar cotação</Text>
                </TouchableOpacity>
              )}
              {isGestor && status === 'cotado' && (
                <TouchableOpacity
                  style={[
                    styles.acaoBotao,
                    { backgroundColor: CORES.alertaClaro },
                  ]}
                  onPress={() => devolverCotacao(item)}
                >
                  <Text style={[styles.acaoBotaoTexto, { color: CORES.alerta }]}>Devolver cotação</Text>
                </TouchableOpacity>
              )}
              {isAdm && (status === 'cotado' || status === 'aprovado') && (
                <TouchableOpacity
                  style={[
                    styles.acaoBotao,
                    { backgroundColor: CORES.primariaMuitoClara },
                  ]}
                  onPress={() => marcarComprado(item)}
                >
                  <Text
                    style={[
                      styles.acaoBotaoTexto,
                      { color: CORES.primaria },
                    ]}
                  >
                    Marcar comprado
                  </Text>
                </TouchableOpacity>
              )}
              {(isAdm || isGestor) && !['comprado', 'cancelado'].includes(status) && (
                <TouchableOpacity
                  style={[
                    styles.acaoBotao,
                    { backgroundColor: CORES.erroClaro },
                  ]}
                  onPress={() => cancelarItem(item)}
                >
                  <Text style={[styles.acaoBotaoTexto, { color: CORES.erro }]}>Cancelar item</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
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
  titulo: { fontSize: 18, fontWeight: '700', color: CORES.texto, marginBottom: 4 },
  sub: { fontSize: 13, color: CORES.textoSecundario },
  obs: { fontSize: 13, color: CORES.textoSecundario, marginTop: 8 },
  secaoTitulo: {
    fontSize: 14,
    fontWeight: '700',
    color: CORES.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  itemCard: {
    backgroundColor: CORES.superficie,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
    gap: 8,
  },
  itemDesc: { fontSize: 15, fontWeight: '600', color: CORES.texto, flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, flexShrink: 0 },
  badgeTexto: { fontSize: 11, fontWeight: '600' },
  itemQtd: { fontSize: 13, color: CORES.textoSecundario, marginBottom: 8 },
  cotacoesContainer: {
    backgroundColor: CORES.fundo,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  cotacoesTitulo: {
    fontSize: 12,
    fontWeight: '700',
    color: CORES.textoSecundario,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  cotacaoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: CORES.borda,
  },
  cotacaoSelecionada: { backgroundColor: CORES.sucessoClaro, borderRadius: 6, paddingHorizontal: 8 },
  cotacaoFornecedor: { fontSize: 13, color: CORES.texto, fontWeight: '500' },
  cotacaoPreco: { fontSize: 12, color: CORES.textoSecundario },
  selecionarBtn: {
    backgroundColor: CORES.primaria,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  selecionarBtnTexto: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  itemAcoes: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  acaoBotao: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  acaoBotaoTexto: { fontSize: 13, fontWeight: '600' },
});
