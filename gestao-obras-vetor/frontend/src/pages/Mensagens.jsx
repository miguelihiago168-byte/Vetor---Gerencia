import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  MessageSquare,
  Send,
  Paperclip,
  Plus,
  Check,
  CheckCheck,
  Building2,
  UserRound,
  MoreVertical,
  Reply,
  Copy,
  Pencil,
  Trash2,
  Info,
  CalendarDays,
  Clock,
  Users,
  XCircle,
  Save
} from 'lucide-react';
import Navbar from '../components/Navbar';
import {
  anexarArquivoMensagem,
  criarConversaDireta,
  editarMensagem,
  enviarMensagemConversa,
  getProjetos,
  getUsuarios,
  listarReunioesMensagens,
  criarReuniaoMensagem,
  editarReuniaoMensagem,
  cancelarReuniaoMensagem,
  patchUsuarioPresenca,
  listarConversas,
  listarMensagensConversa,
  marcarConversaComoLida,
  removerMensagem,
  getUploadUrl
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import './Mensagens.css';

const getToken = () => localStorage.getItem('token') || sessionStorage.getItem('token') || '';

const JANELA_EDICAO_EXCLUSAO_MS = 10 * 60 * 1000;

const parseBackendTimestamp = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;

  const text = String(value).trim();
  if (!text) return null;

  // Datas vindas do PostgreSQL (CURRENT_TIMESTAMP) estão em UTC e sem timezone explícito.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    return new Date(text.replace(' ', 'T') + 'Z');
  }

  return new Date(text);
};

const formatTs = (value) => {
  if (!value) return '-';
  const parsed = parseBackendTimestamp(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return '-';

  return parsed.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const pad2 = (value) => String(value).padStart(2, '0');

const toDateInputValue = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const toMonthInputValue = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;

const parseDateOnlyLocal = (value) => {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day, 12, 0, 0);
};

const formatHora = (value) => {
  const parsed = parseBackendTimestamp(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return '--:--';
  return parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const formatDataCurta = (value) => {
  const parsed = parseBackendTimestamp(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
};

const diffMinutos = (inicio, fim) => {
  const ini = parseBackendTimestamp(inicio);
  const end = parseBackendTimestamp(fim);
  if (!ini || !end || Number.isNaN(ini.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end.getTime() - ini.getTime()) / 60000));
};

const buildCalendarDays = (monthValue) => {
  const [year, month] = String(monthValue || toMonthInputValue(new Date())).split('-').map(Number);
  const base = new Date(year, month - 1, 1);
  const start = new Date(base);
  start.setDate(start.getDate() - start.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      value: toDateInputValue(date),
      inMonth: date.getMonth() === base.getMonth()
    };
  });
};

const podeEditarOuApagarMensagem = (msg) => {
  if (Number(msg?.dentro_prazo_edicao) === 1) return true;

  const enviadaEm = parseBackendTimestamp(msg?.enviado_em);
  if (!enviadaEm || Number.isNaN(enviadaEm.getTime())) return false;

  return Date.now() - enviadaEm.getTime() <= JANELA_EDICAO_EXCLUSAO_MS;
};

const getInitials = (name) => {
  if (!name) return '?';
  const partes = String(name).trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return (partes[0][0] || '?').toUpperCase();
  return `${partes[0][0] || ''}${partes[partes.length - 1][0] || ''}`.toUpperCase();
};

const getAvatarUrl = (avatar) => (avatar ? getUploadUrl(avatar) : null);

const normalizarPresenca = (value) => {
  const v = String(value || '').toLowerCase();
  if (v === 'ausente' || v === 'indisponivel' || v === 'disponivel') return v;
  return 'disponivel';
};

const labelPresenca = (value) => {
  const status = normalizarPresenca(value);
  if (status === 'ausente') return 'Ausente';
  if (status === 'indisponivel') return 'Indisponível';
  return 'Disponível';
};

export default function Mensagens() {
  const { projetoId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { usuario, atualizarUsuarioLogado } = useAuth();
  const { success, error, info } = useNotification();
  const { prompt, confirm } = useDialog();
  const hojeInput = useMemo(() => toDateInputValue(new Date()), []);

  const [loading, setLoading] = useState(true);
  const [projetos, setProjetos] = useState([]);
  const [usuariosDestino, setUsuariosDestino] = useState([]);
  const [conversas, setConversas] = useState([]);
  const [conversaAtiva, setConversaAtiva] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [respostaPara, setRespostaPara] = useState(null);
  const [arquivoPendente, setArquivoPendente] = useState(null);
  const [enviandoMensagem, setEnviandoMensagem] = useState(false);
  const [atualizandoPresenca, setAtualizandoPresenca] = useState(false);

  const [destinoProjetoId, setDestinoProjetoId] = useState('');
  const [destinoUsuarioId, setDestinoUsuarioId] = useState('');
  const [menuMensagemId, setMenuMensagemId] = useState(null);
  const [menuMensagemDirecao, setMenuMensagemDirecao] = useState('down');
  const [modoMensagens, setModoMensagens] = useState(() => searchParams.get('tab') === 'agenda' ? 'agenda' : 'conversas');
  const [agendaMes, setAgendaMes] = useState(() => toMonthInputValue(new Date()));
  const [agendaDia, setAgendaDia] = useState(() => hojeInput);
  const [reunioes, setReunioes] = useState([]);
  const [usuariosAgenda, setUsuariosAgenda] = useState([]);
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [salvandoReuniao, setSalvandoReuniao] = useState(false);
  const [reuniaoEditandoId, setReuniaoEditandoId] = useState(null);
  const [reuniaoFocoId, setReuniaoFocoId] = useState(() => searchParams.get('reuniao') || '');
  const [formReuniao, setFormReuniao] = useState({
    assunto: '',
    descricao: '',
    data: hojeInput,
    hora: '09:00',
    duracao_minutos: 60,
    participantes_ids: []
  });

  const socketRef = useRef(null);

  const projetoOrigemId = useMemo(() => Number(projetoId || 0), [projetoId]);

  const carregarConversas = async () => {
    const response = await listarConversas(projetoOrigemId ? { projeto_id: projetoOrigemId } : undefined);
    const lista = response.data || [];
    setConversas(lista);
    return lista;
  };

  const carregarMensagens = async (conversaId) => {
    if (!conversaId) return;
    const response = await listarMensagensConversa(conversaId);
    setMensagens(response.data || []);
    await marcarConversaComoLida(conversaId);
    await carregarConversas();
  };

  const getPeriodoAgenda = (monthValue = agendaMes) => {
    const [year, month] = String(monthValue).split('-').map(Number);
    const first = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);
    return {
      data_inicio: toDateInputValue(first),
      data_fim: toDateInputValue(last)
    };
  };

  const carregarReunioes = async (monthValue = agendaMes) => {
    if (!projetoOrigemId) return [];
    try {
      setLoadingAgenda(true);
      const response = await listarReunioesMensagens({
        projeto_id: projetoOrigemId,
        ...getPeriodoAgenda(monthValue)
      });
      const lista = response.data || [];
      setReunioes(lista);
      return lista;
    } catch (e) {
      error(`Erro ao carregar agenda: ${e.response?.data?.erro || e.message}`);
      setReunioes([]);
      return [];
    } finally {
      setLoadingAgenda(false);
    }
  };

  const carregarDadosIniciais = async () => {
    try {
      setLoading(true);
      const [projetosRes, conversasRes] = await Promise.all([
        getProjetos(),
        listarConversas(projetoOrigemId ? { projeto_id: projetoOrigemId } : undefined)
      ]);

      const listaProjetos = projetosRes.data || [];
      const listaConversas = conversasRes.data || [];

      setProjetos(listaProjetos);
      setConversas(listaConversas);
      if (!destinoProjetoId && projetoOrigemId) {
        setDestinoProjetoId(String(projetoOrigemId));
      }

      if (listaConversas.length > 0) {
        const primeira = listaConversas[0];
        setConversaAtiva(primeira);
        await carregarMensagens(primeira.id);
      }
    } catch (e) {
      error(`Erro ao carregar mensagens: ${e.response?.data?.erro || e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDadosIniciais();
  }, [projetoOrigemId]);

  useEffect(() => {
    if (modoMensagens === 'agenda') {
      carregarReunioes(agendaMes);
    }
  }, [modoMensagens, agendaMes, projetoOrigemId]);

  useEffect(() => {
    const projeto = Number(destinoProjetoId);
    if (!projeto) {
      setUsuariosDestino([]);
      return;
    }

    getUsuarios({ projeto_id: projeto, ativo: 1 })
      .then((res) => setUsuariosDestino(res.data || []))
      .catch(() => setUsuariosDestino([]));
  }, [destinoProjetoId]);

  useEffect(() => {
    if (searchParams.get('tab') === 'agenda') setModoMensagens('agenda');
    const reuniaoId = searchParams.get('reuniao');
    if (reuniaoId) setReuniaoFocoId(reuniaoId);
  }, [searchParams]);

  useEffect(() => {
    if (!projetoOrigemId) {
      setUsuariosAgenda([]);
      return;
    }

    getUsuarios({ projeto_id: projetoOrigemId, ativo: 1 })
      .then((res) => setUsuariosAgenda(res.data || []))
      .catch(() => setUsuariosAgenda([]));
  }, [projetoOrigemId]);

  useEffect(() => {
    const token = getToken();
    if (!token || !usuario?.id) return;

    const socket = io('/', {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    const refresh = async (payload) => {
      try {
        await carregarConversas();
        if (conversaAtiva?.id) {
          await carregarMensagens(conversaAtiva.id);
        }
        if (payload?.remetente_usuario_id && Number(payload.remetente_usuario_id) !== Number(usuario.id)) {
          info(`Nova mensagem de ${payload.remetente_nome || 'usuário'}`);
        }
      } catch (_) {
        // silencioso
      }
    };

    socket.on('connect', () => {
      if (conversaAtiva?.id) socket.emit('mensagens:join-conversa', { conversaId: conversaAtiva.id });
    });

    socket.on('message.created', refresh);
    socket.on('message.updated', refresh);
    socket.on('message.deleted', refresh);
    socket.on('message.attachment', refresh);
    socket.on('message.read', () => {
      carregarConversas().catch(() => {});
    });

    socketRef.current = socket;

    return () => {
      socket.off('message.created', refresh);
      socket.off('message.updated', refresh);
      socket.off('message.deleted', refresh);
      socket.off('message.attachment', refresh);
      socket.disconnect();
    };
  }, [usuario?.id, conversaAtiva?.id]);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (!event.target.closest('.mensagem-menu-wrap')) {
        setMenuMensagemId(null);
      }
    };

    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, []);

  const selecionarConversa = async (item) => {
    if (!item?.id) return;
    if (conversaAtiva?.id) {
      socketRef.current?.emit('mensagens:leave-conversa', { conversaId: conversaAtiva.id });
    }
    setConversaAtiva(item);
    socketRef.current?.emit('mensagens:join-conversa', { conversaId: item.id });
    await carregarMensagens(item.id);
  };

  const handleCriarConversa = async (e) => {
    e.preventDefault();

    if (!projetoOrigemId || !destinoProjetoId || !destinoUsuarioId) {
      error('Selecione obra de origem, destino e usuário para iniciar a conversa.');
      return;
    }

    try {
      const response = await criarConversaDireta({
        projeto_origem_id: projetoOrigemId,
        projeto_destino_id: Number(destinoProjetoId),
        destinatario_usuario_id: Number(destinoUsuarioId)
      });

      const novaConversa = response.data?.conversa;
      if (!novaConversa?.id) throw new Error('Conversa não retornada pela API.');

      await carregarConversas();
      await selecionarConversa(novaConversa);
      success('Conversa pronta para envio de mensagens.');
    } catch (e2) {
      error(`Erro ao criar conversa: ${e2.response?.data?.erro || e2.message}`);
    }
  };

  const reunioesPorDia = useMemo(() => {
    const map = new Map();
    for (const reuniao of reunioes) {
      const parsed = parseBackendTimestamp(reuniao.inicio_em);
      if (!parsed || Number.isNaN(parsed.getTime())) continue;
      const key = toDateInputValue(parsed);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(reuniao);
    }
    return map;
  }, [reunioes]);

  const reunioesDiaSelecionado = useMemo(() => {
    return [...(reunioesPorDia.get(agendaDia) || [])].sort((a, b) => {
      const da = parseBackendTimestamp(a.inicio_em)?.getTime() || 0;
      const db = parseBackendTimestamp(b.inicio_em)?.getTime() || 0;
      return da - db;
    });
  }, [reunioesPorDia, agendaDia]);

  const calendarioDias = useMemo(() => buildCalendarDays(agendaMes), [agendaMes]);

  useEffect(() => {
    if (!reuniaoFocoId || reunioes.length === 0) return;
    const reuniao = reunioes.find((item) => Number(item.id) === Number(reuniaoFocoId));
    if (!reuniao?.inicio_em) return;
    const data = toDateInputValue(parseBackendTimestamp(reuniao.inicio_em));
    setAgendaDia(data);
    setAgendaMes(toMonthInputValue(parseBackendTimestamp(reuniao.inicio_em)));
  }, [reuniaoFocoId, reunioes]);

  const handleSelecionarDiaAgenda = (dayValue) => {
    setAgendaDia(dayValue);
    setFormReuniao((prev) => ({ ...prev, data: dayValue }));
    setReuniaoFocoId('');
  };

  const resetFormReuniao = () => {
    setReuniaoEditandoId(null);
    setFormReuniao({
      assunto: '',
      descricao: '',
      data: agendaDia,
      hora: '09:00',
      duracao_minutos: 60,
      participantes_ids: []
    });
  };

  const toggleParticipanteReuniao = (id) => {
    setFormReuniao((prev) => {
      const idNum = Number(id);
      const atuais = new Set((prev.participantes_ids || []).map(Number));
      if (atuais.has(idNum)) atuais.delete(idNum);
      else atuais.add(idNum);
      return { ...prev, participantes_ids: Array.from(atuais) };
    });
  };

  const handleEditarReuniao = (reuniao) => {
    const inicio = parseBackendTimestamp(reuniao.inicio_em) || new Date();
    setModoMensagens('agenda');
    setAgendaDia(toDateInputValue(inicio));
    setReuniaoEditandoId(reuniao.id);
    setFormReuniao({
      assunto: reuniao.assunto || '',
      descricao: reuniao.descricao || '',
      data: toDateInputValue(inicio),
      hora: `${pad2(inicio.getHours())}:${pad2(inicio.getMinutes())}`,
      duracao_minutos: diffMinutos(reuniao.inicio_em, reuniao.fim_em) || 60,
      participantes_ids: (reuniao.participantes || [])
        .filter((p) => Number(p.id) !== Number(usuario?.id))
        .map((p) => Number(p.id))
    });
  };

  const handleSalvarReuniao = async (e) => {
    e.preventDefault();
    if (!projetoOrigemId) return;
    if (!formReuniao.assunto.trim()) {
      error('Informe o assunto da reunião.');
      return;
    }
    if (!formReuniao.participantes_ids.length) {
      error('Selecione pelo menos um participante.');
      return;
    }

    const payload = {
      projeto_id: projetoOrigemId,
      assunto: formReuniao.assunto.trim(),
      descricao: formReuniao.descricao.trim(),
      inicio_em: `${formReuniao.data}T${formReuniao.hora}:00`,
      duracao_minutos: Number(formReuniao.duracao_minutos || 60),
      participantes_ids: formReuniao.participantes_ids.map(Number)
    };

    try {
      setSalvandoReuniao(true);
      if (reuniaoEditandoId) {
        await editarReuniaoMensagem(reuniaoEditandoId, payload);
        success('Reunião atualizada e convidados notificados.');
      } else {
        await criarReuniaoMensagem(payload);
        success('Reunião marcada e convidados notificados.');
      }
      resetFormReuniao();
      await carregarReunioes(agendaMes);
    } catch (e2) {
      error(`Erro ao salvar reunião: ${e2.response?.data?.erro || e2.message}`);
    } finally {
      setSalvandoReuniao(false);
    }
  };

  const handleCancelarReuniao = async (reuniao) => {
    const ok = await confirm({
      title: 'Cancelar reunião',
      message: `Cancelar "${reuniao.assunto}" e avisar os convidados?`,
      confirmText: 'Cancelar reunião',
      cancelText: 'Manter'
    });
    if (!ok) return;

    try {
      await cancelarReuniaoMensagem(reuniao.id);
      success('Reunião cancelada.');
      await carregarReunioes(agendaMes);
    } catch (e) {
      error(`Erro ao cancelar reunião: ${e.response?.data?.erro || e.message}`);
    }
  };

  const handleEnviarMensagem = async (e) => {
    e.preventDefault();
    if (!conversaAtiva?.id) return;
    if (!texto.trim()) return;
    if (enviandoMensagem) return;

    try {
      setEnviandoMensagem(true);
      const response = await enviarMensagemConversa(conversaAtiva.id, {
        conteudo: texto.trim(),
        resposta_para_id: respostaPara?.id || undefined
      });

      const mensagemNova = response.data;
      if (arquivoPendente && mensagemNova?.id) {
        const formData = new FormData();
        formData.append('arquivo', arquivoPendente);
        await anexarArquivoMensagem(mensagemNova.id, formData);
      }

      setTexto('');
      setRespostaPara(null);
      setArquivoPendente(null);
      await carregarMensagens(conversaAtiva.id);
      await carregarConversas();
    } catch (e2) {
      error(`Erro ao enviar mensagem: ${e2.response?.data?.erro || e2.message}`);
    } finally {
      setEnviandoMensagem(false);
    }
  };

  const handleEditarMensagem = async (mensagem) => {
    const novoConteudo = await prompt({
      title: 'Editar mensagem',
      message: 'Atualize o texto da sua mensagem.',
      defaultValue: mensagem.conteudo || '',
      placeholder: 'Digite o novo conteúdo',
      confirmText: 'Salvar',
      cancelText: 'Cancelar'
    });
    if (!novoConteudo || !novoConteudo.trim()) return;

    try {
      await editarMensagem(mensagem.id, { conteudo: novoConteudo.trim() });
      await carregarMensagens(conversaAtiva.id);
      success('Mensagem atualizada.');
    } catch (e) {
      error(`Erro ao editar mensagem: ${e.response?.data?.erro || e.message}`);
    }
  };

  const handleExcluirMensagem = async (mensagem) => {
    const ok = await confirm({
      title: 'Apagar mensagem',
      message: 'Essa ação remove a mensagem para os participantes da conversa.',
      confirmText: 'Apagar',
      cancelText: 'Cancelar'
    });
    if (!ok) return;

    try {
      await removerMensagem(mensagem.id);
      await carregarMensagens(conversaAtiva.id);
      success('Mensagem removida.');
    } catch (e) {
      error(`Erro ao remover mensagem: ${e.response?.data?.erro || e.message}`);
    }
  };

  const handleCopiarMensagem = async (mensagem) => {
    try {
      await navigator.clipboard.writeText(mensagem?.conteudo || '');
      success('Mensagem copiada.');
    } catch (_) {
      error('Não foi possível copiar a mensagem.');
    }
  };

  const handleDadosMensagem = (mensagem) => {
    const partes = [`Enviada: ${formatTs(mensagem?.enviado_em)}`];
    if (mensagem?.editado_em) partes.push(`Editada: ${formatTs(mensagem?.editado_em)}`);
    if (mensagem?.deletado_em) partes.push(`Apagada: ${formatTs(mensagem?.deletado_em)}`);
    info(partes.join(' | '));
  };

  const handleAtualizarMinhaPresenca = async (novoStatus) => {
    if (!usuario?.id || !novoStatus || atualizandoPresenca) return;
    const atual = normalizarPresenca(usuario?.presenca_status);
    const proximo = normalizarPresenca(novoStatus);
    if (atual === proximo) return;

    try {
      setAtualizandoPresenca(true);
      const res = await patchUsuarioPresenca(usuario.id, proximo);
      const atualizado = res?.data?.usuario || {};
      if (typeof atualizarUsuarioLogado === 'function') {
        atualizarUsuarioLogado({
          presenca_status: atualizado.presenca_status || proximo,
          presenca_atualizado_em: atualizado.presenca_atualizado_em || null
        });
      }
      success(`Status alterado para ${labelPresenca(proximo)}.`);
      await carregarConversas();
    } catch (e) {
      error(`Erro ao atualizar status: ${e.response?.data?.erro || e.message}`);
    } finally {
      setAtualizandoPresenca(false);
    }
  };

  const renderAgendaSidebar = () => (
    <>
      <div className="mensagens-agenda-head">
        <div>
          <span className="mensagens-new-title">Agenda do projeto</span>
          <span className="mensagens-new-subtitle">Marque reuniões e avise os envolvidos.</span>
        </div>
        <input
          type="month"
          value={agendaMes}
          onChange={(e) => setAgendaMes(e.target.value || toMonthInputValue(new Date()))}
          aria-label="Mês da agenda"
        />
      </div>

      <div className="mensagens-calendar-grid" aria-label="Calendário de reuniões">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((label, index) => (
          <span key={`${label}-${index}`} className="mensagens-calendar-weekday">{label}</span>
        ))}
        {calendarioDias.map((day) => {
          const count = reunioesPorDia.get(day.value)?.length || 0;
          const active = day.value === agendaDia;
          return (
            <button
              type="button"
              key={day.value}
              className={`mensagens-calendar-day${day.inMonth ? '' : ' muted'}${active ? ' active' : ''}${count ? ' has-events' : ''}`}
              onClick={() => handleSelecionarDiaAgenda(day.value)}
              title={count ? `${count} reunião(ões)` : 'Sem reuniões'}
            >
              <span>{day.date.getDate()}</span>
              {count > 0 && <i>{count}</i>}
            </button>
          );
        })}
      </div>

      <form className="mensagens-meeting-form" onSubmit={handleSalvarReuniao}>
        <div className="mensagens-new-head">
          <span className="mensagens-new-title">{reuniaoEditandoId ? 'Editar reunião' : 'Nova reunião'}</span>
          <span className="mensagens-new-subtitle">O criador também entra como participante.</span>
        </div>

        <label className="mensagens-field">
          <span className="mensagens-field-label"><CalendarDays size={14} /> Assunto</span>
          <input
            value={formReuniao.assunto}
            maxLength={160}
            onChange={(e) => setFormReuniao((prev) => ({ ...prev, assunto: e.target.value }))}
            placeholder="Ex: alinhamento de medição"
          />
        </label>

        <div className="mensagens-meeting-row">
          <label className="mensagens-field">
            <span className="mensagens-field-label"><CalendarDays size={14} /> Dia</span>
            <input
              type="date"
              value={formReuniao.data}
              onChange={(e) => {
                setFormReuniao((prev) => ({ ...prev, data: e.target.value }));
                setAgendaDia(e.target.value);
              }}
            />
          </label>
          <label className="mensagens-field">
            <span className="mensagens-field-label"><Clock size={14} /> Hora</span>
            <input
              type="time"
              value={formReuniao.hora}
              onChange={(e) => setFormReuniao((prev) => ({ ...prev, hora: e.target.value }))}
            />
          </label>
        </div>

        <label className="mensagens-field">
          <span className="mensagens-field-label"><Clock size={14} /> Duração</span>
          <select
            value={formReuniao.duracao_minutos}
            onChange={(e) => setFormReuniao((prev) => ({ ...prev, duracao_minutos: Number(e.target.value) }))}
          >
            <option value={15}>15 minutos</option>
            <option value={30}>30 minutos</option>
            <option value={45}>45 minutos</option>
            <option value={60}>1 hora</option>
            <option value={90}>1h30</option>
            <option value={120}>2 horas</option>
          </select>
        </label>

        <label className="mensagens-field">
          <span className="mensagens-field-label"><Info size={14} /> Descrição</span>
          <textarea
            rows={3}
            value={formReuniao.descricao}
            maxLength={1000}
            onChange={(e) => setFormReuniao((prev) => ({ ...prev, descricao: e.target.value }))}
            placeholder="Pauta, local ou link da chamada..."
          />
        </label>

        <div className="mensagens-field">
          <span className="mensagens-field-label"><Users size={14} /> Participantes</span>
          <div className="mensagens-participants-list">
            {usuariosAgenda
              .filter((u) => Number(u.id) !== Number(usuario?.id))
              .map((u) => {
                const checked = formReuniao.participantes_ids.map(Number).includes(Number(u.id));
                return (
                  <label key={u.id} className={`mensagens-participant-option${checked ? ' active' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleParticipanteReuniao(u.id)}
                    />
                    <span>{u.nome}</span>
                  </label>
                );
              })}
          </div>
        </div>

        <div className="mensagens-meeting-actions">
          {reuniaoEditandoId && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={resetFormReuniao}>
              <XCircle size={14} /> Cancelar edição
            </button>
          )}
          <button type="submit" className="btn btn-primary btn-sm mensagens-start-btn" disabled={salvandoReuniao}>
            <Save size={14} /> {salvandoReuniao ? 'Salvando...' : reuniaoEditandoId ? 'Salvar' : 'Marcar'}
          </button>
        </div>
      </form>
    </>
  );

  const renderAgendaPanel = () => (
    <>
      <header className="mensagens-chat-header mensagens-agenda-panel-header">
        <div className="mensagens-chat-userhead">
          <span className="mensagens-agenda-icon"><CalendarDays size={22} /></span>
          <div className="mensagens-chat-usertext">
            <h3>{formatDataCurta(`${agendaDia}T12:00:00`)}</h3>
            <span>{loadingAgenda ? 'Atualizando agenda...' : `${reunioesDiaSelecionado.length} reunião(ões) no dia`}</span>
          </div>
        </div>
      </header>

      <div className="mensagens-meeting-list">
        {reunioesDiaSelecionado.length === 0 ? (
          <div className="mensagens-empty-chat">Nenhuma reunião marcada para este dia.</div>
        ) : reunioesDiaSelecionado.map((reuniao) => {
          const minha = Number(reuniao.criada_por) === Number(usuario?.id);
          const focada = Number(reuniaoFocoId) === Number(reuniao.id);
          return (
            <article key={reuniao.id} className={`mensagens-meeting-card${reuniao.status === 'cancelada' ? ' cancelled' : ''}${focada ? ' focused' : ''}`}>
              <div className="mensagens-meeting-time">
                <strong>{formatHora(reuniao.inicio_em)}</strong>
                <span>{diffMinutos(reuniao.inicio_em, reuniao.fim_em)} min</span>
              </div>
              <div className="mensagens-meeting-body">
                <div className="mensagens-meeting-title-row">
                  <h4>{reuniao.assunto}</h4>
                  <span className={`mensagens-meeting-status status-${reuniao.status}`}>{reuniao.status === 'cancelada' ? 'Cancelada' : 'Ativa'}</span>
                </div>
                {reuniao.descricao && <p>{reuniao.descricao}</p>}
                <div className="mensagens-meeting-meta">
                  <span><UserRound size={13} /> {reuniao.criador_nome || 'Criador'}</span>
                  <span><Users size={13} /> {(reuniao.participantes || []).map((p) => p.nome).join(', ')}</span>
                </div>
              </div>
              {minha && reuniao.status !== 'cancelada' && (
                <div className="mensagens-meeting-card-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleEditarReuniao(reuniao)}>
                    <Pencil size={14} /> Editar
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => handleCancelarReuniao(reuniao)}>
                    <XCircle size={14} /> Cancelar
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );

  if (loading) {
    return (
      <div className="page-shell">
        <Navbar />
        <main className="page-content">
          <div className="loading-container">Carregando mensagens...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <Navbar />
      <main className="page-content mensagens-page">
        <section className="mensagens-sidebar card">
          <header className="mensagens-sidebar-header">
            <h2>{modoMensagens === 'agenda' ? <><CalendarDays size={18} /> Agenda</> : <><MessageSquare size={18} /> Conversas</>}</h2>
            <div className="mensagens-mode-tabs" role="tablist" aria-label="Mensagens e agenda">
              <button
                type="button"
                className={modoMensagens === 'conversas' ? 'active' : ''}
                onClick={() => {
                  setModoMensagens('conversas');
                  setSearchParams({});
                }}
              >
                <MessageSquare size={14} /> Conversas
              </button>
              <button
                type="button"
                className={modoMensagens === 'agenda' ? 'active' : ''}
                onClick={() => {
                  setModoMensagens('agenda');
                  setSearchParams({ tab: 'agenda' });
                }}
              >
                <CalendarDays size={14} /> Agenda
              </button>
            </div>
            <div className="mensagens-minha-presenca-wrap">
              <span className="mensagens-minha-presenca-label">Meu status</span>
              <div className="mensagens-minha-presenca-actions" role="group" aria-label="Meu status de presença">
                {['disponivel', 'ausente', 'indisponivel'].map((status) => {
                  const ativo = normalizarPresenca(usuario?.presenca_status) === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      className={`mensagens-minha-presenca-btn${ativo ? ' active' : ''}`}
                      disabled={atualizandoPresenca}
                      onClick={() => handleAtualizarMinhaPresenca(status)}
                    >
                      <span className={`mensagens-presenca-dot mensagens-presenca-dot-${status}`} />
                      {labelPresenca(status)}
                    </button>
                  );
                })}
              </div>
            </div>
          </header>

          {modoMensagens === 'agenda' ? renderAgendaSidebar() : (
            <>
          <form className="mensagens-new-form" onSubmit={handleCriarConversa}>
            <div className="mensagens-new-head">
              <span className="mensagens-new-title">Nova conversa</span>
              <span className="mensagens-new-subtitle">Escolha obra e participante para iniciar.</span>
            </div>

            <label className="mensagens-field">
              <span className="mensagens-field-label"><Building2 size={14} /> Obra destino</span>
              <select value={destinoProjetoId} onChange={(e) => setDestinoProjetoId(e.target.value)}>
                <option value="">Selecione</option>
                {projetos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </label>

            <label className="mensagens-field">
              <span className="mensagens-field-label"><UserRound size={14} /> Usuário destino</span>
              <select value={destinoUsuarioId} onChange={(e) => setDestinoUsuarioId(e.target.value)}>
                <option value="">Selecione</option>
                {usuariosDestino
                  .filter((u) => Number(u.id) !== Number(usuario?.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
              </select>
            </label>

            <button type="submit" className="btn btn-primary btn-sm mensagens-start-btn" disabled={!destinoProjetoId || !destinoUsuarioId}>
              <Plus size={14} /> Iniciar conversa
            </button>
          </form>

          <div className="mensagens-list">
            {conversas.length === 0 && <div className="mensagens-empty">Nenhuma conversa ainda.</div>}
            {conversas.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`mensagens-item${Number(conversaAtiva?.id) === Number(item.id) ? ' active' : ''}`}
                onClick={() => selecionarConversa(item)}
              >
                <div className="mensagens-item-top">
                  <div className="mensagens-user-mini">
                    {item.outro_usuario_avatar ? (
                      <img
                        src={getAvatarUrl(item.outro_usuario_avatar)}
                        alt={item.outro_usuario_nome || `Usuário #${item.outro_usuario_id}`}
                        className="mensagens-avatar mensagens-avatar-mini"
                      />
                    ) : (
                      <span className="mensagens-avatar mensagens-avatar-mini mensagens-avatar-fallback">
                        {getInitials(item.outro_usuario_nome || `U ${item.outro_usuario_id || ''}`)}
                      </span>
                    )}
                    <div className="mensagens-user-mini-text">
                      <strong>{item.outro_usuario_nome || `Usuário #${item.outro_usuario_id}`}</strong>
                      <span className={`mensagens-presenca mensagens-presenca-${normalizarPresenca(item.outro_usuario_presenca_status)}`}>
                        {labelPresenca(item.outro_usuario_presenca_status)}
                      </span>
                    </div>
                  </div>
                  {Number(item.nao_lidas || 0) > 0 && <span className="badge badge-red">{item.nao_lidas}</span>}
                </div>
                <div className="mensagens-item-bottom">{item.ultima_mensagem || 'Sem mensagens ainda.'}</div>
              </button>
            ))}
          </div>
            </>
          )}
        </section>

        <section className="mensagens-chat card">
          {modoMensagens === 'agenda' ? renderAgendaPanel() : !conversaAtiva ? (
            <div className="mensagens-empty-chat">Selecione uma conversa para começar.</div>
          ) : (
            <>
              <header className="mensagens-chat-header">
                <div className="mensagens-chat-userhead">
                  {conversaAtiva.outro_usuario_avatar ? (
                    <img
                      src={getAvatarUrl(conversaAtiva.outro_usuario_avatar)}
                      alt={conversaAtiva.outro_usuario_nome || `Conversa #${conversaAtiva.id}`}
                      className="mensagens-avatar"
                    />
                  ) : (
                    <span className="mensagens-avatar mensagens-avatar-fallback">
                      {getInitials(conversaAtiva.outro_usuario_nome || `C ${conversaAtiva.id}`)}
                    </span>
                  )}
                  <div className="mensagens-chat-usertext">
                    <h3>{conversaAtiva.outro_usuario_nome || `Conversa #${conversaAtiva.id}`}</h3>
                    <span className={`mensagens-presenca mensagens-presenca-${normalizarPresenca(conversaAtiva.outro_usuario_presenca_status)}`}>
                      {labelPresenca(conversaAtiva.outro_usuario_presenca_status)}
                    </span>
                  </div>
                </div>
                <div className="mensagens-chat-actions">
                  <small>Última atividade: {formatTs(conversaAtiva.ultima_mensagem_em || conversaAtiva.atualizado_em)}</small>
                </div>
              </header>

              <div className="mensagens-timeline">
                {mensagens.map((msg) => {
                  const minha = Number(msg.remetente_usuario_id) === Number(usuario?.id);
                  const podeGerenciar = minha && podeEditarOuApagarMensagem(msg);
                  const mensagemApagada = Boolean(msg.deletado_em);
                  const menuAberto = Number(menuMensagemId) === Number(msg.id);
                  return (
                    <article key={msg.id} className={`mensagem-bubble${minha ? ' minha' : ''}`}>
                      <header>
                        <div className="mensagem-author">
                          {msg.remetente_avatar ? (
                            <img
                              src={getAvatarUrl(msg.remetente_avatar)}
                              alt={minha ? 'Você' : msg.remetente_nome}
                              className="mensagens-avatar mensagens-avatar-msg"
                            />
                          ) : (
                            <span className="mensagens-avatar mensagens-avatar-msg mensagens-avatar-fallback">
                              {getInitials(minha ? (usuario?.nome || 'Eu') : msg.remetente_nome)}
                            </span>
                          )}
                          <strong>{minha ? 'Você' : msg.remetente_nome}</strong>
                        </div>
                        <div className="mensagem-top-right">
                          <span>{formatTs(msg.enviado_em)}</span>
                          {!mensagemApagada && (
                            <div className="mensagem-menu-wrap">
                              <button
                                type="button"
                                className="mensagem-menu-trigger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (Number(menuMensagemId) === Number(msg.id)) {
                                    setMenuMensagemId(null);
                                    return;
                                  }

                                  const triggerRect = e.currentTarget.getBoundingClientRect();
                                  const alturaEstimadaMenu = 210;
                                  const espacoAbaixo = window.innerHeight - triggerRect.bottom;
                                  const espacoAcima = triggerRect.top;
                                  const direcao = espacoAbaixo < alturaEstimadaMenu && espacoAcima > espacoAbaixo ? 'up' : 'down';

                                  setMenuMensagemDirecao(direcao);
                                  setMenuMensagemId(msg.id);
                                }}
                                title="Ações da mensagem"
                              >
                                <MoreVertical size={15} />
                              </button>

                              {menuAberto && (
                                <div className={`mensagem-menu-dropdown mensagem-menu-dropdown-${menuMensagemDirecao}`} onClick={(e) => e.stopPropagation()}>
                                  <button type="button" onClick={() => { handleDadosMensagem(msg); setMenuMensagemId(null); }}>
                                    <Info size={14} /> Dados da mensagem
                                  </button>
                                  <button type="button" onClick={() => { setRespostaPara(msg); setMenuMensagemId(null); }}>
                                    <Reply size={14} /> Responder
                                  </button>
                                  <button type="button" onClick={() => { handleCopiarMensagem(msg); setMenuMensagemId(null); }}>
                                    <Copy size={14} /> Copiar
                                  </button>
                                  {podeGerenciar && (
                                    <button type="button" onClick={() => { handleEditarMensagem(msg); setMenuMensagemId(null); }}>
                                      <Pencil size={14} /> Editar
                                    </button>
                                  )}
                                  {podeGerenciar && (
                                    <button type="button" className="danger" onClick={() => { handleExcluirMensagem(msg); setMenuMensagemId(null); }}>
                                      <Trash2 size={14} /> Apagar
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </header>

                      <p className={mensagemApagada ? 'mensagem-texto-apagada' : ''}>
                        {mensagemApagada ? 'Mensagem apagada' : msg.conteudo}
                      </p>

                      {!mensagemApagada && Array.isArray(msg.anexos) && msg.anexos.length > 0 && (
                        <div className="mensagem-anexos">
                          {msg.anexos.map((a) => (
                            <a key={a.id} href={getUploadUrl(a.caminho)} target="_blank" rel="noreferrer">
                              <Paperclip size={14} /> {a.nome_original}
                            </a>
                          ))}
                        </div>
                      )}

                      <footer>
                        <span className="mensagem-status-texto">
                          {formatTs(msg.enviado_em)}
                          {!!msg.editado_em && !mensagemApagada && <em className="mensagem-editada-flag">editada</em>}
                        </span>
                        {minha && !mensagemApagada && (
                          <span
                            className={`mensagem-ticks ${msg.lido_em ? 'lida' : msg.entregue_em ? 'entregue' : 'enviada'}`}
                            title={msg.lido_em ? 'Lida' : msg.entregue_em ? 'Entregue' : 'Enviada'}
                          >
                            {msg.lido_em ? <CheckCheck size={14} /> : msg.entregue_em ? <CheckCheck size={14} /> : <Check size={14} />}
                          </span>
                        )}
                      </footer>

                    </article>
                  );
                })}
              </div>

              <form className="mensagens-composer" onSubmit={handleEnviarMensagem}>
                {respostaPara && (
                  <div className="mensagens-reply-banner">
                    Respondendo: {respostaPara.conteudo}
                    <button type="button" onClick={() => setRespostaPara(null)}>Cancelar</button>
                  </div>
                )}

                <div className="mensagens-composer-box">
                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Digite sua mensagem..."
                    rows={3}
                    disabled={enviandoMensagem}
                  />

                  <div className="mensagens-composer-actions">
                    <label className="btn btn-secondary btn-sm mensagens-anexo-btn">
                      <Paperclip size={14} />
                      {arquivoPendente ? arquivoPendente.name : 'Anexar'}
                      <input
                        type="file"
                        hidden
                        onChange={(e) => setArquivoPendente(e.target.files?.[0] || null)}
                      />
                    </label>
                    <button type="submit" className="btn btn-primary btn-sm mensagens-send-btn" disabled={!texto.trim() || enviandoMensagem}>
                      <Send size={14} /> {enviandoMensagem ? 'Enviando...' : 'Enviar'}
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
