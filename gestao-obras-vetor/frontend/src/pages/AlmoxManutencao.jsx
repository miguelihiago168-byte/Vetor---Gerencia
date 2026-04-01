import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AlmoxarifadoLayout from '../components/AlmoxarifadoLayout';
import { concluirManutencaoFerramenta, enviarFerramentaManutencao, getAlocacoesAbertas, registrarPerdaFerramenta, transferirFerramenta, getProjetos } from '../services/api';
import { useDialog } from '../context/DialogContext';
import { useNotification } from '../context/NotificationContext';
import { formatMoneyInputBR, parseMoneyBR } from '../utils/currency';
import { Eye, MoreHorizontal } from 'lucide-react';

const formManutencaoInicial = {
  local_manutencao: '',
  prazo_estimado_dias: '',
  endereco_manutencao: '',
  custo: '',
  retirada_necessaria: false,
  responsavel_retirada: '',
  justificativa: ''
};

function AlmoxManutencao() {
  const { projetoId } = useParams();
  const { prompt } = useDialog();
  const { success, error } = useNotification();
  const [alocacoes, setAlocacoes] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [modalManutencaoAberto, setModalManutencaoAberto] = useState(false);
  const [alocacaoSelecionada, setAlocacaoSelecionada] = useState(null);
  const [formManutencao, setFormManutencao] = useState(formManutencaoInicial);
  const [modalVisualizarManutencao, setModalVisualizarManutencao] = useState(false);
  const [alocacaoVer, setAlocacaoVer] = useState(null);
  const [menuAbertoId, setMenuAbertoId] = useState(null);
  const [modalSemConserto, setModalSemConserto] = useState(false);
  const [alocacaoSemConserto, setAlocacaoSemConserto] = useState(null);
  const [justificativaSemConserto, setJustificativaSemConserto] = useState('');
  const [enviandoSemConserto, setEnviandoSemConserto] = useState(false);

  const carregar = async () => {
    try {
      const [aRes, pRes] = await Promise.all([getAlocacoesAbertas(projetoId), getProjetos()]);
      setAlocacoes(aRes.data || []);
      setProjetos((pRes.data || []).filter((p) => Number(p.id) !== Number(projetoId)));
    } catch (err) {
      error(err?.response?.data?.erro || 'Erro ao carregar dados de manutenção.', 7000);
    }
  };

  useEffect(() => {
    carregar();
  }, [projetoId]);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    if (!menuAbertoId) return;
    const fechar = () => setMenuAbertoId(null);
    document.addEventListener('click', fechar);
    return () => document.removeEventListener('click', fechar);
  }, [menuAbertoId]);

  const abrirModalManutencao = (alocacao) => {
    setAlocacaoSelecionada(alocacao);
    setFormManutencao(formManutencaoInicial);
    setModalManutencaoAberto(true);
  };

  const fecharModalManutencao = () => {
    setModalManutencaoAberto(false);
    setAlocacaoSelecionada(null);
    setFormManutencao(formManutencaoInicial);
  };

  const enviarManutencao = async (e) => {
    e.preventDefault();
    if (!alocacaoSelecionada) return;

    const pendente = Number(alocacaoSelecionada.quantidade) - Number(alocacaoSelecionada.quantidade_devolvida || 0);
    if (!formManutencao.local_manutencao.trim()) {
      error('Informe onde será feita a manutenção.', 6000);
      return;
    }
    if (!formManutencao.endereco_manutencao.trim()) {
      error('Informe o endereço da manutenção.', 6000);
      return;
    }
    if (formManutencao.prazo_estimado_dias === '' || Number(formManutencao.prazo_estimado_dias) < 0) {
      error('Informe um prazo estimado válido (em dias).', 6000);
      return;
    }
    if (formManutencao.retirada_necessaria && !formManutencao.responsavel_retirada.trim()) {
      error('Informe quem vai retirar o ativo para manutenção.', 6000);
      return;
    }

    try {
      await enviarFerramentaManutencao({
        alocacao_id: alocacaoSelecionada.id,
        quantidade: pendente,
        enviar_para_manutencao: true,
        justificativa: formManutencao.justificativa.trim() || null,
        local_manutencao: formManutencao.local_manutencao.trim(),
        prazo_estimado_dias: Number(formManutencao.prazo_estimado_dias),
        endereco_manutencao: formManutencao.endereco_manutencao.trim(),
        custo: formManutencao.custo ? parseMoneyBR(formManutencao.custo) : null,
        retirada_necessaria: formManutencao.retirada_necessaria,
        responsavel_retirada: formManutencao.retirada_necessaria ? formManutencao.responsavel_retirada.trim() : null
      });
      success('Ativo enviado para manutenção.', 5000);
      fecharModalManutencao();
      carregar();
    } catch (err) {
      error(err?.response?.data?.erro || 'Erro ao enviar para manutenção.', 7000);
    }
  };

  const baixaDefinitiva = async (alocacao) => {
    const justificativa = await prompt({
      title: 'Baixa definitiva',
      message: 'Justificativa obrigatória para baixa definitiva:',
      placeholder: 'Descreva a justificativa',
      confirmText: 'Confirmar',
      cancelText: 'Cancelar'
    });
    if (!justificativa) return;

    try {
      await enviarFerramentaManutencao({
        alocacao_id: alocacao.id,
        quantidade: Number(alocacao.quantidade) - Number(alocacao.quantidade_devolvida || 0),
        enviar_para_manutencao: false,
        justificativa
      });
      success('Baixa definitiva registrada com sucesso.', 5000);
      carregar();
    } catch (err) {
      error(err?.response?.data?.erro || 'Erro ao dar baixa definitiva.', 7000);
    }
  };

  const registrarPerda = async (alocacao) => {
    const qtd = await prompt({
      title: 'Registrar perda',
      message: 'Quantidade perdida:',
      placeholder: 'Informe a quantidade',
      confirmText: 'Continuar',
      cancelText: 'Cancelar'
    });
    const justificativa = await prompt({
      title: 'Registrar perda',
      message: 'Justificativa da perda:',
      placeholder: 'Descreva a justificativa',
      confirmText: 'Confirmar',
      cancelText: 'Cancelar'
    });
    if (!qtd) return;

    try {
      await registrarPerdaFerramenta({
        alocacao_id: alocacao.id,
        quantidade: Number(qtd),
        justificativa: justificativa || null
      });
      success('Perda registrada com custo vinculado a obra.', 5000);
      carregar();
    } catch (err) {
      error(err?.response?.data?.erro || 'Erro ao registrar perda.', 7000);
    }
  };

  const transferir = async (alocacao) => {
    const destino = await prompt({
      title: 'Transferência entre obras',
      message: 'Informe o ID da obra de destino:',
      placeholder: 'ID da obra',
      confirmText: 'Transferir',
      cancelText: 'Cancelar'
    });
    if (!destino) return;

    try {
      await transferirFerramenta({
        alocacao_id: alocacao.id,
        obra_destino_id: Number(destino)
      });
      success('Ativo transferido entre obras sem baixa.', 5000);
      carregar();
    } catch (err) {
      error(err?.response?.data?.erro || 'Erro ao transferir ativo.', 7000);
    }
  };

  const retornarAoEstoque = async (alocacao) => {
    if (!alocacao?.manutencao_id) {
      error('Não foi possível localizar o registro de manutenção para esta alocação.', 7000);
      return;
    }
    try {
      await concluirManutencaoFerramenta(alocacao.manutencao_id, { retornar_estoque: true });
      success('Ativo retornado ao estoque com sucesso.', 5000);
      carregar();
    } catch (err) {
      error(err?.response?.data?.erro || 'Erro ao retornar ativo ao estoque.', 7000);
    }
  };

  const semConserto = async () => {
    if (!alocacaoSemConserto || !justificativaSemConserto.trim()) return;
    setEnviandoSemConserto(true);
    try {
      await concluirManutencaoFerramenta(alocacaoSemConserto.manutencao_id, {
        retornar_estoque: false,
        justificativa: justificativaSemConserto.trim()
      });
      success('Ativo registrado como sem conserto e descartado como perda.', 5000);
      setModalSemConserto(false);
      setAlocacaoSemConserto(null);
      setJustificativaSemConserto('');
      carregar();
    } catch (err) {
      error(err?.response?.data?.erro || 'Erro ao registrar sem conserto.', 7000);
    } finally {
      setEnviandoSemConserto(false);
    }
  };

  return (
    <AlmoxarifadoLayout title="Manutenção de ativos">
      <div className="card">
        <h2 className="card-header">Ativos alocados nesta obra</h2>
        <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Ativo</th>
                <th>Colaborador</th>
                <th>Status</th>
                <th>Qtd pendente</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {alocacoes.map((a) => {
                const pendente = Number(a.quantidade) - Number(a.quantidade_devolvida || 0);
                return (
                  <tr key={a.id}>
                    <td>{a.ferramenta_nome}</td>
                    <td>{a.colaborador_usuario_nome || a.colaborador_nome || '-'}</td>
                    <td>
                      <span className={a.status === 'EM_MANUTENCAO' ? 'badge badge-blue' : 'badge badge-green'}>
                        {a.status === 'EM_MANUTENCAO' ? 'Em manutenção' : 'Alocada'}
                      </span>
                      {a.status === 'EM_MANUTENCAO' && (a.local_manutencao || a.prazo_estimado_dias != null) && (
                        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                          {a.local_manutencao ? `Local: ${a.local_manutencao}` : ''}
                          {a.local_manutencao && a.prazo_estimado_dias != null ? ' · ' : ''}
                          {a.prazo_estimado_dias != null ? `Prazo: ${a.prazo_estimado_dias} dia(s)` : ''}
                        </div>
                      )}
                    </td>
                    <td>{pendente}</td>
                    <td>
                      <div className="flex" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {a.status === 'ALOCADA' && <button className="btn btn-soft-yellow" onClick={() => abrirModalManutencao(a)}>Enviar manutenção</button>}
                        {a.status === 'ALOCADA' && <button className="btn btn-soft-red" onClick={() => baixaDefinitiva(a)}>Baixa definitiva</button>}
                        {a.status === 'ALOCADA' && <button className="btn btn-secondary" onClick={() => registrarPerda(a)}>Registrar perda</button>}
                        {a.status === 'ALOCADA' && <button className="btn btn-primary" onClick={() => transferir(a)}>Transferir</button>}

                        {a.status === 'EM_MANUTENCAO' && (
                          <>
                            {/* Icone olho: ver detalhes */}
                            <button
                              className="btn btn-secondary"
                              title="Ver detalhes da manutenção"
                              style={{ padding: '6px 10px', lineHeight: 1 }}
                              onClick={() => { setAlocacaoVer(a); setModalVisualizarManutencao(true); }}
                            >
                              <Eye size={15} />
                            </button>

                            {/* Menu de ações */}
                            <div style={{ position: 'relative' }}>
                              <button
                                className="btn btn-secondary"
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px' }}
                                onClick={(e) => { e.stopPropagation(); setMenuAbertoId(menuAbertoId === a.id ? null : a.id); }}
                              >
                                <MoreHorizontal size={15} />
                                Ações
                              </button>
                              {menuAbertoId === a.id && (
                                <div
                                  style={{
                                    position: 'absolute', bottom: 'calc(100% + 4px)', right: 0,
                                    zIndex: 300, background: 'var(--card-bg)',
                                    border: '1px solid var(--border)', borderRadius: 8,
                                    boxShadow: '0 4px 20px rgba(0,0,0,.18)', minWidth: 220, overflow: 'hidden'
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    style={{
                                      display: 'block', width: '100%', textAlign: 'left',
                                      padding: '11px 16px', background: 'none', border: 'none',
                                      cursor: 'pointer', fontSize: 14, color: 'var(--success)',
                                      borderBottom: '1px solid var(--border)'
                                    }}
                                    onClick={() => { setMenuAbertoId(null); retornarAoEstoque(a); }}
                                  >
                                    Retornar ao estoque
                                  </button>
                                  <button
                                    style={{
                                      display: 'block', width: '100%', textAlign: 'left',
                                      padding: '11px 16px', background: 'none', border: 'none',
                                      cursor: 'pointer', fontSize: 14, color: 'var(--danger)'
                                    }}
                                    onClick={() => {
                                      setMenuAbertoId(null);
                                      setAlocacaoSemConserto(a);
                                      setJustificativaSemConserto('');
                                      setModalSemConserto(true);
                                    }}
                                  >
                                    Sem conserto (descartar)
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {alocacoes.length === 0 && (
                <tr><td colSpan={5}>Nenhuma alocação ativa.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 className="card-header">Obras disponíveis para transferência</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {projetos.map((p) => (
            <span key={p.id} className="badge badge-gray">#{p.id} {p.nome}</span>
          ))}
          {projetos.length === 0 && <span>Nenhuma outra obra disponível.</span>}
        </div>
      </div>

      {/* Modal: Sem conserto */}
      {modalSemConserto && alocacaoSemConserto && (
        <div className="modal-overlay" onClick={() => { if (!enviandoSemConserto) { setModalSemConserto(false); setAlocacaoSemConserto(null); } }}>
          <div className="modal-card" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="card-header" style={{ color: 'var(--danger)' }}>Sem conserto — descartar ativo</h2>
            <p style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              Ativo: <strong>{alocacaoSemConserto.ferramenta_nome}</strong>
            </p>
            <p style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)', background: 'var(--warning-light, #fff3cd)', padding: '10px 14px', borderRadius: 6 }}>
              O ativo será registrado como <strong>perda</strong> e removido do estoque. O motivo ficará no histórico.
            </p>
            <div className="form-group">
              <label className="form-label">
                Por que não foi possível realizar o conserto?
                <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>
              </label>
              <textarea
                className="form-input"
                rows={4}
                value={justificativaSemConserto}
                onChange={(e) => setJustificativaSemConserto(e.target.value)}
                placeholder="Ex: Peça de reposição indisponível, dano irreparável na estrutura..."
                autoFocus
                disabled={enviandoSemConserto}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setModalSemConserto(false); setAlocacaoSemConserto(null); }}
                disabled={enviandoSemConserto}
              >
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                onClick={semConserto}
                disabled={enviandoSemConserto || !justificativaSemConserto.trim()}
              >
                {enviandoSemConserto ? 'Registrando...' : 'Confirmar descarte'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ver detalhes (olhinho) */}
      {modalVisualizarManutencao && alocacaoVer && (
        <div className="modal-overlay" onClick={() => setModalVisualizarManutencao(false)}>
          <div className="modal-card" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="card-header">Detalhes da manutenção</h2>
            <p style={{ marginBottom: 14, color: 'var(--text-secondary)', fontSize: 13 }}>
              Ativo: <strong>{alocacaoVer.ferramenta_nome}</strong>
            </p>
            <div className="grid grid-2" style={{ gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>Local</div>
                <div style={{ fontWeight: 500 }}>{alocacaoVer.local_manutencao || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>Prazo estimado</div>
                <div style={{ fontWeight: 500 }}>{alocacaoVer.prazo_estimado_dias != null ? `${alocacaoVer.prazo_estimado_dias} dia(s)` : '-'}</div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>Endereço</div>
                <div style={{ fontWeight: 500 }}>{alocacaoVer.endereco_manutencao || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>Custo estimado</div>
                <div style={{ fontWeight: 500 }}>
                  {alocacaoVer.custo_manutencao != null
                    ? `R$ ${Number(alocacaoVer.custo_manutencao).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : '-'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>Retirada necessária</div>
                <div style={{ fontWeight: 500 }}>{alocacaoVer.retirada_necessaria ? 'Sim' : 'Não'}</div>
              </div>
              {alocacaoVer.retirada_necessaria ? (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>Responsável pela retirada</div>
                  <div style={{ fontWeight: 500 }}>{alocacaoVer.responsavel_retirada || '-'}</div>
                </div>
              ) : null}
              {alocacaoVer.manutencao_justificativa ? (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>Observação / motivo</div>
                  <div style={{ fontWeight: 500, whiteSpace: 'pre-wrap', background: 'var(--bg-secondary, #f8f9fa)', padding: '8px 12px', borderRadius: 6, marginTop: 2 }}>
                    {alocacaoVer.manutencao_justificativa}
                  </div>
                </div>
              ) : null}
            </div>
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setModalVisualizarManutencao(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Enviar para manutencao */}
      {modalManutencaoAberto && alocacaoSelecionada && (
        <div className="modal-overlay" onClick={fecharModalManutencao}>
          <div className="modal-card" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="card-header">Enviar ativo para manutenção</h2>
            <p style={{ marginBottom: 14, color: 'var(--text-secondary)', fontSize: 13 }}>
              Configure os dados da manutenção para {alocacaoSelecionada.ferramenta_nome}.
            </p>
            <form onSubmit={enviarManutencao}>
              <div className="grid grid-2" style={{ gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Onde será a manutenção</label>
                  <input
                    className="form-input"
                    value={formManutencao.local_manutencao}
                    onChange={(e) => setFormManutencao((prev) => ({ ...prev, local_manutencao: e.target.value }))}
                    placeholder="Ex: Oficina Tecnica Alfa"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Prazo estimado (dias)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    value={formManutencao.prazo_estimado_dias}
                    onChange={(e) => setFormManutencao((prev) => ({ ...prev, prazo_estimado_dias: e.target.value }))}
                    placeholder="Ex: 7"
                  />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Endereço</label>
                  <input
                    className="form-input"
                    value={formManutencao.endereco_manutencao}
                    onChange={(e) => setFormManutencao((prev) => ({ ...prev, endereco_manutencao: e.target.value }))}
                    placeholder="Rua, número, bairro, cidade"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Valor estimado (R$)</label>
                  <input
                    className="form-input"
                    value={formManutencao.custo}
                    onChange={(e) => setFormManutencao((prev) => ({ ...prev, custo: formatMoneyInputBR(e.target.value) }))}
                    placeholder="Opcional"
                  />
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={formManutencao.retirada_necessaria}
                      onChange={(e) => setFormManutencao((prev) => ({ ...prev, retirada_necessaria: e.target.checked }))}
                    />
                    Necessita retirada do ativo
                  </label>
                </div>
                {formManutencao.retirada_necessaria && (
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Quem vai retirar</label>
                    <input
                      className="form-input"
                      value={formManutencao.responsavel_retirada}
                      onChange={(e) => setFormManutencao((prev) => ({ ...prev, responsavel_retirada: e.target.value }))}
                      placeholder="Nome da pessoa/equipe responsável"
                    />
                  </div>
                )}
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Observação</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={formManutencao.justificativa}
                    onChange={(e) => setFormManutencao((prev) => ({ ...prev, justificativa: e.target.value }))}
                    placeholder="Detalhes da manutenção (opcional)"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="button" className="btn btn-secondary" onClick={fecharModalManutencao}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Enviar para manutenção</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AlmoxarifadoLayout>
  );
}

export default AlmoxManutencao;