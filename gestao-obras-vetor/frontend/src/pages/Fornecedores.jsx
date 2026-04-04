import React, { useEffect, useState, useCallback } from 'react';
import ComprasLayout from '../components/ComprasLayout';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { listarFornecedores, criarFornecedor, editarFornecedor, toggleFornecedor } from '../services/api';
import { useNotification } from '../context/NotificationContext';

const VAZIO = { razao_social: '', nome_fantasia: '', cnpj: '', telefone: '', email: '', observacao: '' };

export default function Fornecedores() {
  const { usuario } = useAuth();
  const { confirm } = useDialog();
  const { success, error } = useNotification();
  const podeGerenciar = ['ADM', 'Gestor Geral'].includes(usuario?.perfil || '');

  const [fornecedores, setFornecedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listarFornecedores({ ativo: mostrarInativos ? 'todos' : '1', q: busca || undefined });
      setFornecedores(res.data);
    } catch {
      error('Erro ao carregar fornecedores.', 7000);
    } finally {
      setLoading(false);
    }
  }, [busca, mostrarInativos, error]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirCriar = () => { setForm(VAZIO); setEditandoId(null); setModal('criar'); };
  const abrirEditar = (f) => {
    setForm({
      razao_social: f.razao_social || '',
      nome_fantasia: f.nome_fantasia || '',
      cnpj: f.cnpj || '',
      telefone: f.telefone || '',
      email: f.email || '',
      observacao: f.observacao || '',
    });
    setEditandoId(f.id);
    setModal('editar');
  };
  const fecharModal = () => { setModal(null); };

  const salvar = async (e) => {
    e.preventDefault();
    if (!form.razao_social.trim()) { error('Razão social obrigatória.', 6000); return; }
    setSalvando(true);
    try {
      if (modal === 'criar') {
        await criarFornecedor(form);
      } else {
        await editarFornecedor(editandoId, form);
      }
      fecharModal();
      success(modal === 'criar' ? 'Fornecedor criado com sucesso.' : 'Fornecedor atualizado com sucesso.', 5000);
      carregar();
    } catch (err) {
      error(err.response?.data?.erro || 'Erro ao salvar.', 7000);
    } finally {
      setSalvando(false);
    }
  };

  const toggleAtivo = async (f) => {
    const confirmado = await confirm({
      title: 'Confirmação',
      message: `Deseja ${f.ativo ? 'inativar' : 'reativar'} "${f.razao_social}"?`,
      confirmText: 'Sim',
      cancelText: 'Não'
    });
    if (!confirmado) return;
    try {
      await toggleFornecedor(f.id);
      success(f.ativo ? 'Fornecedor inativado.' : 'Fornecedor reativado.', 5000);
      carregar();
    } catch (err) {
      error(err.response?.data?.erro || 'Erro ao alterar status.', 7000);
    }
  };

  return (
    <ComprasLayout
      title="Fornecedores"
      extraHeader={podeGerenciar ? <button className="btn btn-primary" onClick={abrirCriar}>+ Novo Fornecedor</button> : null}
    >
      <p style={{ marginTop: -8, marginBottom: 16, color: 'var(--gray-500)', fontSize: '0.88rem' }}>
        Cadastro de fornecedores para cotações de compras
      </p>

      {/* Filtros */}
      <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            className="form-input"
            style={{ flex: 1, minWidth: 220 }}
            placeholder="Buscar por nome ou CNPJ..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gray-500)', cursor: 'pointer', userSelect: 'none', fontSize: '0.9rem' }}>
            <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
            Mostrar inativos
          </label>
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto 1rem' }} />Carregando...</div>
      ) : fornecedores.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-500)' }}>
          <p>Nenhum fornecedor encontrado.</p>
          {podeGerenciar && <p style={{ fontSize: '0.9rem' }}>Clique em "+ Novo Fornecedor" para cadastrar.</p>}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>{['Razão Social', 'Nome Fantasia', 'CNPJ', 'Telefone', 'E-mail', 'Status', 'Ações'].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {fornecedores.map((f) => (
                  <tr key={f.id} style={{ opacity: f.ativo ? 1 : 0.55 }}>
                    <td><strong>{f.razao_social}</strong></td>
                    <td>{f.nome_fantasia || '—'}</td>
                    <td>{f.cnpj || '—'}</td>
                    <td>{f.telefone || '—'}</td>
                    <td>{f.email || '—'}</td>
                    <td>
                      <span className={f.ativo ? 'badge badge-green' : 'badge badge-red'}>
                        {f.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>
                      {podeGerenciar && (
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.82rem' }} onClick={() => abrirEditar(f)}>Editar</button>
                          <button className={f.ativo ? 'btn btn-danger' : 'btn btn-success'} style={{ padding: '6px 12px', fontSize: '0.82rem' }} onClick={() => toggleAtivo(f)}>
                            {f.ativo ? 'Inativar' : 'Reativar'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal criar/editar */}
      {modal && (
        <div className="modal-overlay fade-in" role="dialog" aria-modal="true" onClick={fecharModal}>
          <div className="modal-card" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="card-header" style={{ marginBottom: '1.5rem' }}>
              {modal === 'criar' ? 'Novo Fornecedor' : 'Editar Fornecedor'}
            </h2>
            <form onSubmit={salvar}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div><label className="form-label">Razão Social *</label><input className="form-input" value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} required /></div>
                <div><label className="form-label">Nome Fantasia</label><input className="form-input" value={form.nome_fantasia} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div><label className="form-label">CNPJ</label><input className="form-input" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" /></div>
                <div><label className="form-label">Telefone</label><input className="form-input" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
              </div>
              <div style={{ marginBottom: '1rem' }}><label className="form-label">E-mail</label><input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div style={{ marginBottom: '1rem' }}><label className="form-label">Observação</label><textarea className="form-input" rows={3} style={{ resize: 'vertical' }} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} /></div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={fecharModal}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ComprasLayout>
  );
}
