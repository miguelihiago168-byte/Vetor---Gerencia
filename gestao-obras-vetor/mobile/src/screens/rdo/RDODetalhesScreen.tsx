import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AppStackParamList } from '../../navigation/AppNavigator';
import { getAnexos, getRDO, getRDOs, updateStatusRDO } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { API_URL, CORES, STATUS_RDO } from '../../utils/constants';
import { storage } from '../../utils/storage';

type Route = RouteProp<AppStackParamList, 'RDODetalhes'>;
type Nav = NativeStackNavigationProp<AppStackParamList>;
type Dict = Record<string, unknown>;

const baseUrl = API_URL.replace(/\/api$/, '');

const asArray = (value: unknown): Dict[] => (Array.isArray(value) ? value as Dict[] : []);
const asJsonArray = (value: unknown): Dict[] => {
  if (Array.isArray(value)) return value as Dict[];
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as Dict[] : [];
  } catch {
    return [];
  }
};
const text = (value: unknown, fallback = '-') => {
  const str = String(value ?? '').trim();
  return str || fallback;
};

const formatarData = (data: unknown) => {
  if (!data || typeof data !== 'string') return '-';
  try {
    return format(parseISO(data.split('T')[0]), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return String(data);
  }
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.secao}>
      <Text style={styles.secaoTitulo}>{title}</Text>
      {children}
    </View>
  );
}

export default function RDODetalhesScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { rdoId, projetoId } = route.params;
  const { isGestor } = useAuth();
  const { error, success } = useNotification();

  const [rdo, setRdo] = useState<Dict | null>(null);
  const [midias, setMidias] = useState<Dict[]>([]);
  const [imageHeaders, setImageHeaders] = useState<Record<string, string> | undefined>();
  const [carregando, setCarregando] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [alterandoStatus, setAlterandoStatus] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const token = await storage.getToken();
      setImageHeaders(token ? { Authorization: `Bearer ${token}` } : undefined);

      const rResp = await getRDO(rdoId);
      const detalhe = rResp.data || {};
      setRdo(detalhe);

      try {
        const anexosResp = await getAnexos(rdoId);
        setMidias([
          ...asArray(detalhe.fotos),
          ...asArray(anexosResp.data || detalhe.anexos),
        ]);
      } catch {
        setMidias([...asArray(detalhe.fotos), ...asArray(detalhe.anexos)]);
      }
    } catch (err: any) {
      try {
        const listaResp = await getRDOs(projetoId);
        const fallback = asArray(listaResp.data).find((item) => Number(item.id) === Number(rdoId));
        if (fallback) {
          setRdo(fallback);
          setMidias([]);
          error('Não foi possível carregar todos os detalhes do RDO. Exibindo o resumo disponível.');
          return;
        }
      } catch {
        // Mantém o erro original abaixo.
      }
      setRdo(null);
      setMidias([]);
      error(`Erro ao carregar RDO: ${err?.response?.data?.erro || err?.message || 'falha inesperada'}`);
    } finally {
      setCarregando(false);
      setRefresh(false);
    }
  }, [error, projetoId, rdoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const alterarStatus = (novoStatus: string) => {
    const labels: Record<string, string> = {
      em_analise: 'Enviar para análise',
      aprovado: 'Aprovar',
      reprovado: 'Reprovar',
      em_preenchimento: 'Devolver para preenchimento',
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
              success('Status atualizado com sucesso.');
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

  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={CORES.primaria} />
      </View>
    );
  }

  if (!rdo) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); carregar(); }} colors={[CORES.primaria]} />}
      >
        <View style={styles.emptyCard}>
          <MaterialCommunityIcons name="clipboard-alert-outline" size={40} color={CORES.erro} />
          <Text style={styles.emptyTitle}>RDO não carregado</Text>
          <Text style={styles.emptyText}>Puxe para atualizar. Se continuar, o servidor não retornou os dados deste RDO.</Text>
        </View>
      </ScrollView>
    );
  }

  const status = text(rdo.status, 'em_preenchimento');
  const statusInfo = STATUS_RDO[status as keyof typeof STATUS_RDO] ?? {
    label: status,
    cor: CORES.textoSecundario,
    corFundo: CORES.fundo,
  };
  const dataRdo = text(rdo.data_rdo || rdo.data_relatorio || rdo.criado_em, '');
  const climaLista = asArray(rdo.clima);
  const ocorrenciasLista = asArray(rdo.ocorrencias);
  const atividadesLista = asArray(rdo.atividades);
  const atividadesAvulsas = asArray(rdo.atividades_avulsas);
  const maoObra = [...asArray(rdo.mao_obra_detalhada), ...asArray(rdo.mao_obra_vinculada)];
  const equipamentos = [
    ...asArray(rdo.equipamentos_lista),
    ...asJsonArray(rdo.equipamentos),
  ];
  const materiais = asArray(rdo.materiais);
  const comentarios = asArray(rdo.comentarios);
  const efetivoTotal =
    rdo.efetivo_total ??
    Number(rdo.mao_obra_direta || 0) + Number(rdo.mao_obra_indireta || 0) + Number(rdo.mao_obra_terceiros || 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); carregar(); }} colors={[CORES.primaria]} />}
    >
      <View style={styles.reportHero}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.reportKicker}>Relatório diário de obra</Text>
            <Text style={styles.numero}>RDO-{String((rdo.numero_rdo as number) ?? rdoId).padStart(3, '0')}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: statusInfo.corFundo }]}>
            <Text style={[styles.badgeTexto, { color: statusInfo.cor }]}>{statusInfo.label}</Text>
          </View>
        </View>
        <Text style={styles.data}>{formatarData(dataRdo)} · {text(rdo.projeto_nome, 'Projeto')}</Text>
        <View style={styles.reportStats}>
          <View style={styles.reportStat}>
            <Text style={styles.reportStatValue}>{String(efetivoTotal || 0)}</Text>
            <Text style={styles.reportStatLabel}>Efetivo</Text>
          </View>
          <View style={styles.reportStat}>
            <Text style={styles.reportStatValue}>{atividadesLista.length + atividadesAvulsas.length}</Text>
            <Text style={styles.reportStatLabel}>Atividades</Text>
          </View>
          <View style={styles.reportStat}>
            <Text style={styles.reportStatValue}>{equipamentos.length}</Text>
            <Text style={styles.reportStatLabel}>Equipamentos</Text>
          </View>
        </View>
        {alterandoStatus ? <ActivityIndicator color="#FFF" style={{ marginTop: 12 }} /> : null}
      </View>

      {(status === 'em_preenchimento' || (isGestor && ['em_analise', 'reprovado'].includes(status))) ? (
        <Section title="Ações">
          <View style={styles.acoesRow}>
            {status === 'em_preenchimento' ? (
              <>
                <TouchableOpacity style={[styles.acaoBotao, { backgroundColor: CORES.infoClaro }]} onPress={() => alterarStatus('em_analise')}>
                  <MaterialCommunityIcons name="send-outline" size={18} color={CORES.info} />
                  <Text style={[styles.acaoBotaoTexto, { color: CORES.info }]}>Enviar p/ análise</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.acaoBotao, { backgroundColor: CORES.primariaMuitoClara }]} onPress={() => navigation.navigate('RDOForm', { projetoId, rdoId })}>
                  <MaterialCommunityIcons name="pencil-outline" size={18} color={CORES.primaria} />
                  <Text style={[styles.acaoBotaoTexto, { color: CORES.primaria }]}>Editar</Text>
                </TouchableOpacity>
              </>
            ) : null}
            {isGestor && status === 'em_analise' ? (
              <>
                <TouchableOpacity style={[styles.acaoBotao, { backgroundColor: CORES.sucessoClaro }]} onPress={() => alterarStatus('aprovado')}>
                  <MaterialCommunityIcons name="check" size={18} color={CORES.sucesso} />
                  <Text style={[styles.acaoBotaoTexto, { color: CORES.sucesso }]}>Aprovar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.acaoBotao, { backgroundColor: CORES.erroClaro }]} onPress={() => alterarStatus('reprovado')}>
                  <MaterialCommunityIcons name="close" size={18} color={CORES.erro} />
                  <Text style={[styles.acaoBotaoTexto, { color: CORES.erro }]}>Reprovar</Text>
                </TouchableOpacity>
              </>
            ) : null}
            {isGestor && status === 'reprovado' ? (
              <TouchableOpacity style={[styles.acaoBotao, { backgroundColor: CORES.alertaClaro }]} onPress={() => alterarStatus('em_preenchimento')}>
                <MaterialCommunityIcons name="undo" size={18} color={CORES.alerta} />
                <Text style={[styles.acaoBotaoTexto, { color: CORES.alerta }]}>Devolver</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </Section>
      ) : null}

      <Section title="Informações do relatório">
        <View style={styles.infoCard}>
          <InfoRow label="Data" value={formatarData(dataRdo)} />
          <InfoRow label="Clima manhã" value={text(rdo.clima_manha || climaLista.find((c) => text(c.periodo, '').toLowerCase().includes('man'))?.condicao_tempo)} />
          <InfoRow label="Clima tarde" value={text(rdo.clima_tarde || climaLista.find((c) => text(c.periodo, '').toLowerCase().includes('tar'))?.condicao_tempo)} />
          <InfoRow label="Efetivo" value={String(efetivoTotal || '-')} />
          <InfoRow label="Criado por" value={text(rdo.criado_por_nome)} />
          {rdo.aprovado_por_nome ? <InfoRow label="Aprovado por" value={text(rdo.aprovado_por_nome)} /> : null}
        </View>
      </Section>

      {climaLista.length > 0 ? (
        <Section title="Condições climáticas">
          <View style={styles.gridCard}>
            {climaLista.map((clima, idx) => (
              <View key={`clima-${clima.id || idx}`} style={styles.climaCard}>
                <MaterialCommunityIcons name="weather-partly-cloudy" size={22} color={CORES.primaria} />
                <Text style={styles.climaPeriodo}>{text(clima.periodo, 'Período')}</Text>
                <Text style={styles.climaTexto}>{text(clima.condicao_tempo || clima.condicao_trabalho)}</Text>
                <Text style={styles.detailSub}>{text(clima.condicao_trabalho, '')}</Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {maoObra.length > 0 ? (
        <Section title="Mão de obra">
          <View style={styles.infoCard}>
            {maoObra.slice(0, 16).map((pessoa, idx) => (
              <View key={`mao-${pessoa.id || idx}`} style={styles.detailRow}>
                <MaterialCommunityIcons name="account-wrench-outline" size={18} color={CORES.primaria} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailTitle}>{text(pessoa.nome || pessoa.colaborador_nome, 'Colaborador')}</Text>
                  <Text style={styles.detailSub}>{text(pessoa.funcao || pessoa.tipo || pessoa.origem, '')}</Text>
                </View>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {(rdo.descricao_atividades || atividadesLista.length > 0 || atividadesAvulsas.length > 0) ? (
        <Section title="Atividades executadas">
          <View style={styles.infoCard}>
            {rdo.descricao_atividades ? <Text style={styles.textoDescricao}>{text(rdo.descricao_atividades)}</Text> : null}
            {atividadesLista.slice(0, 14).map((atividade, idx) => (
              <View key={`atividade-${atividade.id || idx}`} style={styles.detailRow}>
                <MaterialCommunityIcons name="check-circle-outline" size={18} color={CORES.sucesso} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailTitle}>{text(atividade.codigo_eap, '')} {text(atividade.descricao || atividade.nome, 'Atividade')}</Text>
                  <Text style={styles.detailSub}>{Number(atividade.percentual_executado || 0)}% executado</Text>
                </View>
              </View>
            ))}
            {atividadesAvulsas.slice(0, 10).map((atividade, idx) => (
              <View key={`avulsa-${idx}`} style={styles.detailRow}>
                <MaterialCommunityIcons name="hammer-wrench" size={18} color={CORES.primaria} />
                <Text style={styles.detailTitle}>{text(atividade.descricao, 'Atividade avulsa')}</Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {(typeof rdo.ocorrencias === 'string' ? rdo.ocorrencias : ocorrenciasLista.length > 0) ? (
        <Section title="Ocorrências">
          <View style={styles.infoCard}>
            {typeof rdo.ocorrencias === 'string' ? (
              <Text style={styles.textoDescricao}>{text(rdo.ocorrencias)}</Text>
            ) : ocorrenciasLista.map((ocorrencia, idx) => (
              <View key={`oc-${ocorrencia.id || idx}`} style={styles.detailRow}>
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color={CORES.alerta} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailTitle}>{text(ocorrencia.titulo, 'Ocorrência')}</Text>
                  <Text style={styles.detailSub}>{text(ocorrencia.descricao, '')}</Text>
                </View>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {(equipamentos.length > 0 || typeof rdo.equipamentos === 'string') ? (
        <Section title="Equipamentos">
          <View style={styles.infoCard}>
            {equipamentos.length > 0 ? equipamentos.slice(0, 16).map((equipamento, idx) => (
              <View key={`eq-${equipamento.id || idx}`} style={styles.detailRow}>
                <MaterialCommunityIcons name="excavator" size={18} color={CORES.secundaria} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailTitle}>
                    {text(equipamento.nome || equipamento.nome_equipamento || equipamento.equipamento || equipamento.descricao, 'Equipamento')}
                  </Text>
                  <Text style={styles.detailSub}>
                    {text(equipamento.quantidade, '')} {text(equipamento.unidade, '')}
                    {equipamento.horas_utilizadas ? ` · ${text(equipamento.horas_utilizadas)} h` : ''}
                    {equipamento.observacao ? ` · ${text(equipamento.observacao)}` : ''}
                  </Text>
                </View>
              </View>
            )) : (
              <Text style={styles.textoDescricao}>{text(rdo.equipamentos)}</Text>
            )}
          </View>
        </Section>
      ) : null}

      {materiais.length > 0 ? (
        <Section title="Materiais recebidos">
          <View style={styles.infoCard}>
            {materiais.slice(0, 10).map((material, idx) => (
              <View key={`mat-${material.id || idx}`} style={styles.detailRow}>
                <MaterialCommunityIcons name="package-variant-closed" size={18} color={CORES.secundaria} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailTitle}>{text(material.material || material.descricao, 'Material')}</Text>
                  <Text style={styles.detailSub}>{text(material.quantidade, '')} {text(material.unidade, '')}</Text>
                </View>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {midias.length > 0 ? (
        <Section title={`Fotos e anexos (${midias.length})`}>
          <View style={styles.fotosGrid}>
            {midias.map((item) => {
              const isRdoFoto = Boolean(item.caminho_arquivo || item.rdo_id);
              const isImagem =
                isRdoFoto ||
                /\.(jpg|jpeg|png|gif|webp)$/i.test(text(item.nome_original || item.nome_arquivo || item.caminho || item.caminho_arquivo, ''));
              const uri = isRdoFoto
                ? `${baseUrl}/api/rdo/${rdoId}/foto/${item.id}/download`
                : `${baseUrl}/api/anexos/download/${item.id}`;

              if (!isImagem) {
                return (
                  <View key={`arquivo-${item.id}`} style={styles.arquivoAnexo}>
                    <MaterialCommunityIcons name="file-outline" size={24} color={CORES.primaria} />
                    <Text style={styles.arquivoNome} numberOfLines={1}>{text(item.nome_original || item.nome_arquivo, 'Arquivo')}</Text>
                  </View>
                );
              }

              return (
                <View key={`foto-${item.id}`} style={styles.fotoCard}>
                  <Image source={{ uri, headers: imageHeaders }} style={styles.foto} resizeMode="cover" />
                  <View style={styles.fotoCaption}>
                    <Text style={styles.fotoCaptionTitle} numberOfLines={2}>
                      {item.atividade_codigo ? `${text(item.atividade_codigo, '')} · ` : ''}
                      {text(item.atividade_descricao || item.descricao || item.nome_original || item.nome_arquivo, 'Foto do RDO')}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Section>
      ) : null}

      {(comentarios.length > 0 || typeof rdo.comentarios === 'string') ? (
        <Section title="Comentários">
          <View style={styles.infoCard}>
            {typeof rdo.comentarios === 'string' ? (
              <Text style={styles.textoDescricao}>{text(rdo.comentarios)}</Text>
            ) : comentarios.slice(0, 8).map((comentario, idx) => (
              <View key={`coment-${comentario.id || idx}`} style={styles.detailRow}>
                <MaterialCommunityIcons name="comment-text-outline" size={18} color={CORES.info} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailTitle}>{text(comentario.autor_nome, 'Comentário')}</Text>
                  <Text style={styles.detailSub}>{text(comentario.comentario || comentario.texto, '')}</Text>
                </View>
              </View>
            ))}
          </View>
        </Section>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  content: { padding: 16, paddingBottom: 42 },
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CORES.fundo },
  reportHero: {
    backgroundColor: CORES.primariaEscura,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  reportKicker: { color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  numero: { fontSize: 24, fontWeight: '900', color: '#FFF', marginTop: 3 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeTexto: { fontSize: 12, fontWeight: '800' },
  data: { fontSize: 13, color: 'rgba(255,255,255,0.76)', marginTop: 8 },
  reportStats: { flexDirection: 'row', gap: 8, marginTop: 14 },
  reportStat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 10 },
  reportStatValue: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  reportStatLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '800', marginTop: 2 },
  secao: { marginBottom: 16 },
  secaoTitulo: {
    fontSize: 13,
    fontWeight: '900',
    color: CORES.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  acoesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  acaoBotao: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  acaoBotaoTexto: { fontSize: 13, fontWeight: '800' },
  infoCard: {
    backgroundColor: CORES.superficie,
    borderRadius: 14,
    padding: 14,
    elevation: 1,
    borderWidth: 1,
    borderColor: CORES.borda,
    gap: 10,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, borderBottomWidth: 1, borderBottomColor: CORES.borda, paddingBottom: 8 },
  infoLabel: { fontSize: 13, color: CORES.textoSecundario, flex: 1 },
  infoValue: { fontSize: 13, color: CORES.texto, fontWeight: '700', flex: 2, textAlign: 'right' },
  gridCard: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  climaCard: {
    minWidth: '47%',
    flex: 1,
    backgroundColor: CORES.superficie,
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: CORES.borda,
  },
  climaPeriodo: { fontSize: 13, color: CORES.texto, fontWeight: '900', marginTop: 6 },
  climaTexto: { fontSize: 13, color: CORES.textoSecundario, marginTop: 3 },
  textoDescricao: { fontSize: 14, color: CORES.texto, lineHeight: 20 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderTopWidth: 1, borderTopColor: CORES.borda, paddingTop: 10 },
  detailTitle: { fontSize: 13, color: CORES.texto, fontWeight: '800', flex: 1, lineHeight: 18 },
  detailSub: { fontSize: 12, color: CORES.textoSecundario, marginTop: 2, lineHeight: 17 },
  fotosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fotoCard: {
    width: '48%',
    backgroundColor: CORES.superficie,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: CORES.borda,
  },
  foto: { width: '100%', aspectRatio: 1, backgroundColor: CORES.borda },
  fotoCaption: { padding: 8 },
  fotoCaptionTitle: { fontSize: 11, color: CORES.texto, fontWeight: '700', lineHeight: 15 },
  arquivoAnexo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CORES.superficie,
    borderRadius: 12,
    padding: 12,
    width: '100%',
    borderWidth: 1,
    borderColor: CORES.borda,
  },
  arquivoNome: { fontSize: 13, color: CORES.texto, flex: 1 },
  emptyCard: { backgroundColor: CORES.superficie, borderRadius: 16, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: CORES.borda },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: CORES.texto, marginTop: 10 },
  emptyText: { fontSize: 13, color: CORES.textoSecundario, textAlign: 'center', marginTop: 6, lineHeight: 19 },
});
