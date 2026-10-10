import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AlmoxarifadoLayout from '../components/AlmoxarifadoLayout';
import { AssetsPanel, AssetsState, AssetsSearch, AssetsStatus, AssetsTable, AssetsModal } from '../components/AlmoxarifadoUI';
import { concluirManutencaoFerramenta, enviarFerramentaManutencao, getAlocacoesAbertas, registrarPerdaFerramenta, transferirFerramenta, getProjetos } from '../services/api';
import { useDialog } from '../context/DialogContext';
import { useNotification } from '../context/NotificationContext';
import { formatMoneyInputBR, parseMoneyBR, formatMoneyBR } from '../utils/currency';
import { Eye, MoreHorizontal, Wrench, ShieldAlert } from 'lucide-react';

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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
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
    setLoading(true);
    setLoadError('');
    try {
      const [aRes, pRes] = await Promise.all([getAlocacoesAbertas(projetoId), getProjetos()]);
      setAlocacoes(aRes.data || []);
      setProjetos((pRes.data || []).filter((p) => Number(p.id) !== Number(projetoId)));
    } catch (err) {
      setLoadError(err?.response?.data?.erro || 'Erro ao carregar dados de manutenção.');
    } finally {
      setLoading(false);
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

  const filtradas = alocacoes.filter((a) => (
    `${a.ferramenta_nome || ''} ${a.colaborador_usuario_nome || a.colaborador_nome || ''} ${a.local_manutencao || ''}`.toLocaleLowerCase('pt-BR').includes(busca.trim().toLocaleLowerCase('pt-BR'))
    && (filtroStatus === 'todos' || a.status === filtroStatus)
  ));
  const columns = [
    { key: 'ativo', label: 'Ativo', render: (a) => <strong className="assets-item-name">{a.ferramenta_nome}</strong> },
    { key: 'colaborador', label: 'Colaborador', render: (a) => a.colaborador_usuario_nome || a.colaborador_nome || 'Não informado' },
    { key: 'status', label: 'Situação', render: (a) => <div><AssetsStatus tone={a.status === 'EM_MANUTENCAO' ? 'blue' : 'green'}>{a.status === 'EM_MANUTENCAO' ? 'Em manutenção' : 'Alocado'}</AssetsStatus>
      {a.status === 'EM_MANUTENCAO' && <><span className="assets-record-meta">{a.local_manutencao || 'Local não informado'}</span>{a.prazo_estimado_dias != null && <span className="assets-detail">Prazo: {a.prazo_estimado_dias} dia(s)</span>}</>}
    </div> },
    { key: 'quantidade', label: 'Qtd. pendente', className: 'assets-number', render: (a) => Number(a.quantidade) - Number(a.quantidade_devolvida || 0) },
    { key: 'acoes', label: 'Ações', render: (a) => <div className="assets-row-actions">
      {a.status === 'ALOCADA' && <button className="btn btn-secondary btn-sm" onClick={() => abrirModalManutencao(a)}><Wrench size={14} aria-hidden="true" />Enviar manutenção</button>}
      {a.status === 'EM_MANUTENCAO' && <button className="btn btn-secondary btn-sm" onClick={() => { setAlocacaoVer(a); setModalVisualizarManutencao(true); }}><Eye size={14} aria-hidden="true" />Ver detalhes</button>}
      {['ALOCADA', 'EM_MANUTENCAO'].includes(a.status) && <>
        <button className="btn btn-ghost btn-sm" aria-expanded={menuAbertoId === a.id} aria-controls={`ativo-acoes-${a.id}`} onClick={(e) => { e.stopPropagation(); setMenuAbertoId(menuAbertoId === a.id ? null : a.id); }}><MoreHorizontal size={15} aria-hidden="true" />Mais ações</button>
        {menuAbertoId === a.id && <div id={`ativo-acoes-${a.id}`} className="assets-action-options" onClick={(e) => e.stopPropagation()}>
          {a.status === 'ALOCADA' ? <>
            <button className="btn btn-secondary btn-sm" onClick={() => { setMenuAbertoId(null); transferir(a); }}>Transferir</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setMenuAbertoId(null); registrarPerda(a); }}>Registrar perda</button>
            <button className="btn btn-soft-red btn-sm" onClick={() => { setMenuAbertoId(null); baixaDefinitiva(a); }}>Baixa definitiva</button>
          </> : <>
            <button className="btn btn-soft-green btn-sm" onClick={() => { setMenuAbertoId(null); retornarAoEstoque(a); }}>Retornar ao estoque</button>
            <button className="btn btn-soft-red btn-sm" onClick={() => { setMenuAbertoId(null); setAlocacaoSemConserto(a); setJustificativaSemConserto(''); setModalSemConserto(true); }}>Sem conserto</button>
          </>}
        </div>}
      </>}
    </div> }
  ];

  return (
    <AlmoxarifadoLayout title="Manutenção" description="Acompanhe reparos, prazos e a liberação dos ativos para uso.">
      <AssetsPanel title="Acompanhamento dos ativos" description="Consulte a situação de cada alocação e gerencie as ações necessárias." count={!loading && !loadError ? alocacoes.length : null}
        footer={!loading && !loadError ? `${filtradas.length} de ${alocacoes.length} alocações` : null}>
        <AssetsSearch value={busca} onChange={setBusca} placeholder="Buscar ativo, colaborador ou oficina">
          <select className="form-select assets-status-filter" aria-label="Filtrar situação" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}><option value="todos">Todas as situações</option><option value="ALOCADA">Alocado</option><option value="EM_MANUTENCAO">Em manutenção</option></select>
        </AssetsSearch>
        {loading || loadError ? <AssetsState loading={loading} error={loadError} onRetry={carregar} /> : filtradas.length ? <AssetsTable label="Ativos em acompanhamento" columns={columns} rows={filtradas} /> :
          <AssetsState title={alocacoes.length ? 'Nenhum ativo encontrado' : 'Nenhuma alocação ativa'} description={alocacoes.length ? 'Ajuste a busca ou a situação para encontrar o ativo.' : 'Os ativos alocados e em manutenção aparecerão aqui.'}>
            {(busca || filtroStatus !== 'todos') && <button className="btn btn-secondary" onClick={() => { setBusca(''); setFiltroStatus('todos'); }}>Limpar filtros</button>}
          </AssetsState>}
      </AssetsPanel>
      {!loading && !loadError && <AssetsPanel title="Obras disponíveis para transferência" description="Use o identificador da obra ao realizar uma transferência.">
        <div className="assets-body">{projetos.length ? <ul className="assets-project-list">{projetos.map((p) => <li key={p.id}><strong>#{p.id}</strong>{p.nome}</li>)}</ul> : <p className="assets-section-hint">Nenhuma outra obra disponível.</p>}</div>
      </AssetsPanel>}

      {modalSemConserto && alocacaoSemConserto && <AssetsModal title="Descartar ativo sem conserto" description={alocacaoSemConserto.ferramenta_nome}
        closeDisabled={enviandoSemConserto} onClose={() => { setModalSemConserto(false); setAlocacaoSemConserto(null); }}>
        <div className="assets-notice assets-notice-warning"><ShieldAlert size={18} aria-hidden="true" /><span>O ativo será registrado como perda e removido do estoque. O motivo ficará no histórico.</span></div>
        <form onSubmit={(e) => { e.preventDefault(); semConserto(); }}>
          <label className="assets-field">Motivo do descarte *
            <textarea className="form-textarea" rows={4} required value={justificativaSemConserto} onChange={(e) => setJustificativaSemConserto(e.target.value)}
              placeholder="Descreva por que o conserto não é possível" disabled={enviandoSemConserto} />
          </label>
          <div className="assets-form-actions">
            <button className="btn btn-secondary" type="button" disabled={enviandoSemConserto} onClick={() => { setModalSemConserto(false); setAlocacaoSemConserto(null); }}>Cancelar</button>
            <button className="btn btn-danger" type="submit" disabled={enviandoSemConserto || !justificativaSemConserto.trim()}>{enviandoSemConserto ? 'Registrando…' : 'Confirmar descarte'}</button>
          </div>
        </form>
      </AssetsModal>}

      {modalVisualizarManutencao && alocacaoVer && <AssetsModal title="Detalhes da manutenção" description={alocacaoVer.ferramenta_nome} onClose={() => setModalVisualizarManutencao(false)}>
        <dl className="assets-description-list">
          <div><dt>Local</dt><dd>{alocacaoVer.local_manutencao || 'Não informado'}</dd></div>
          <div><dt>Prazo estimado</dt><dd>{alocacaoVer.prazo_estimado_dias != null ? `${alocacaoVer.prazo_estimado_dias} dia(s)` : 'Não informado'}</dd></div>
          <div className="assets-field-wide"><dt>Endereço</dt><dd>{alocacaoVer.endereco_manutencao || 'Não informado'}</dd></div>
          <div><dt>Custo estimado</dt><dd>{alocacaoVer.custo_manutencao != null ? `R$ ${formatMoneyBR(alocacaoVer.custo_manutencao)}` : 'Não informado'}</dd></div>
          <div><dt>Retirada necessária</dt><dd>{alocacaoVer.retirada_necessaria ? 'Sim' : 'Não'}</dd></div>
          {alocacaoVer.retirada_necessaria ? <div className="assets-field-wide"><dt>Responsável pela retirada</dt><dd>{alocacaoVer.responsavel_retirada || 'Não informado'}</dd></div> : null}
          <div className="assets-field-wide"><dt>Observação / motivo</dt><dd>{alocacaoVer.manutencao_justificativa || 'Nenhuma observação.'}</dd></div>
        </dl>
        <div className="assets-form-actions"><button className="btn btn-secondary" onClick={() => setModalVisualizarManutencao(false)}>Fechar</button></div>
      </AssetsModal>}

      {modalManutencaoAberto && alocacaoSelecionada && <AssetsModal title="Enviar ativo para manutenção" description={alocacaoSelecionada.ferramenta_nome} onClose={fecharModalManutencao}>
        <form onSubmit={enviarManutencao}>
          <fieldset className="assets-form-section">
            <legend>Serviço e prazo</legend>
            <div className="assets-form-grid assets-form-grid-two">
              <label className="assets-field">Local da manutenção *<input className="form-input" required value={formManutencao.local_manutencao} onChange={(e) => setFormManutencao((prev) => ({ ...prev, local_manutencao: e.target.value }))} placeholder="Ex.: Oficina Técnica Alfa" /></label>
              <label className="assets-field">Prazo estimado (dias) *<input className="form-input" type="number" min="0" required value={formManutencao.prazo_estimado_dias} onChange={(e) => setFormManutencao((prev) => ({ ...prev, prazo_estimado_dias: e.target.value }))} placeholder="Ex.: 7" /></label>
              <label className="assets-field assets-field-wide">Endereço *<input className="form-input" required value={formManutencao.endereco_manutencao} onChange={(e) => setFormManutencao((prev) => ({ ...prev, endereco_manutencao: e.target.value }))} placeholder="Rua, número, bairro e cidade" /></label>
              <label className="assets-field">Valor estimado (R$)<input className="form-input" inputMode="numeric" value={formManutencao.custo} onChange={(e) => setFormManutencao((prev) => ({ ...prev, custo: formatMoneyInputBR(e.target.value) }))} placeholder="0,00 (opcional)" /></label>
            </div>
          </fieldset>
          <fieldset className="assets-form-section">
            <legend>Retirada e observações</legend>
            <div className="assets-form-grid assets-form-grid-two">
              <label className="assets-checkbox assets-field-wide"><input type="checkbox" checked={formManutencao.retirada_necessaria} onChange={(e) => setFormManutencao((prev) => ({ ...prev, retirada_necessaria: e.target.checked }))} />Necessita retirada do ativo</label>
              {formManutencao.retirada_necessaria && <label className="assets-field assets-field-wide">Responsável pela retirada *<input className="form-input" required value={formManutencao.responsavel_retirada} onChange={(e) => setFormManutencao((prev) => ({ ...prev, responsavel_retirada: e.target.value }))} placeholder="Nome da pessoa ou equipe" /></label>}
              <label className="assets-field assets-field-wide">Observação<textarea className="form-textarea" rows={3} value={formManutencao.justificativa} onChange={(e) => setFormManutencao((prev) => ({ ...prev, justificativa: e.target.value }))} placeholder="Detalhes ou motivo da manutenção (opcional)" /></label>
            </div>
          </fieldset>
          <div className="assets-form-actions"><button type="button" className="btn btn-secondary" onClick={fecharModalManutencao}>Cancelar</button><button type="submit" className="btn btn-primary"><Wrench size={15} aria-hidden="true" />Enviar para manutenção</button></div>
        </form>
      </AssetsModal>}
    </AlmoxarifadoLayout>
  );
}

export default AlmoxManutencao;
