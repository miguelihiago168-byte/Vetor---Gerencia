import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AlmoxarifadoLayout from '../components/AlmoxarifadoLayout';
import { createFerramenta, getFerramentas, getProjetos, transferirAtivoObra } from '../services/api';
import { useDialog } from '../context/DialogContext';

const CATEGORIAS_ATIVO = ['Ferramenta', 'Equipamento', 'Máquina', 'Veículo', 'EPI', 'Eletrônico', 'Outros'];
const formatBRL = (valor) => Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function AlmoxFerramentas() {
  const { projetoId } = useParams();
  const { confirm } = useDialog();
  const [ferramentas, setFerramentas] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [destinosTransferencia, setDestinosTransferencia] = useState({});
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [form, setForm] = useState({ codigo: '', nome: '', categoria: 'Outros', nf_compra: '', marca: '', modelo: '', descricao: '', unidade: 'UN', quantidade_total: '', valor_reposicao: '' });

  const carregar = async () => {
    try {
      setLoading(true);
      const res = await getFerramentas({ projeto_id: projetoId });
      setFerramentas(res.data || []);
    } catch (error) {
      setErro(error?.response?.data?.erro || 'Erro ao carregar ativos.');
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
    setErro('');
    setSucesso('');
    try {
      await createFerramenta({
        ...form,
        projeto_id: Number(projetoId),
        quantidade_total: Number(form.quantidade_total),
        valor_reposicao: Number(form.valor_reposicao)
      });
      setForm({ codigo: '', nome: '', categoria: 'Outros', nf_compra: '', marca: '', modelo: '', descricao: '', unidade: 'UN', quantidade_total: '', valor_reposicao: '' });
      setSucesso('Ativo cadastrado com sucesso.');
      carregar();
    } catch (error) {
      setErro(error?.response?.data?.erro || 'Erro ao cadastrar ativo.');
    }
  };

  const transferir = async (ferramenta) => {
    setErro('');
    setSucesso('');
    const destinoId = Number(destinosTransferencia[ferramenta.id] || 0);
    if (!destinoId) {
      setErro('Selecione a obra de destino para transferir o ativo.');
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
      setSucesso('Ativo transferido com sucesso.');
      setDestinosTransferencia((prev) => ({ ...prev, [ferramenta.id]: '' }));
      await carregar();
    } catch (error) {
      setErro(error?.response?.data?.erro || 'Erro ao transferir ativo.');
    }
  };

  const obrasDestino = (projetos || []).filter((p) => Number(p.id) !== Number(projetoId));

  return (
    <AlmoxarifadoLayout title="Cadastro de Ativos">
        {erro && <div className="alert alert-error">{erro}</div>}
        {sucesso && <div className="alert alert-success">{sucesso}</div>}

        <div className="card">
          <h2 className="card-header">Novo ativo</h2>
          <form onSubmit={salvar} className="grid grid-3" style={{ gap: 12 }}>
            <input className="form-input" placeholder="Código" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            <input className="form-input" placeholder="Nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            <select className="form-select" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIAS_ATIVO.map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}
            </select>
            <input className="form-input" placeholder="Unidade" value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} />
            <input className="form-input" type="number" min="0" required placeholder="Qtd. total (un)" value={form.quantidade_total} onChange={(e) => setForm({ ...form, quantidade_total: e.target.value })} />
            <input className="form-input" type="number" min="0" step="0.01" required placeholder="R$ 0,00" value={form.valor_reposicao} onChange={(e) => setForm({ ...form, valor_reposicao: e.target.value })} />
            <input className="form-input" required placeholder="NF de compra" value={form.nf_compra} onChange={(e) => setForm({ ...form, nf_compra: e.target.value })} />
            <input className="form-input" placeholder="Marca" value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
            <input className="form-input" placeholder="Modelo" value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
            <input className="form-input" placeholder="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            <div style={{ gridColumn: '1 / -1' }}>
              <button className="btn btn-primary" type="submit">Salvar ativo</button>
            </div>
          </form>
        </div>

        <div className="card">
          <h2 className="card-header">Ativos cadastrados</h2>
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
                  {ferramentas.map((f) => (
                    <tr key={f.id}>
                      <td>{f.codigo || '-'}</td>
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
                  {ferramentas.length === 0 && (
                    <tr><td colSpan={11}>Nenhum ativo cadastrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
    </AlmoxarifadoLayout>
  );
}

export default AlmoxFerramentas;
