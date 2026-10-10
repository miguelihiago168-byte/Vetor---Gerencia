import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import AlmoxarifadoLayout from '../components/AlmoxarifadoLayout';
import { AssetsPanel, AssetsState, AssetsSearch, AssetsStatus, AssetsTable, AssetsModal } from '../components/AlmoxarifadoUI';
import { ArrowDownLeft, Info } from 'lucide-react';
import { enviarFerramentaManutencao, getAlocacoesAbertas, registrarDevolucaoFerramenta, registrarPerdaFerramenta } from '../services/api';
import { useNotification } from '../context/NotificationContext';

function AlmoxDevolucao() {
  const { projetoId } = useParams();
  const { success, error } = useNotification();
  const [alocacoes, setAlocacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busca, setBusca] = useState('');
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
    setLoading(true);
    setLoadError('');
    try {
      const res = await getAlocacoesAbertas(projetoId);
      setAlocacoes(res.data || []);
    } catch (err) {
      setAlocacoes([]);
      const mensagem = err?.response?.data?.erro || 'Erro ao carregar alocações.';
      setLoadError(mensagem);
      const now = Date.now();
      const repetido = ultimoErroRef.current.msg === mensagem && (now - ultimoErroRef.current.at) < 2500;
      if (!repetido) {
        error(mensagem, 7000);
        ultimoErroRef.current = { msg: mensagem, at: now };
      }
    } finally {
      carregandoRef.current = false;
      setLoading(false);
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

  const filtradas = alocacoes.filter((a) => `${a.ferramenta_nome || ''} ${a.colaborador_usuario_nome || a.colaborador_nome || ''}`.toLocaleLowerCase('pt-BR').includes(busca.trim().toLocaleLowerCase('pt-BR')));
  const columns = [
    { key: 'ativo', label: 'Ativo', render: (a) => <strong className="assets-item-name">{a.ferramenta_nome}</strong> },
    { key: 'colaborador', label: 'Colaborador', render: (a) => a.colaborador_usuario_nome || a.colaborador_nome || 'Não informado' },
    { key: 'status', label: 'Status', render: (a) => <AssetsStatus tone={a.status === 'EM_MANUTENCAO' ? 'blue' : 'green'}>{a.status === 'EM_MANUTENCAO' ? 'Em manutenção' : 'Alocado'}</AssetsStatus> },
    { key: 'previsao', label: 'Devolução prevista', render: (a) => a.previsao_devolucao ? new Date(a.previsao_devolucao).toLocaleDateString('pt-BR') : 'Sem previsão' },
    { key: 'quantidade', label: 'Qtd. pendente', className: 'assets-number', render: (a) => Number(a.quantidade) - Number(a.quantidade_devolvida || 0) },
    { key: 'acao', label: 'Ação', render: (a) => a.status === 'ALOCADA' ? <button className="btn btn-secondary btn-sm" onClick={() => abrirModalBaixa(a)}><ArrowDownLeft size={14} aria-hidden="true" />Dar baixa</button> : <span className="assets-detail">Aguardando manutenção</span> }
  ];

  return (
    <AlmoxarifadoLayout title="Devolução" description="Confira as alocações abertas e registre o retorno ou a baixa dos ativos.">
      <AssetsPanel title="Alocações abertas" description="Selecione um ativo para informar a quantidade e a condição de devolução." count={!loading && !loadError ? alocacoes.length : null}
        footer={!loading && !loadError ? `${filtradas.length} de ${alocacoes.length} alocações` : null}>
        <AssetsSearch value={busca} onChange={setBusca} />
        {loading || loadError ? <AssetsState loading={loading} error={loadError} onRetry={carregar} /> : filtradas.length ? <AssetsTable label="Alocações para devolução" columns={columns} rows={filtradas} /> :
          <AssetsState title={alocacoes.length ? 'Nenhuma alocação encontrada' : 'Nenhuma devolução pendente'} description={alocacoes.length ? 'Tente outro ativo ou colaborador.' : 'As retiradas em aberto aparecerão aqui para acompanhamento.'}>
            {busca && <button className="btn btn-secondary" onClick={() => setBusca('')}>Limpar busca</button>}
          </AssetsState>}
      </AssetsPanel>

      {showBaixaModal && <AssetsModal title="Baixa de ativo" description={alocacaoSelecionada?.ferramenta_nome} onClose={fecharModalBaixa}>
        <form onSubmit={(e) => { e.preventDefault(); confirmarBaixa(); }}>
          <div className="assets-notice"><Info size={17} aria-hidden="true" /><span>Quantidade pendente: <strong>{Number(alocacaoSelecionada?.quantidade || 0) - Number(alocacaoSelecionada?.quantidade_devolvida || 0)}</strong>. Você pode registrar uma devolução parcial.</span></div>
          <div className="assets-form-grid assets-form-grid-two">
            <label className="assets-field">Ação
              <select className="form-select" value={baixaForm.acao} onChange={(e) => setBaixaForm({ ...baixaForm, acao: e.target.value })}>
                <option value="DEVOLVIDA">Devolvida</option><option value="PERDIDA">Perdida</option><option value="DANIFICADA">Danificada</option>
              </select>
            </label>
            <label className="assets-field">Quantidade *
              <input className="form-input" type="number" min="1" required max={Math.max(1, Number(alocacaoSelecionada?.quantidade || 0) - Number(alocacaoSelecionada?.quantidade_devolvida || 0))}
                value={baixaForm.quantidade} onChange={(e) => setBaixaForm({ ...baixaForm, quantidade: e.target.value })} />
            </label>
            {baixaForm.acao === 'DANIFICADA' && <label className="assets-field assets-field-wide">Destino do ativo danificado
              <select className="form-select" value={baixaForm.destinoDanificada} onChange={(e) => setBaixaForm({ ...baixaForm, destinoDanificada: e.target.value })}>
                <option value="MANUTENCAO">Enviar para manutenção</option><option value="BAIXA_DEFINITIVA">Baixa definitiva</option>
              </select>
            </label>}
            <label className="assets-field assets-field-wide">Justificativa {baixaForm.acao === 'DANIFICADA' && baixaForm.destinoDanificada === 'BAIXA_DEFINITIVA' ? '*' : '(opcional)'}
              <textarea className="form-textarea" rows={3} required={baixaForm.acao === 'DANIFICADA' && baixaForm.destinoDanificada === 'BAIXA_DEFINITIVA'} value={baixaForm.justificativa}
                onChange={(e) => setBaixaForm({ ...baixaForm, justificativa: e.target.value })} placeholder="Descreva a condição ou o motivo da baixa" />
            </label>
          </div>
          <div className="assets-form-actions"><button className="btn btn-secondary" type="button" onClick={fecharModalBaixa}>Cancelar</button><button className="btn btn-primary" type="submit">Confirmar baixa</button></div>
        </form>
      </AssetsModal>}
    </AlmoxarifadoLayout>
  );
}

export default AlmoxDevolucao;
