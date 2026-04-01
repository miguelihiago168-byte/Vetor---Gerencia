import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import AlmoxarifadoLayout from '../components/AlmoxarifadoLayout';
import { enviarFerramentaManutencao, getAlocacoesAbertas, registrarDevolucaoFerramenta, registrarPerdaFerramenta } from '../services/api';
import { useNotification } from '../context/NotificationContext';

function AlmoxDevolucao() {
  const { projetoId } = useParams();
  const { success, error } = useNotification();
  const [alocacoes, setAlocacoes] = useState([]);
  const [showBaixaModal, setShowBaixaModal] = useState(false);
  const [alocacaoSelecionada, setAlocacaoSelecionada] = useState(null);
  const carregandoRef = useRef(false);
  const ultimoErroRef = useRef({ msg: '', at: 0 });
  const [baixaForm, setBaixaForm] = useState({
    acao: 'DEVOLVIDA',
    destinoDanificada: 'MANUTENCAO',
    quantidade: '',
    justificativa: ''
  });

  const carregar = async () => {
    if (!projetoId || carregandoRef.current) return;
    carregandoRef.current = true;
    try {
      const res = await getAlocacoesAbertas(projetoId);
      setAlocacoes(res.data || []);
    } catch (err) {
      setAlocacoes([]);
      const mensagem = err?.response?.data?.erro || 'Erro ao carregar alocações.';
      const now = Date.now();
      const repetido = ultimoErroRef.current.msg === mensagem && (now - ultimoErroRef.current.at) < 2500;
      if (!repetido) {
        error(mensagem, 7000);
        ultimoErroRef.current = { msg: mensagem, at: now };
      }
    } finally {
      carregandoRef.current = false;
    }
  };

  useEffect(() => {
    carregar();
  }, [projetoId]);

  const abrirModalBaixa = (alocacao) => {
    const pendente = Number(alocacao.quantidade) - Number(alocacao.quantidade_devolvida || 0);
    setAlocacaoSelecionada(alocacao);
    setBaixaForm({
      acao: 'DEVOLVIDA',
      destinoDanificada: 'MANUTENCAO',
      quantidade: String(pendente),
      justificativa: ''
    });
    setShowBaixaModal(true);
  };

  const fecharModalBaixa = () => {
    setShowBaixaModal(false);
    setAlocacaoSelecionada(null);
    setBaixaForm({ acao: 'DEVOLVIDA', destinoDanificada: 'MANUTENCAO', quantidade: '', justificativa: '' });
  };

  const confirmarBaixa = async () => {
    if (!alocacaoSelecionada) return;

    const pendente = Number(alocacaoSelecionada.quantidade) - Number(alocacaoSelecionada.quantidade_devolvida || 0);
    const quantidadeInt = Number(baixaForm.quantidade);

    if (!Number.isInteger(quantidadeInt) || quantidadeInt <= 0 || quantidadeInt > pendente) {
      error(`Quantidade inválida. Informe um valor entre 1 e ${pendente}.`, 6000);
      return;
    }

    if (baixaForm.acao === 'DANIFICADA' && baixaForm.destinoDanificada === 'BAIXA_DEFINITIVA' && !String(baixaForm.justificativa || '').trim()) {
      error('Justificativa obrigatória para baixa definitiva de ativo danificado.', 6000);
      return;
    }

    try {
      if (baixaForm.acao === 'DEVOLVIDA') {
        await registrarDevolucaoFerramenta(alocacaoSelecionada.id, {
          quantidade: quantidadeInt,
          observacao: baixaForm.justificativa || null
        });
        success('Baixa registrada como devolvida com sucesso.', 5000);
      } else if (baixaForm.acao === 'PERDIDA') {
        await registrarPerdaFerramenta({
          alocacao_id: alocacaoSelecionada.id,
          quantidade: quantidadeInt,
          justificativa: baixaForm.justificativa || null
        });
        success('Baixa registrada como perdida com sucesso.', 5000);
      } else {
        await enviarFerramentaManutencao({
          alocacao_id: alocacaoSelecionada.id,
          quantidade: quantidadeInt,
          enviar_para_manutencao: baixaForm.destinoDanificada === 'MANUTENCAO',
          justificativa: baixaForm.justificativa || null
        });
        success(
          baixaForm.destinoDanificada === 'MANUTENCAO'
            ? 'Ativo danificado enviado para manutenção.'
            : 'Ativo danificado baixado definitivamente.',
          5000
        );
      }

      fecharModalBaixa();
      carregar();
    } catch (err) {
      error(err?.response?.data?.erro || 'Erro ao registrar baixa do ativo.', 7000);
    }
  };

  return (
    <AlmoxarifadoLayout title="Devolução">
        <div className="card">
          <h2 className="card-header">Alocações abertas</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Ativo</th>
                  <th>Colaborador</th>
                  <th>Status</th>
                  <th>Previsão</th>
                  <th>Pendente</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {alocacoes.map((a) => {
                  const pendente = Number(a.quantidade) - Number(a.quantidade_devolvida || 0);
                  return (
                    <tr key={a.id}>
                      <td>{a.ferramenta_nome}</td>
                      <td>{a.colaborador_usuario_nome || a.colaborador_nome || '-'}</td>
                      <td>{a.status === 'EM_MANUTENCAO' ? <span className="badge badge-blue">Em manutenção</span> : <span className="badge badge-green">Alocada</span>}</td>
                      <td>{a.previsao_devolucao ? new Date(a.previsao_devolucao).toLocaleDateString('pt-BR') : '-'}</td>
                      <td>{pendente}</td>
                      <td>
                        {a.status === 'ALOCADA' ? (
                          <button className="btn btn-warning" onClick={() => abrirModalBaixa(a)}>Dar baixa</button>
                        ) : (
                          <span className="badge badge-gray">Indisponível</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {alocacoes.length === 0 && (
                  <tr><td colSpan={6}>Nenhuma alocação ativa para devolução.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showBaixaModal && (
          <div className="modal-overlay fade-in" role="dialog" aria-modal="true" onClick={fecharModalBaixa}>
            <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>Baixa de ativo</h3>
              <p style={{ marginTop: 0, color: 'var(--gray-600)' }}>
                Selecione a ação para o ativo <strong>{alocacaoSelecionada?.ferramenta_nome}</strong>.
              </p>

              <div className="grid" style={{ gap: 12 }}>
                <div>
                  <label className="form-label">Ação</label>
                  <select className="form-select" value={baixaForm.acao} onChange={(e) => setBaixaForm({ ...baixaForm, acao: e.target.value })}>
                    <option value="DEVOLVIDA">Devolvida</option>
                    <option value="PERDIDA">Perdida</option>
                    <option value="DANIFICADA">Danificada</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Quantidade</label>
                  <input
                    className="form-input"
                    type="number"
                    min="1"
                    max={Math.max(1, Number(alocacaoSelecionada?.quantidade || 0) - Number(alocacaoSelecionada?.quantidade_devolvida || 0))}
                    value={baixaForm.quantidade}
                    onChange={(e) => setBaixaForm({ ...baixaForm, quantidade: e.target.value })}
                  />
                </div>

                {baixaForm.acao === 'DANIFICADA' && (
                  <div>
                    <label className="form-label">Destino do ativo danificado</label>
                    <select className="form-select" value={baixaForm.destinoDanificada} onChange={(e) => setBaixaForm({ ...baixaForm, destinoDanificada: e.target.value })}>
                      <option value="MANUTENCAO">Enviar para manutenção</option>
                      <option value="BAIXA_DEFINITIVA">Baixa definitiva</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="form-label">
                    Justificativa {baixaForm.acao === 'DANIFICADA' && baixaForm.destinoDanificada === 'BAIXA_DEFINITIVA' ? '(obrigatória)' : '(opcional)'}
                  </label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={baixaForm.justificativa}
                    onChange={(e) => setBaixaForm({ ...baixaForm, justificativa: e.target.value })}
                    placeholder="Descreva o motivo da baixa"
                  />
                </div>
              </div>

              <div className="dialog-actions" style={{ marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={fecharModalBaixa}>Cancelar</button>
                <button className="btn btn-primary" onClick={confirmarBaixa}>Confirmar baixa</button>
              </div>
            </div>
          </div>
        )}
    </AlmoxarifadoLayout>
  );
}

export default AlmoxDevolucao;
