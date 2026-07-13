import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import {
  criarConversaDireta,
  criarReuniaoMensagem,
  enviarMensagemConversa,
  getUsuarios,
  listarConversas,
  listarMensagensConversa,
  listarReunioesMensagens,
  marcarConversaComoLida,
} from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { CORES } from '../../utils/constants';
import { AppStackParamList } from '../../navigation/AppNavigator';

type Route = RouteProp<AppStackParamList, 'Conversas'>;
type Aba = 'conversas' | 'agenda';

interface UsuarioDestino {
  id: number;
  nome: string;
  presenca_status?: string;
}

interface Conversa {
  id: number;
  outro_usuario_id?: number;
  outro_usuario_nome?: string;
  outro_usuario_presenca_status?: string;
  ultima_mensagem?: string;
  ultima_mensagem_em?: string;
  atualizado_em?: string;
  nao_lidas?: number;
}

interface Mensagem {
  id: number;
  conteudo: string;
  remetente_usuario_id: number;
  remetente_nome?: string;
  enviado_em?: string;
  editado_em?: string;
  deletado_em?: string;
}

interface Reuniao {
  id: number;
  assunto: string;
  descricao?: string;
  inicio_em: string;
  fim_em: string;
  status?: string;
  criada_por?: number;
  criador_nome?: string;
  participantes?: UsuarioDestino[];
}

const hojeISO = () => new Date().toISOString().slice(0, 10);

const parseBackendTimestamp = (value?: string) => {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
    ? text.replace(' ', 'T')
    : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatHora = (value?: string) => {
  const date = parseBackendTimestamp(value);
  if (!date) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const formatDiaCurto = (iso: string) => {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const date = new Date(ano, (mes || 1) - 1, dia || 1);
  return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }).replace('.', '');
};

const getInitials = (name?: string) => {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return (parts[0]?.[0] || '?').toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const monthRange = (dayISO: string) => {
  const [ano, mes] = dayISO.split('-').map(Number);
  const start = new Date(ano, (mes || 1) - 1, 1);
  const end = new Date(ano, mes || 1, 0);
  return {
    inicio: start.toISOString().slice(0, 10),
    fim: end.toISOString().slice(0, 10),
  };
};

const buildDays = (baseISO: string) => {
  const [ano, mes, dia] = baseISO.split('-').map(Number);
  const base = new Date(ano, (mes || 1) - 1, dia || 1);
  const start = new Date(base);
  start.setDate(base.getDate() - 3);
  return Array.from({ length: 10 }, (_, idx) => {
    const date = new Date(start);
    date.setDate(start.getDate() + idx);
    return date.toISOString().slice(0, 10);
  });
};

export default function ConversasScreen() {
  const route = useRoute<Route>();
  const { projetoId } = route.params;
  const { usuario } = useAuth();
  const { error, success } = useNotification();

  const [aba, setAba] = useState<Aba>('conversas');
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioDestino[]>([]);
  const [conversaAtiva, setConversaAtiva] = useState<Conversa | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [carregandoChat, setCarregandoChat] = useState(false);

  const [diaSelecionado, setDiaSelecionado] = useState(hojeISO());
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [formAberto, setFormAberto] = useState(false);
  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataReuniao, setDataReuniao] = useState(hojeISO());
  const [horaReuniao, setHoraReuniao] = useState('08:00');
  const [duracao, setDuracao] = useState('60');
  const [participantesIds, setParticipantesIds] = useState<number[]>([]);
  const [salvandoReuniao, setSalvandoReuniao] = useState(false);

  const usuariosDisponiveis = useMemo(() => {
    const emConversa = new Set(conversas.map((c) => Number(c.outro_usuario_id)).filter(Boolean));
    return usuarios.filter((u) => Number(u.id) !== Number(usuario?.id) && !emConversa.has(Number(u.id)));
  }, [conversas, usuarios, usuario?.id]);

  const diasAgenda = useMemo(() => buildDays(diaSelecionado), [diaSelecionado]);

  const reunioesDia = useMemo(() => {
    return reunioes
      .filter((r) => String(r.inicio_em || '').slice(0, 10) === diaSelecionado)
      .sort((a, b) => String(a.inicio_em).localeCompare(String(b.inicio_em)));
  }, [diaSelecionado, reunioes]);

  const proximasReunioes = useMemo(() => {
    const agora = Date.now();
    return reunioes
      .filter((r) => {
        const date = parseBackendTimestamp(r.inicio_em);
        return date && date.getTime() >= agora && r.status !== 'cancelada';
      })
      .sort((a, b) => String(a.inicio_em).localeCompare(String(b.inicio_em)))
      .slice(0, 3);
  }, [reunioes]);

  const carregarAgenda = useCallback(async (day = diaSelecionado) => {
    try {
      setLoadingAgenda(true);
      const range = monthRange(day);
      const resp = await listarReunioesMensagens({
        projeto_id: projetoId,
        data_inicio: range.inicio,
        data_fim: range.fim,
      });
      setReunioes(resp.data || []);
    } catch (err: any) {
      error(`Erro ao carregar agenda: ${err?.response?.data?.erro || err?.message || 'falha inesperada'}`);
    } finally {
      setLoadingAgenda(false);
    }
  }, [diaSelecionado, error, projetoId]);

  const carregarBase = useCallback(async () => {
    try {
      const [conversasResp, usuariosResp] = await Promise.all([
        listarConversas({ projeto_id: projetoId }),
        getUsuarios({ projeto_id: projetoId, ativo: 1 }),
      ]);
      setConversas(conversasResp.data || []);
      setUsuarios(usuariosResp.data || []);
    } catch (err: any) {
      error(`Erro ao carregar conversas: ${err?.response?.data?.erro || err?.message || 'falha inesperada'}`);
    } finally {
      setCarregando(false);
      setRefresh(false);
    }
  }, [error, projetoId]);

  const carregarMensagens = useCallback(async (conversa: Conversa) => {
    try {
      setCarregandoChat(true);
      const resp = await listarMensagensConversa(conversa.id);
      setMensagens(resp.data || []);
      await marcarConversaComoLida(conversa.id);
      setConversas((prev) =>
        prev.map((item) => (item.id === conversa.id ? { ...item, nao_lidas: 0 } : item)),
      );
    } catch (err: any) {
      error(`Erro ao abrir conversa: ${err?.response?.data?.erro || err?.message || 'falha inesperada'}`);
    } finally {
      setCarregandoChat(false);
    }
  }, [error]);

  useEffect(() => {
    carregarBase();
    carregarAgenda();
  }, [carregarAgenda, carregarBase]);

  useEffect(() => {
    if (!conversaAtiva) return undefined;
    const timer = setInterval(() => {
      carregarMensagens(conversaAtiva).catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [carregarMensagens, conversaAtiva]);

  const abrirConversa = async (conversa: Conversa) => {
    setConversaAtiva(conversa);
    await carregarMensagens(conversa);
  };

  const iniciarConversa = async (destinatario: UsuarioDestino) => {
    try {
      const resp = await criarConversaDireta({
        projeto_origem_id: projetoId,
        projeto_destino_id: projetoId,
        destinatario_usuario_id: destinatario.id,
      });
      const conversaCriada = resp.data?.conversa as Conversa | undefined;
      if (!conversaCriada?.id) {
        throw new Error('A API não retornou a conversa criada.');
      }
      await carregarBase();
      await abrirConversa({
        ...conversaCriada,
        outro_usuario_id: destinatario.id,
        outro_usuario_nome: destinatario.nome,
      });
    } catch (err: any) {
      error(`Erro ao iniciar conversa: ${err?.response?.data?.erro || err?.message || 'falha inesperada'}`);
    }
  };

  const enviar = async () => {
    const conteudo = texto.trim();
    if (!conversaAtiva?.id || !conteudo || enviando) return;

    try {
      setEnviando(true);
      await enviarMensagemConversa(conversaAtiva.id, { conteudo });
      setTexto('');
      await carregarMensagens(conversaAtiva);
      await carregarBase();
    } catch (err: any) {
      error(`Erro ao enviar mensagem: ${err?.response?.data?.erro || err?.message || 'falha inesperada'}`);
    } finally {
      setEnviando(false);
    }
  };

  const toggleParticipante = (id: number) => {
    setParticipantesIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const criarReuniao = async () => {
    const assuntoLimpo = assunto.trim();
    if (!assuntoLimpo) {
      error('Informe o assunto da reunião.');
      return;
    }
    if (participantesIds.length === 0) {
      error('Selecione pelo menos um participante.');
      return;
    }
    try {
      setSalvandoReuniao(true);
      await criarReuniaoMensagem({
        projeto_id: projetoId,
        assunto: assuntoLimpo,
        descricao: descricao.trim(),
        inicio_em: `${dataReuniao}T${horaReuniao}:00`,
        duracao_minutos: Number(duracao || 60),
        participantes_ids: participantesIds,
      });
      success('Reunião marcada e participantes notificados.');
      setAssunto('');
      setDescricao('');
      setDuracao('60');
      setParticipantesIds([]);
      setFormAberto(false);
      setDiaSelecionado(dataReuniao);
      await carregarAgenda(dataReuniao);
    } catch (err: any) {
      error(`Erro ao marcar reunião: ${err?.response?.data?.erro || err?.message || 'falha inesperada'}`);
    } finally {
      setSalvandoReuniao(false);
    }
  };

  const renderConversa = ({ item }: { item: Conversa }) => (
    <TouchableOpacity style={styles.conversaCard} onPress={() => abrirConversa(item)} activeOpacity={0.85}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{getInitials(item.outro_usuario_nome)}</Text>
      </View>
      <View style={styles.conversaInfo}>
        <View style={styles.conversaTopo}>
          <Text style={styles.conversaNome} numberOfLines={1}>
            {item.outro_usuario_nome || `Usuário #${item.outro_usuario_id || item.id}`}
          </Text>
          {Number(item.nao_lidas || 0) > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{Number(item.nao_lidas) > 99 ? '99+' : item.nao_lidas}</Text>
            </View>
          )}
        </View>
        <Text style={styles.ultimaMensagem} numberOfLines={1}>
          {item.ultima_mensagem || 'Sem mensagens ainda.'}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={CORES.desabilitado} />
    </TouchableOpacity>
  );

  const renderUsuario = ({ item }: { item: UsuarioDestino }) => (
    <TouchableOpacity style={styles.usuarioCard} onPress={() => iniciarConversa(item)} activeOpacity={0.85}>
      <View style={[styles.avatar, styles.avatarNovo]}>
        <Text style={[styles.avatarText, styles.avatarNovoText]}>{getInitials(item.nome)}</Text>
      </View>
      <View style={styles.conversaInfo}>
        <Text style={styles.conversaNome} numberOfLines={1}>{item.nome}</Text>
        <Text style={styles.ultimaMensagem}>Toque para iniciar conversa</Text>
      </View>
      <MaterialCommunityIcons name="message-plus-outline" size={22} color={CORES.primaria} />
    </TouchableOpacity>
  );

  const renderMensagem = ({ item }: { item: Mensagem }) => {
    const minha = Number(item.remetente_usuario_id) === Number(usuario?.id);
    const apagada = Boolean(item.deletado_em);
    return (
      <View style={[styles.mensagemRow, minha && styles.mensagemRowMinha]}>
        <View style={[styles.bolha, minha ? styles.bolhaMinha : styles.bolhaOutra]}>
          {!minha && (
            <Text style={styles.autor} numberOfLines={1}>
              {item.remetente_nome || 'Usuário'}
            </Text>
          )}
          <Text style={[styles.mensagemTexto, minha && styles.mensagemTextoMinha, apagada && styles.mensagemApagada]}>
            {apagada ? 'Mensagem apagada' : item.conteudo}
          </Text>
          <Text style={[styles.hora, minha && styles.horaMinha]}>{formatHora(item.enviado_em)}</Text>
        </View>
      </View>
    );
  };

  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={CORES.primaria} />
      </View>
    );
  }

  if (conversaAtiva) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={88}
      >
        <View style={styles.chatHeader}>
          <TouchableOpacity style={styles.voltarBtn} onPress={() => setConversaAtiva(null)}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={CORES.primaria} />
          </TouchableOpacity>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(conversaAtiva.outro_usuario_nome)}</Text>
          </View>
          <View style={styles.conversaInfo}>
            <Text style={styles.chatTitulo} numberOfLines={1}>
              {conversaAtiva.outro_usuario_nome || 'Conversa'}
            </Text>
            <Text style={styles.chatSubtitulo}>Projeto #{projetoId}</Text>
          </View>
          {carregandoChat && <ActivityIndicator size="small" color={CORES.primaria} />}
        </View>

        <FlatList
          style={styles.mensagensLista}
          contentContainerStyle={styles.mensagensContent}
          data={mensagens}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMensagem}
          ListEmptyComponent={
            <View style={styles.vazioChat}>
              <MaterialCommunityIcons name="message-text-outline" size={42} color={CORES.textoSecundario} />
              <Text style={styles.vazioTexto}>Nenhuma mensagem ainda.</Text>
            </View>
          }
        />

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={texto}
            onChangeText={setTexto}
            placeholder="Digite sua mensagem..."
            placeholderTextColor={CORES.textoSecundario}
            multiline
            maxLength={4000}
          />
          <TouchableOpacity
            style={[styles.enviarBtn, (!texto.trim() || enviando) && styles.enviarBtnDisabled]}
            onPress={enviar}
            disabled={!texto.trim() || enviando}
          >
            {enviando ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <MaterialCommunityIcons name="send" size={20} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  const header = (
    <View>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <MaterialCommunityIcons name={aba === 'agenda' ? 'calendar-clock' : 'message-text-outline'} size={28} color="#FFF" />
        </View>
        <View style={styles.heroText}>
          <Text style={styles.titulo}>Comunicação da obra</Text>
          <Text style={styles.subtitulo}>Conversas rápidas e agenda de reuniões sincronizadas com o sistema.</Text>
        </View>
      </View>

      <View style={styles.segmented}>
        <TouchableOpacity
          style={[styles.segment, aba === 'conversas' && styles.segmentAtivo]}
          onPress={() => setAba('conversas')}
        >
          <MaterialCommunityIcons name="message-text-outline" size={17} color={aba === 'conversas' ? '#FFF' : CORES.primaria} />
          <Text style={[styles.segmentText, aba === 'conversas' && styles.segmentTextAtivo]}>Conversas</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, aba === 'agenda' && styles.segmentAtivo]}
          onPress={() => setAba('agenda')}
        >
          <MaterialCommunityIcons name="calendar-clock" size={17} color={aba === 'agenda' ? '#FFF' : CORES.primaria} />
          <Text style={[styles.segmentText, aba === 'agenda' && styles.segmentTextAtivo]}>Agenda</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (aba === 'agenda') {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refresh || loadingAgenda}
            onRefresh={() => {
              setRefresh(true);
              carregarBase();
              carregarAgenda();
            }}
            colors={[CORES.primaria]}
          />
        }
      >
        {header}

        <View style={styles.agendaSummary}>
          <View>
            <Text style={styles.summaryKicker}>Próximas reuniões</Text>
            <Text style={styles.summaryNumber}>{proximasReunioes.length}</Text>
          </View>
          <View style={styles.summaryList}>
            {proximasReunioes.length === 0 ? (
              <Text style={styles.summaryEmpty}>Nada marcado nos próximos dias.</Text>
            ) : (
              proximasReunioes.map((r) => (
                <Text key={r.id} style={styles.summaryItem} numberOfLines={1}>
                  {formatHora(r.inicio_em)} · {r.assunto}
                </Text>
              ))
            )}
          </View>
        </View>

        <View style={styles.agendaToolbar}>
          <Text style={styles.secaoTitulo}>Agenda</Text>
          <TouchableOpacity style={styles.novaReuniaoBtn} onPress={() => setFormAberto((v) => !v)}>
            <MaterialCommunityIcons name={formAberto ? 'close' : 'plus'} size={18} color="#FFF" />
            <Text style={styles.novaReuniaoText}>{formAberto ? 'Fechar' : 'Nova reunião'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.diasRow}>
          {diasAgenda.map((dia) => {
            const ativo = dia === diaSelecionado;
            const count = reunioes.filter((r) => String(r.inicio_em || '').slice(0, 10) === dia).length;
            return (
              <TouchableOpacity
                key={dia}
                style={[styles.diaChip, ativo && styles.diaChipAtivo]}
                onPress={() => {
                  setDiaSelecionado(dia);
                  setDataReuniao(dia);
                }}
              >
                <Text style={[styles.diaChipText, ativo && styles.diaChipTextAtivo]}>{formatDiaCurto(dia)}</Text>
                <Text style={[styles.diaChipCount, ativo && styles.diaChipTextAtivo]}>{count} reunião(ões)</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {formAberto && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Marcar reunião</Text>
            <TextInput style={styles.formInput} value={assunto} onChangeText={setAssunto} placeholder="Assunto" placeholderTextColor={CORES.textoSecundario} />
            <View style={styles.formRow}>
              <TextInput style={[styles.formInput, styles.formInputFlex]} value={dataReuniao} onChangeText={setDataReuniao} placeholder="AAAA-MM-DD" placeholderTextColor={CORES.textoSecundario} />
              <TextInput style={[styles.formInput, styles.formInputSmall]} value={horaReuniao} onChangeText={setHoraReuniao} placeholder="08:00" placeholderTextColor={CORES.textoSecundario} />
            </View>
            <TextInput style={styles.formInput} value={duracao} onChangeText={setDuracao} keyboardType="numeric" placeholder="Duração em minutos" placeholderTextColor={CORES.textoSecundario} />
            <TextInput style={[styles.formInput, styles.formTextarea]} value={descricao} onChangeText={setDescricao} placeholder="Descrição opcional" placeholderTextColor={CORES.textoSecundario} multiline />
            <Text style={styles.formLabel}>Participantes</Text>
            <View style={styles.participantesWrap}>
              {usuarios.filter((u) => Number(u.id) !== Number(usuario?.id)).map((u) => {
                const selected = participantesIds.includes(Number(u.id));
                return (
                  <TouchableOpacity key={u.id} style={[styles.participanteChip, selected && styles.participanteChipAtivo]} onPress={() => toggleParticipante(Number(u.id))}>
                    <Text style={[styles.participanteText, selected && styles.participanteTextAtivo]}>{u.nome}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={[styles.salvarBtn, salvandoReuniao && styles.enviarBtnDisabled]} onPress={criarReuniao} disabled={salvandoReuniao}>
              {salvandoReuniao ? <ActivityIndicator color="#FFF" /> : <MaterialCommunityIcons name="calendar-check" size={18} color="#FFF" />}
              <Text style={styles.salvarBtnText}>{salvandoReuniao ? 'Salvando...' : 'Marcar reunião'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.listaReunioesHeader}>
          <Text style={styles.secaoTitulo}>{formatDiaCurto(diaSelecionado)}</Text>
          {loadingAgenda && <ActivityIndicator size="small" color={CORES.primaria} />}
        </View>
        {reunioesDia.length === 0 ? (
          <View style={styles.vazioAgenda}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={42} color={CORES.textoSecundario} />
            <Text style={styles.vazioTexto}>Nenhuma reunião neste dia.</Text>
          </View>
        ) : (
          reunioesDia.map((r) => (
            <View key={r.id} style={[styles.reuniaoCard, r.status === 'cancelada' && styles.reuniaoCancelada]}>
              <View style={styles.reuniaoHora}>
                <Text style={styles.reuniaoHoraText}>{formatHora(r.inicio_em)}</Text>
                <Text style={styles.reuniaoDuracao}>{formatHora(r.fim_em)}</Text>
              </View>
              <View style={styles.reuniaoInfo}>
                <View style={styles.reuniaoTopo}>
                  <Text style={styles.reuniaoTitulo} numberOfLines={2}>{r.assunto}</Text>
                  <Text style={[styles.reuniaoStatus, r.status === 'cancelada' && styles.reuniaoStatusCancelada]}>
                    {r.status === 'cancelada' ? 'Cancelada' : 'Ativa'}
                  </Text>
                </View>
                {r.descricao ? <Text style={styles.reuniaoDescricao} numberOfLines={2}>{r.descricao}</Text> : null}
                <Text style={styles.reuniaoParticipantes} numberOfLines={1}>
                  {(r.participantes || []).map((p) => p.nome).join(', ') || 'Participantes vinculados'}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={conversas}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderConversa}
      refreshControl={
        <RefreshControl
          refreshing={refresh}
          onRefresh={() => {
            setRefresh(true);
            carregarBase();
          }}
          colors={[CORES.primaria]}
        />
      }
      ListHeaderComponent={
        <View>
          {header}
          {usuariosDisponiveis.length > 0 && (
            <View style={styles.secao}>
              <Text style={styles.secaoTitulo}>Iniciar conversa</Text>
              <FlatList data={usuariosDisponiveis} keyExtractor={(item) => String(item.id)} renderItem={renderUsuario} scrollEnabled={false} />
            </View>
          )}
          <Text style={styles.secaoTitulo}>Conversas recentes</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.vazio}>
          <MaterialCommunityIcons name="message-off-outline" size={52} color={CORES.textoSecundario} />
          <Text style={styles.vazioTexto}>Nenhuma conversa ainda.</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  content: { padding: 16, paddingBottom: 36 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: CORES.fundo },
  hero: {
    backgroundColor: CORES.primariaEscura,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    elevation: 2,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: CORES.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1 },
  titulo: { fontSize: 20, fontWeight: '900', color: '#FFF' },
  subtitulo: { fontSize: 13, color: 'rgba(255,255,255,0.78)', marginTop: 3, lineHeight: 18 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: CORES.superficie,
    borderRadius: 14,
    padding: 4,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: CORES.borda,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  segmentAtivo: { backgroundColor: CORES.primaria },
  segmentText: { color: CORES.primaria, fontSize: 13, fontWeight: '800' },
  segmentTextAtivo: { color: '#FFF' },
  secao: { marginBottom: 18 },
  secaoTitulo: {
    fontSize: 13,
    fontWeight: '900',
    color: CORES.textoSecundario,
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.4,
  },
  conversaCard: {
    backgroundColor: CORES.superficie,
    borderRadius: 14,
    padding: 13,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    elevation: 1,
    borderWidth: 1,
    borderColor: CORES.borda,
  },
  usuarioCard: {
    backgroundColor: CORES.superficie,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: CORES.borda,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: CORES.primariaMuitoClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarNovo: { backgroundColor: CORES.sucessoClaro },
  avatarText: { color: CORES.primaria, fontWeight: '900', fontSize: 14 },
  avatarNovoText: { color: CORES.sucesso },
  conversaInfo: { flex: 1, minWidth: 0 },
  conversaTopo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  conversaNome: { flex: 1, fontSize: 15, fontWeight: '800', color: CORES.texto },
  ultimaMensagem: { fontSize: 12, color: CORES.textoSecundario, marginTop: 3 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: CORES.erro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  vazio: { alignItems: 'center', paddingTop: 32, gap: 10 },
  vazioChat: { alignItems: 'center', paddingTop: 60, gap: 10 },
  vazioTexto: { color: CORES.textoSecundario, fontSize: 14 },
  chatHeader: {
    backgroundColor: CORES.superficie,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: CORES.borda,
  },
  voltarBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CORES.primariaMuitoClara,
  },
  chatTitulo: { fontSize: 16, fontWeight: '900', color: CORES.texto },
  chatSubtitulo: { fontSize: 12, color: CORES.textoSecundario, marginTop: 2 },
  mensagensLista: { flex: 1 },
  mensagensContent: { padding: 14, paddingBottom: 18 },
  mensagemRow: { alignItems: 'flex-start', marginBottom: 9 },
  mensagemRowMinha: { alignItems: 'flex-end' },
  bolha: { maxWidth: '82%', borderRadius: 16, padding: 11 },
  bolhaMinha: { backgroundColor: CORES.primaria },
  bolhaOutra: { backgroundColor: CORES.superficie, borderWidth: 1, borderColor: CORES.borda },
  autor: { fontSize: 11, color: CORES.textoSecundario, fontWeight: '700', marginBottom: 3 },
  mensagemTexto: { fontSize: 14, color: CORES.texto, lineHeight: 19 },
  mensagemTextoMinha: { color: '#FFF' },
  mensagemApagada: { color: CORES.textoSecundario, fontStyle: 'italic' },
  hora: { fontSize: 10, color: CORES.textoSecundario, alignSelf: 'flex-end', marginTop: 5 },
  horaMinha: { color: 'rgba(255,255,255,0.75)' },
  composer: {
    backgroundColor: CORES.superficie,
    borderTopWidth: 1,
    borderTopColor: CORES.borda,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: CORES.borda,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: CORES.texto,
    backgroundColor: CORES.fundo,
    fontSize: 14,
  },
  enviarBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CORES.primaria,
  },
  enviarBtnDisabled: { opacity: 0.55 },
  agendaSummary: {
    backgroundColor: CORES.primariaEscura,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  summaryKicker: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '800' },
  summaryNumber: { color: '#FFF', fontSize: 34, fontWeight: '900', marginTop: 4 },
  summaryList: { flex: 1, justifyContent: 'center', gap: 5 },
  summaryItem: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  summaryEmpty: { color: 'rgba(255,255,255,0.76)', fontSize: 13, lineHeight: 18 },
  agendaToolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  novaReuniaoBtn: {
    backgroundColor: CORES.secundaria,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  novaReuniaoText: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  diasRow: { gap: 8, paddingBottom: 14 },
  diaChip: {
    width: 104,
    borderRadius: 14,
    padding: 10,
    backgroundColor: CORES.superficie,
    borderWidth: 1,
    borderColor: CORES.borda,
  },
  diaChipAtivo: { backgroundColor: CORES.primaria, borderColor: CORES.primaria },
  diaChipText: { color: CORES.texto, fontSize: 14, fontWeight: '900' },
  diaChipCount: { color: CORES.textoSecundario, fontSize: 11, marginTop: 4 },
  diaChipTextAtivo: { color: '#FFF' },
  formCard: {
    backgroundColor: CORES.superficie,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: CORES.borda,
    marginBottom: 16,
  },
  formTitle: { fontSize: 16, fontWeight: '900', color: CORES.texto, marginBottom: 10 },
  formInput: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CORES.borda,
    paddingHorizontal: 12,
    color: CORES.texto,
    backgroundColor: CORES.fundo,
    marginBottom: 9,
    fontSize: 14,
  },
  formTextarea: { minHeight: 74, paddingTop: 11, textAlignVertical: 'top' },
  formRow: { flexDirection: 'row', gap: 8 },
  formInputFlex: { flex: 1 },
  formInputSmall: { width: 96 },
  formLabel: { fontSize: 12, color: CORES.textoSecundario, fontWeight: '900', textTransform: 'uppercase', marginBottom: 8 },
  participantesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  participanteChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: CORES.fundo,
    borderWidth: 1,
    borderColor: CORES.borda,
  },
  participanteChipAtivo: { backgroundColor: CORES.primariaMuitoClara, borderColor: CORES.primaria },
  participanteText: { fontSize: 12, color: CORES.textoSecundario, fontWeight: '800' },
  participanteTextAtivo: { color: CORES.primaria },
  salvarBtn: {
    backgroundColor: CORES.primaria,
    minHeight: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  salvarBtnText: { color: '#FFF', fontSize: 14, fontWeight: '900' },
  listaReunioesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vazioAgenda: {
    backgroundColor: CORES.superficie,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: CORES.borda,
  },
  reuniaoCard: {
    backgroundColor: CORES.superficie,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: CORES.borda,
    marginBottom: 10,
  },
  reuniaoCancelada: { opacity: 0.65 },
  reuniaoHora: {
    width: 62,
    borderRadius: 12,
    backgroundColor: CORES.primariaMuitoClara,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  reuniaoHoraText: { color: CORES.primaria, fontSize: 15, fontWeight: '900' },
  reuniaoDuracao: { color: CORES.textoSecundario, fontSize: 11, marginTop: 2 },
  reuniaoInfo: { flex: 1, minWidth: 0 },
  reuniaoTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  reuniaoTitulo: { flex: 1, color: CORES.texto, fontSize: 15, fontWeight: '900' },
  reuniaoStatus: { color: CORES.sucesso, fontSize: 11, fontWeight: '900', backgroundColor: CORES.sucessoClaro, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  reuniaoStatusCancelada: { color: CORES.erro, backgroundColor: CORES.erroClaro },
  reuniaoDescricao: { color: CORES.textoSecundario, fontSize: 12, marginTop: 6, lineHeight: 17 },
  reuniaoParticipantes: { color: CORES.textoSecundario, fontSize: 12, marginTop: 7, fontWeight: '700' },
});
