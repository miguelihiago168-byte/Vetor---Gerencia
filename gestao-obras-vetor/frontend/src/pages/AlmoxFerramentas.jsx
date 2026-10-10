import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, ArrowLeft, Search, Package, ArrowRightLeft, Save, AlertCircle } from 'lucide-react';
import AlmoxarifadoLayout from '../components/AlmoxarifadoLayout';
import { createFerramenta, getFerramentas, getProjetos, getProximoCodigoAtivo, transferirAtivoObra } from '../services/api';
import { useDialog } from '../context/DialogContext';
import { useNotification } from '../context/NotificationContext';
import { formatMoneyBR, parseMoneyBR, formatMoneyInputBR } from '../utils/currency';

const CATEGORIAS_ATIVO = ['Ferramenta', 'Equipamento', 'Máquina', 'Veículo', 'EPI', 'Eletrônico', 'Outros'];
const formatBRL = formatMoneyBR;

function AlmoxFerramentas() {
  const { projetoId } = useParams();
  const { confirm } = useDialog();
  const { success, error } = useNotification();
  const [aba, setAba] = useState('lista');
  const [ferramentas, setFerramentas] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [destinosTransferencia, setDestinosTransferencia] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [filtroAtivos, setFiltroAtivos] = useState('');
  const [form, setForm] = useState({ codigo: '', nome: '', categoria: 'Outros', nf_compra: '', marca: '', modelo: '', descricao: '', unidade: 'UN', quantidade_total: '', valor_reposicao: '', numero_serie: '', faixa_minima: '', faixa_maxima: '', certificado_calibracao: '', calibracao_valida_ate: '' });
  const [proximoCodigo, setProximoCodigo] = useState('');
  const [primeiroCodigo, setPrimeiroCodigo] = useState(false);

  const ferramentasFiltradas = useMemo(() => {
    const termo = filtroAtivos.trim().toLowerCase();
    if (!termo) return ferramentas;

    return ferramentas.filter((ferramenta) => {
      const camposBusca = [
        ferramenta.codigo,
        ferramenta.nome,
        ferramenta.categoria,
        ferramenta.nf_compra,
        ferramenta.marca,
        ferramenta.modelo,
        ferramenta.descricao
      ];

      return camposBusca.some((campo) => String(campo || '').toLowerCase().includes(termo));
    });
  }, [ferramentas, filtroAtivos]);

  const carregar = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const [resFerramentas, resCodigo] = await Promise.all([
        getFerramentas({ projeto_id: projetoId }),
        getProximoCodigoAtivo(projetoId)
      ]);
      setFerramentas(resFerramentas.data || []);
      const { codigo, primeiro } = resCodigo.data;
      setProximoCodigo(codigo || '');
      setPrimeiroCodigo(!!primeiro);
      if (!primeiro && codigo) {
        setForm((prev) => ({ ...prev, codigo }));
      } else {
        setForm((prev) => ({ ...prev, codigo: '' }));
      }
    } catch (err) {
      setLoadError(err?.response?.data?.erro || 'Não foi possível carregar o inventário.');
      error(err?.response?.data?.erro || 'Erro ao carregar ativos.', 7000);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
  }, [projetoId]);

  useEffect(() => {
    const carregarProjetos = async () => {
      try {
        const res = await getProjetos();
        setProjetos(res.data || []);
      } catch {}
    };
    carregarProjetos();
  }, []);

  const salvar = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await createFerramenta({
        ...form,
        projeto_id: Number(projetoId),
        quantidade_total: Number(form.quantidade_total),
        valor_reposicao: parseMoneyBR(form.valor_reposicao)
      });
      setForm({ codigo: '', nome: '', categoria: 'Outros', nf_compra: '', marca: '', modelo: '', descricao: '', unidade: 'UN', quantidade_total: '', valor_reposicao: '', numero_serie: '', faixa_minima: '', faixa_maxima: '', certificado_calibracao: '', calibracao_valida_ate: '' });
      success('Ativo cadastrado com sucesso.', 5000);
      await carregar();
      setAba('lista');
    } catch (err) {
      error(err?.response?.data?.erro || 'Erro ao cadastrar ativo.', 7000);
    } finally {
      setSaving(false);
    }
  };

  const transferir = async (ferramenta) => {
    const destinoId = Number(destinosTransferencia[ferramenta.id] || 0);
    if (!destinoId) {
      error('Selecione a obra de destino para transferir o ativo.', 6000);
      return;
    }

    const ok = await confirm({
      title: 'Transferir ativo',
      message: `Deseja transferir o ativo "${ferramenta.nome}" para outra obra?`,
      confirmText: 'Transferir',
      cancelText: 'Cancelar'
    });
    if (!ok) return;

    try {
      await transferirAtivoObra(ferramenta.id, { obra_destino_id: destinoId });
      success('Ativo transferido com sucesso.', 5000);
      setDestinosTransferencia((prev) => ({ ...prev, [ferramenta.id]: '' }));
      await carregar();
    } catch (err) {
      error(err?.response?.data?.erro || 'Erro ao transferir ativo.', 7000);
    }
  };

  const obrasDestino = (projetos || []).filter((p) => Number(p.id) !== Number(projetoId));

  return (
    <AlmoxarifadoLayout title={aba === 'novo' ? 'Novo ativo' : 'Cadastro de ativos'}
      description={aba === 'novo' ? 'Organize as informações de identificação, estoque e calibração.' : 'Consulte o inventário e acompanhe a disponibilidade dos ativos.'}
      extraHeader={<button type="button" className={`btn ${aba === 'novo' ? 'btn-secondary' : 'btn-primary'}`} disabled={saving || (aba === 'lista' && (loading || !!loadError))} onClick={() => setAba(aba === 'novo' ? 'lista' : 'novo')}>
        {aba === 'novo' ? <><ArrowLeft size={16} aria-hidden="true" />Voltar à lista</> : <><Plus size={16} aria-hidden="true" />Novo ativo</>}
      </button>}
    >
      {aba === 'novo' && (
        <section className="card assets-panel" aria-labelledby="assets-form-title">
          <div className="assets-panel-heading"><div><h2 id="assets-form-title">Informações do ativo</h2><p>Os campos marcados com * são obrigatórios.</p></div></div>
          <form onSubmit={salvar} className="assets-form">
            <fieldset className="assets-form-section" disabled={saving}>
              <legend>Identificação</legend>
              <div className="assets-form-grid">
                <label className="assets-field">Código do ativo {primeiroCodigo && '*'}
                  {primeiroCodigo ? <input className="form-input" placeholder="Ex.: VTR-0001" required value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })} />
                    : <input className="form-input" value={proximoCodigo || 'Calculando código…'} readOnly />}
                  <small>{primeiroCodigo ? 'Este código define o padrão de numeração da obra.' : 'Gerado automaticamente para esta obra.'}</small>
                </label>
                <label className="assets-field">Nome *
                  <input className="form-input" placeholder="Ex.: Furadeira de impacto" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                </label>
                <label className="assets-field">Categoria
                  <select className="form-select" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                    {CATEGORIAS_ATIVO.map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}
                  </select>
                </label>
                <label className="assets-field">Marca<input className="form-input" placeholder="Marca do fabricante" value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} /></label>
                <label className="assets-field">Modelo<input className="form-input" placeholder="Modelo do ativo" value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} /></label>
                <label className="assets-field">Número de série<input className="form-input" placeholder="Número de série do instrumento" value={form.numero_serie} onChange={(e) => setForm({ ...form, numero_serie: e.target.value })} /></label>
                <label className="assets-field assets-field-wide">Descrição<textarea className="form-textarea" rows={2} placeholder="Características ou observações do ativo" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></label>
              </div>
            </fieldset>
            <fieldset className="assets-form-section" disabled={saving}>
              <legend>Estoque e aquisição</legend>
              <div className="assets-form-grid">
                <label className="assets-field">Quantidade total *<input className="form-input" type="number" min="0" required placeholder="0" value={form.quantidade_total} onChange={(e) => setForm({ ...form, quantidade_total: e.target.value })} /></label>
                <label className="assets-field">Unidade<input className="form-input" placeholder="Ex.: UN" value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} /></label>
                <label className="assets-field">Valor de reposição (R$) *<input className="form-input" type="text" inputMode="numeric" required placeholder="0,00" value={form.valor_reposicao} onChange={(e) => setForm({ ...form, valor_reposicao: formatMoneyInputBR(e.target.value) })} /></label>
                <label className="assets-field">Nota fiscal de compra *<input className="form-input" required placeholder="Número da nota fiscal" value={form.nf_compra} onChange={(e) => setForm({ ...form, nf_compra: e.target.value })} /></label>
              </div>
            </fieldset>
            <fieldset className="assets-form-section" disabled={saving}>
              <legend>Calibração <span className="assets-optional">· quando aplicável</span></legend>
              <div className="assets-form-grid">
                <label className="assets-field">Faixa mínima<input className="form-input" type="number" step="any" value={form.faixa_minima} onChange={(e) => setForm({ ...form, faixa_minima: e.target.value })} /></label>
                <label className="assets-field">Faixa máxima<input className="form-input" type="number" step="any" value={form.faixa_maxima} onChange={(e) => setForm({ ...form, faixa_maxima: e.target.value })} /></label>
                <label className="assets-field">Certificado de calibração<input className="form-input" placeholder="Número do certificado" value={form.certificado_calibracao} onChange={(e) => setForm({ ...form, certificado_calibracao: e.target.value })} /></label>
                <label className="assets-field">Validade da calibração<input className="form-input" type="date" value={form.calibracao_valida_ate} onChange={(e) => setForm({ ...form, calibracao_valida_ate: e.target.value })} /></label>
              </div>
            </fieldset>
            <div className="assets-form-actions">
              <button className="btn btn-secondary" type="button" disabled={saving} onClick={() => setAba('lista')}>Cancelar</button>
              <button className="btn btn-primary" type="submit" disabled={saving || !form.codigo}><Save size={15} aria-hidden="true" />{saving ? 'Salvando…' : 'Salvar ativo'}</button>
            </div>
          </form>
        </section>
      )}

      {aba === 'lista' && (
        <section className="card assets-panel" aria-labelledby="assets-inventory-title">
          <div className="assets-panel-heading"><div><h2 id="assets-inventory-title">Inventário da obra {!loading && !loadError && <span className="assets-count">{ferramentas.length}</span>}</h2><p>Identificação, saldo disponível e transferência entre obras.</p></div></div>
          <div className="assets-toolbar">
            <div className="assets-search"><Search size={18} aria-hidden="true" /><input type="search" className="form-input" aria-label="Pesquisar ativos" placeholder="Buscar por código, nome, categoria, NF, marca ou modelo" value={filtroAtivos} onChange={(e) => setFiltroAtivos(e.target.value)} /></div>
          </div>
          {loading ? <div className="assets-loading" role="status"><div className="spinner" />Carregando inventário…</div> : loadError ? <div className="assets-empty" role="alert">
            <AlertCircle size={28} aria-hidden="true" /><h3>Inventário indisponível</h3><p>{loadError}</p><button className="btn btn-secondary" onClick={carregar}>Tentar novamente</button>
          </div> : ferramentasFiltradas.length > 0 ? (
            <div className="assets-table-wrap">
              <table className="table assets-table assets-responsive-table" role="table" aria-label="Inventário de ativos">
                <thead role="rowgroup"><tr role="row"><th scope="col">Ativo</th><th scope="col">Identificação</th><th scope="col">Disponibilidade</th><th scope="col">Reposição</th><th scope="col">Transferência</th></tr></thead>
                <tbody role="rowgroup">
                  {ferramentasFiltradas.map((f) => (
                    <tr key={f.id} role="row">
                      <td role="cell" data-label="Ativo"><span className="assets-code">{f.codigo || 'Sem código'}</span><strong className="assets-item-name">{f.nome}</strong></td>
                      <td role="cell" data-label="Identificação"><div><span className="assets-category">{f.categoria || 'Outros'}</span><span className="assets-detail">{[f.marca, f.modelo].filter(Boolean).join(' · ') || 'Marca/modelo não informados'}</span><span className="assets-detail">NF: {f.nf_compra || 'Não informada'}</span></div></td>
                      <td role="cell" data-label="Disponibilidade"><div className="assets-number"><span className={`assets-stock${Number(f.quantidade_disponivel || 0) === 0 ? ' is-unavailable' : ''}`}>{f.quantidade_disponivel ?? 0} disponíveis</span><span className="assets-detail">{f.quantidade_total ?? 0} no total · {f.quantidade_alocada ?? 0} alocados</span></div></td>
                      <td role="cell" data-label="Reposição"><span className="assets-number">R$ {formatBRL(f.valor_reposicao)}</span></td>
                      <td role="cell" data-label="Transferência">
                        <div className="assets-transfer">
                          <select className="form-select" aria-label={`Obra de destino de ${f.nome}`} value={destinosTransferencia[f.id] || ''} onChange={(e) => setDestinosTransferencia((prev) => ({ ...prev, [f.id]: e.target.value }))}>
                            <option value="">Selecionar obra</option>
                            {obrasDestino.map((obra) => <option key={obra.id} value={obra.id}>{obra.nome}</option>)}
                          </select>
                          <button className="btn btn-secondary btn-sm" type="button" onClick={() => transferir(f)} disabled={Number(f.quantidade_alocada || 0) > 0} aria-label={`Transferir ${f.nome}`} title={Number(f.quantidade_alocada || 0) > 0 ? 'Devolva/encerre alocações antes de transferir.' : 'Transferir ativo para outra obra'}>
                            <ArrowRightLeft size={13} aria-hidden="true" />Transferir
                          </button>
                          {Number(f.quantidade_alocada || 0) > 0 && <small>Encerre as alocações para transferir.</small>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="assets-empty"><Package size={30} aria-hidden="true" /><h3>{filtroAtivos.trim() ? 'Nenhum ativo encontrado' : 'Seu inventário começa aqui'}</h3><p>{filtroAtivos.trim() ? 'Tente outro nome, código ou informação do ativo.' : 'Cadastre o primeiro ativo para acompanhar o estoque da obra.'}</p>
            {filtroAtivos.trim() ? <button className="btn btn-secondary" onClick={() => setFiltroAtivos('')}>Limpar busca</button> : <button className="btn btn-primary" onClick={() => setAba('novo')}><Plus size={16} aria-hidden="true" />Cadastrar primeiro ativo</button>}
          </div>}
          {!loading && !loadError && <div className="assets-panel-footer" role="status">{ferramentasFiltradas.length} de {ferramentas.length} ativos cadastrados</div>}
        </section>
      )}
    </AlmoxarifadoLayout>
  );
}

export default AlmoxFerramentas;
