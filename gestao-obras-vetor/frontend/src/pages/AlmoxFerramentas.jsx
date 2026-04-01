import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
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
  const [filtroAtivos, setFiltroAtivos] = useState('');
  const [form, setForm] = useState({ codigo: '', nome: '', categoria: 'Outros', nf_compra: '', marca: '', modelo: '', descricao: '', unidade: 'UN', quantidade_total: '', valor_reposicao: '' });
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
    try {
      await createFerramenta({
        ...form,
        projeto_id: Number(projetoId),
        quantidade_total: Number(form.quantidade_total),
        valor_reposicao: parseMoneyBR(form.valor_reposicao)
      });
      setForm({ codigo: '', nome: '', categoria: 'Outros', nf_compra: '', marca: '', modelo: '', descricao: '', unidade: 'UN', quantidade_total: '', valor_reposicao: '' });
      success('Ativo cadastrado com sucesso.', 5000);
      await carregar();
      setAba('lista');
    } catch (err) {
      error(err?.response?.data?.erro || 'Erro ao cadastrar ativo.', 7000);
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

  const tabStyle = (aba_id) => ({
    padding: '8px 20px',
    border: 'none',
    borderBottom: aba === aba_id ? '2px solid var(--accent)' : '2px solid transparent',
    background: 'none',
    color: aba === aba_id ? 'var(--accent)' : 'var(--text-muted)',
    fontWeight: aba === aba_id ? 600 : 400,
    cursor: 'pointer',
    fontSize: 14,
    transition: 'color 0.15s',
  });

  return (
    <AlmoxarifadoLayout title="Ativos">
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button style={tabStyle('lista')} onClick={() => setAba('lista')}>
          Ativos cadastrados {ferramentas.length > 0 && <span style={{ fontSize: 12, marginLeft: 4, opacity: 0.7 }}>({ferramentas.length})</span>}
        </button>
        <button style={tabStyle('novo')} onClick={() => setAba('novo')}>
          + Novo ativo
        </button>
      </div>

      {aba === 'novo' && (
        <div className="card">
          <h2 className="card-header">Novo ativo</h2>
          <form onSubmit={salvar} className="grid grid-3" style={{ gap: 12 }}>
            {primeiroCodigo ? (
              <input
                className="form-input"
                placeholder="Código inicial (ex: IPT-0001) — você define o padrão desta obra"
                required
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
                style={{ gridColumn: '1 / -1' }}
              />
            ) : (
              <input
                className="form-input"
                value={proximoCodigo ? `Próximo código: ${proximoCodigo}` : 'Calculando código...'}
                readOnly
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)', cursor: 'default', gridColumn: '1 / -1' }}
              />
            )}
            <input className="form-input" placeholder="Nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            <select className="form-select" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIAS_ATIVO.map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}
            </select>
            <input className="form-input" placeholder="Unidade" value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} />
            <input className="form-input" type="number" min="0" required placeholder="Qtd. total (un)" value={form.quantidade_total} onChange={(e) => setForm({ ...form, quantidade_total: e.target.value })} />
            <input className="form-input" type="text" inputMode="numeric" required placeholder="Valor de reposição (R$)" value={form.valor_reposicao} onChange={(e) => setForm({ ...form, valor_reposicao: formatMoneyInputBR(e.target.value) })} />
            <input className="form-input" required placeholder="NF de compra" value={form.nf_compra} onChange={(e) => setForm({ ...form, nf_compra: e.target.value })} />
            <input className="form-input" placeholder="Marca" value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
            <input className="form-input" placeholder="Modelo" value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
            <input className="form-input" placeholder="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" type="submit">Salvar ativo</button>
              <button className="btn btn-secondary" type="button" onClick={() => setAba('lista')}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {aba === 'lista' && (
        <div className="card">
          <div className="mb-3">
            <input
              className="form-input"
              placeholder="Pesquisar ativos por código, nome, categoria, NF, marca ou modelo"
              value={filtroAtivos}
              onChange={(e) => setFiltroAtivos(e.target.value)}
            />
          </div>
          {loading ? <div className="loading"><div className="spinner"></div></div> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Ativo</th>
                    <th>Classificação</th>
                    <th>NF</th>
                    <th>Marca</th>
                    <th>Modelo</th>
                    <th>Total</th>
                    <th>Disponível</th>
                    <th>Alocada</th>
                    <th>Valor reposição</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {ferramentasFiltradas.map((f) => (
                    <tr key={f.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{f.codigo || '-'}</td>
                      <td>{f.nome}</td>
                      <td>{f.categoria || 'Outros'}</td>
                      <td>{f.nf_compra || '-'}</td>
                      <td>{f.marca || '-'}</td>
                      <td>{f.modelo || '-'}</td>
                      <td>{f.quantidade_total}</td>
                      <td>{f.quantidade_disponivel}</td>
                      <td>{f.quantidade_alocada}</td>
                      <td>R$ {formatBRL(f.valor_reposicao)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <select
                            className="form-select"
                            style={{ minWidth: 170 }}
                            value={destinosTransferencia[f.id] || ''}
                            onChange={(e) => setDestinosTransferencia((prev) => ({ ...prev, [f.id]: e.target.value }))}
                          >
                            <option value="">Obra destino</option>
                            {obrasDestino.map((obra) => (
                              <option key={obra.id} value={obra.id}>{obra.nome}</option>
                            ))}
                          </select>
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() => transferir(f)}
                            disabled={Number(f.quantidade_alocada || 0) > 0}
                            title={Number(f.quantidade_alocada || 0) > 0 ? 'Devolva/encerre alocações antes de transferir.' : 'Transferir ativo para outra obra'}
                          >
                            Transferir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {ferramentasFiltradas.length === 0 && (
                    <tr><td colSpan={11}>{filtroAtivos ? 'Nenhum ativo encontrado para o filtro informado.' : 'Nenhum ativo cadastrado.'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </AlmoxarifadoLayout>
  );
}

export default AlmoxFerramentas;

