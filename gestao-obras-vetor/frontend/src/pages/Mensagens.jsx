import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
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
  Info
} from 'lucide-react';
import Navbar from '../components/Navbar';
import {
  anexarArquivoMensagem,
  criarConversaDireta,
  editarMensagem,
  enviarMensagemConversa,
  getProjetos,
  getUsuarios,
  patchUsuarioPresenca,
  listarConversas,
  listarMensagensConversa,
  marcarConversaComoLida,
  removerMensagem
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

  // Datas vindas do SQLite (CURRENT_TIMESTAMP) estão em UTC e sem timezone explícito.
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

const getAvatarUrl = (avatar) => (avatar ? `/uploads/${avatar}` : null);

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
  const { usuario, atualizarUsuarioLogado } = useAuth();
  const { success, error, info } = useNotification();
  const { prompt, confirm } = useDialog();

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
            <h2><MessageSquare size={18} /> Conversas</h2>
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
        </section>

        <section className="mensagens-chat card">
          {!conversaAtiva ? (
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
                            <a key={a.id} href={a.caminho} target="_blank" rel="noreferrer">
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
