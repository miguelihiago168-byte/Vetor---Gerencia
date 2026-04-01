import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AlmoxarifadoLayout from '../components/AlmoxarifadoLayout';
import { concluirManutencaoFerramenta, enviarFerramentaManutencao, getAlocacoesAbertas, registrarPerdaFerramenta, transferirFerramenta, getProjetos } from '../services/api';
import { useDialog } from '../context/DialogContext';
import { useNotification } from '../context/NotificationContext';
import { formatMoneyInputBR, parseMoneyBR } from '../utils/currency';

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
      success('Perda registrada com custo vinculado à obra.', 5000);
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
      await concluirManutencaoFerramenta(alocacao.manutencao_id, {
        retornar_estoque: true
      });
      success('Ativo retornado ao estoque com sucesso.', 5000);
      carregar();
    } catch (err) {
      error(err?.response?.data?.erro || 'Erro ao retornar ativo ao estoque.', 7000);
    }
  };

  return (
    <AlmoxarifadoLayout title="Manutenção de ativos">
      <div className="card">
        <h2 className="card-header">Ativos alocados nesta obra</h2>
        <div style={{ overflowX: 'auto' }}>
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
                      <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
                        {a.status === 'ALOCADA' && <button className="btn btn-soft-yellow" onClick={() => abrirModalManutencao(a)}>Enviar manutenção</button>}
                        {a.status === 'ALOCADA' && <button className="btn btn-soft-red" onClick={() => baixaDefinitiva(a)}>Baixa definitiva</button>}
                        {a.status === 'ALOCADA' && <button className="btn btn-secondary" onClick={() => registrarPerda(a)}>Registrar perda</button>}
                        {a.status === 'ALOCADA' && <button className="btn btn-primary" onClick={() => transferir(a)}>Transferir</button>}
                        {a.status === 'EM_MANUTENCAO' && <button className="btn btn-success" onClick={() => retornarAoEstoque(a)}>Retornar ao estoque</button>}
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
                    placeholder="Ex: Oficina Técnica Alfa"
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
