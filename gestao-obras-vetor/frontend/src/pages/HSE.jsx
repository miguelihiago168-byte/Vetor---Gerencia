import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Briefcase, CalendarDays, Pencil, Plus, Search, Users, X } from 'lucide-react';
import Navbar from '../components/Navbar';
import { useDialog } from '../context/DialogContext';
import api from '../services/api';
import HSEPlanejamento from './HSEPlanejamento';
import './HSE.css';

const emptyPerson = { nome: '', funcao: '', tipo: 'Direta' };

export default function HSE() {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState({ pessoas: [], funcoes: [] });
  const [tab, setTab] = useState(() => ['pessoas','funcoes','planejamento'].includes(searchParams.get('aba')) ? searchParams.get('aba') : 'pessoas');
  const [form, setForm] = useState(emptyPerson);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [newRole, setNewRole] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const { confirm } = useDialog();

  const load = async () => setData((await api.get('/hse/mao-de-obra')).data);
  useEffect(() => {
    load().catch(() => setError('Não foi possível carregar a mão de obra.')).finally(() => setLoading(false));
  }, []);

  const work = async action => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const message = await action();
      await load();
      setNotice(message);
    } catch (e) {
      setError(e.response?.data?.erro || 'Não foi possível concluir a operação.');
    } finally {
      setBusy(false);
    }
  };

  const closeForm = () => { setEditing(null); setForm(emptyPerson); setShowForm(false); };
  const save = event => {
    event.preventDefault();
    work(async () => {
      if (editing) await api.put(`/hse/mao-de-obra/${editing.origem}/${editing.id}`, form);
      else await api.post('/hse/mao-de-obra', form);
      closeForm();
      return editing ? 'Alterações salvas.' : 'Pessoa cadastrada.';
    });
  };
  const addRole = event => {
    event.preventDefault();
    work(async () => {
      await api.post('/hse/funcoes', { nome: newRole });
      setNewRole('');
      return 'Função cadastrada.';
    });
  };
  const edit = person => {
    setEditing(person);
    setForm({ nome: person.nome, funcao: person.funcao || '', tipo: person.tipo || '' });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const changeStatus = async person => {
    const active = Number(person.ativo) === 1;
    if (!await confirm({ title: active ? 'Dar baixa' : 'Reativar pessoa', message: active ? `Dar baixa em ${person.nome}?` : `Reativar ${person.nome}?`, confirmText: active ? 'Dar baixa' : 'Reativar', cancelText: 'Cancelar' })) return;
    work(async () => {
      await api.patch(`/hse/mao-de-obra/${person.id}/status`, { ativo: !active });
      return active ? 'Baixa realizada.' : 'Pessoa reativada.';
    });
  };
  const roles = useMemo(() => [...new Set([...data.funcoes.map(item => item.nome), ...data.pessoas.map(item => item.funcao)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [data]);
  const people = data.pessoas.filter(item => `${item.nome} ${item.funcao} ${item.tipo || ''}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')));

  return <><Navbar /><main className="hse-page">
    <header className="hse-header"><div><p>HSE</p><h1>Mão de obra</h1><span>Gerencie as pessoas, funções e classificações da empresa.</span></div>
      {tab === 'pessoas' && !showForm && <button className="hse-button hse-button-primary" type="button" onClick={() => { setEditing(null); setForm(emptyPerson); setShowForm(true); }}><Plus size={17} /> Cadastrar pessoa</button>}
    </header>
    {error && <div className="hse-message hse-message-error" role="alert">{error}</div>}
    {notice && <div className="hse-message hse-message-success" role="status">{notice}</div>}
    <nav className="hse-tabs" aria-label="Seções de mão de obra">
      <button className={tab === 'pessoas' ? 'active' : ''} type="button" aria-current={tab === 'pessoas' ? 'page' : undefined} onClick={() => setTab('pessoas')}><Users size={17} /> Pessoas</button>
      <button className={tab === 'funcoes' ? 'active' : ''} type="button" aria-current={tab === 'funcoes' ? 'page' : undefined} onClick={() => setTab('funcoes')}><Briefcase size={17} /> Funções</button>
      <button className={tab === 'planejamento' ? 'active' : ''} type="button" aria-current={tab === 'planejamento' ? 'page' : undefined} onClick={() => setTab('planejamento')}><CalendarDays size={17} /> Planejamento</button>
    </nav>
    {tab === 'pessoas' && <>
      {showForm && <section className="hse-card hse-form-card"><div className="hse-card-heading"><div><h2>{editing ? 'Editar pessoa' : 'Cadastrar pessoa'}</h2><p>Informe a função e a classificação usadas nas obras.</p></div><button className="hse-icon-button" type="button" onClick={closeForm} aria-label="Fechar formulário"><X size={19}/></button></div>
        <form onSubmit={save}><div className="hse-form-grid">
          <label>Nome<input value={form.nome} disabled={editing?.origem === 'usuario'} onChange={e => setForm({ ...form, nome: e.target.value })} required maxLength={200} /></label>
          <label>Função<input list="hse-funcoes" value={form.funcao} onChange={e => setForm({ ...form, funcao: e.target.value })} required maxLength={150} /></label>
          <datalist id="hse-funcoes">{roles.map(role => <option key={role} value={role} />)}</datalist>
          <label>Classificação<select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} required><option value="">Selecione</option><option>Direta</option><option>Indireta</option><option>Terceiros</option></select></label>
        </div>{editing?.origem === 'usuario' && <p className="hse-hint">O nome é alterado no cadastro de usuários.</p>}
        <div className="hse-form-actions"><button className="hse-button hse-button-primary" disabled={busy}>Salvar</button><button className="hse-button hse-button-secondary" type="button" onClick={closeForm}>Cancelar</button></div></form>
      </section>}
      <section className="hse-card"><div className="hse-card-heading hse-list-heading"><div><h2>Pessoas</h2><p>{loading ? 'Carregando...' : `${people.length} ${people.length === 1 ? 'pessoa encontrada' : 'pessoas encontradas'}`}</p></div><label className="hse-search"><Search size={18} /><span className="hse-visually-hidden">Buscar pessoas</span><input placeholder="Buscar pessoas" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
        <div className="hse-table-wrap"><table className="hse-table"><thead><tr><th>Nome</th><th>Origem</th><th>Função</th><th>Classificação</th><th>Status</th><th>Ações</th></tr></thead><tbody>
          {people.map(person => <tr key={`${person.origem}:${person.id}`}><td className="hse-person">{person.nome}</td><td>{person.origem === 'usuario' ? 'Usuário' : 'Mão de obra'}</td><td>{person.funcao || 'Não informada'}</td><td>{person.tipo || 'Não classificada'}</td><td><span className={`hse-status ${Number(person.ativo) === 1 ? 'active' : ''}`}>{Number(person.ativo) === 1 ? 'Ativo' : 'Inativo'}</span></td><td><div className="hse-row-actions"><button className="hse-action" type="button" onClick={() => edit(person)}><Pencil size={14} /> Editar</button>{person.origem === 'mao_obra' && <button className="hse-action" type="button" disabled={busy} onClick={() => changeStatus(person)}>{Number(person.ativo) === 1 ? 'Dar baixa' : 'Reativar'}</button>}</div></td></tr>)}
          {!loading && !people.length && <tr><td className="hse-empty" colSpan="6">Nenhuma pessoa encontrada.</td></tr>}
        </tbody></table></div>
      </section>
    </>}
    {tab === 'funcoes' && <section className="hse-card hse-roles"><div className="hse-card-heading"><div><h2>Funções</h2><p>Cadastre funções para usar na mão de obra.</p></div></div>
      <form className="hse-role-form" onSubmit={addRole}><label>Nome da função<input value={newRole} onChange={e => setNewRole(e.target.value)} required maxLength={150} placeholder="Ex.: Eletricista" /></label><button className="hse-button hse-button-primary" disabled={busy}><Plus size={17} /> Cadastrar função</button></form>
      <h3>Funções cadastradas</h3>{data.funcoes.length ? <ul className="hse-role-list">{data.funcoes.map(role => <li key={role.id}>{role.nome}</li>)}</ul> : <p className="hse-hint">Nenhuma função cadastrada.</p>}
    </section>}
    {tab === 'planejamento' && <HSEPlanejamento roles={roles} />}
  </main></>;
}
