import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import AlmoxarifadoLayout from '../components/AlmoxarifadoLayout';
import { AssetsPanel, AssetsState } from '../components/AlmoxarifadoUI';
import { ArrowUpRight } from 'lucide-react';
import { getFerramentas, getColaboradoresRetirada, registrarRetiradaFerramenta } from '../services/api';
import { useNotification } from '../context/NotificationContext';

function AlmoxRetirada() {
  const { projetoId } = useParams();
  const { success, error } = useNotification();
  const [ferramentas, setFerramentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const [saving, setSaving] = useState(false);
  const [colaboradores, setColaboradores] = useState([]);
  const [buscaColaborador, setBuscaColaborador] = useState('');
  const [pickerAberto, setPickerAberto] = useState(false);
  const [opcaoAtiva, setOpcaoAtiva] = useState(0);
  const pickerRef = useRef(null);
  const [form, setForm] = useState({ colaborador_id: '', colaborador_nome: '', ferramenta_id: '', quantidade: 1, previsao_devolucao: '', observacao: '' });

  const formatarOpcaoColaborador = (item) => {
    return `${item.nome}${item.identificador ? ` (${item.identificador})` : ''} · ${item.funcao || 'Sem função'} · ${item.tipo === 'sistema' ? 'Usuário do sistema' : 'Mão de obra direta'}`;
  };

  const colaboradoresFiltrados = useMemo(() => (colaboradores || []).filter((item) => {
    const termo = String(buscaColaborador || '').trim().toLowerCase();
    if (!termo) return true;
    const nome = String(item.nome || '').toLowerCase();
    const identificador = String(item.identificador || '').toLowerCase();
    const funcao = String(item.funcao || '').toLowerCase();
    const tipo = item.tipo === 'sistema' ? 'usuario sistema usuário sistema' : 'mao obra direta mão obra direta';
    return nome.includes(termo) || identificador.includes(termo) || funcao.includes(termo) || tipo.includes(termo);
  }), [colaboradores, buscaColaborador]);

  const colaboradorSelecionado = useMemo(() => {
    if (!form.colaborador_id) return null;
    return (colaboradores || []).find((item) => String(item.id) === String(form.colaborador_id)) || null;
  }, [colaboradores, form.colaborador_id]);

  const opcoesVisiveis = colaboradoresFiltrados.slice(0, 8);

  const resolverColaboradorPorTexto = (texto) => {
    const termo = String(texto || '').trim().toLowerCase();
    if (!termo) return null;

    const exato = (colaboradores || []).find((item) => {
      const label = formatarOpcaoColaborador(item).toLowerCase();
      const nome = String(item.nome || '').toLowerCase();
      const identificador = String(item.identificador || '').toLowerCase();
      return label === termo || nome === termo || identificador === termo;
    });
    if (exato) return exato;

    const parciais = (colaboradores || []).filter((item) => {
      const nome = String(item.nome || '').toLowerCase();
      const identificador = String(item.identificador || '').toLowerCase();
      return nome.includes(termo) || identificador.includes(termo);
    });

    return parciais.length === 1 ? parciais[0] : null;
  };

  useEffect(() => {
    const carregar = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const [fRes, cRes] = await Promise.all([
          getFerramentas({ projeto_id: projetoId }),
          getColaboradoresRetirada(projetoId)
        ]);
        setFerramentas((fRes.data || []).filter((f) => Number(f.quantidade_disponivel) > 0));
        setColaboradores(cRes.data || []);
      } catch (err) {
        setLoadError(err?.response?.data?.erro || 'Erro ao carregar dados para retirada.');
      } finally {
        setLoading(false);
      }
    };

    carregar();
  }, [projetoId, tentativa]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!pickerRef.current || pickerRef.current.contains(event.target)) return;
      setPickerAberto(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  useEffect(() => {
    setOpcaoAtiva(0);
  }, [buscaColaborador]);

  const selecionarColaborador = (item) => {
    setForm((prev) => ({
      ...prev,
      colaborador_id: item.id,
      colaborador_nome: ''
    }));
    setBuscaColaborador(formatarOpcaoColaborador(item));
    setPickerAberto(false);
  };

  const limparColaboradorSelecionado = () => {
    setForm((prev) => ({
      ...prev,
      colaborador_id: '',
      colaborador_nome: ''
    }));
    setBuscaColaborador('');
    setPickerAberto(true);
  };

  const onKeyDownPicker = (event) => {
    if (!pickerAberto && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      setPickerAberto(true);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpcaoAtiva((prev) => Math.min(prev + 1, Math.max(opcoesVisiveis.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpcaoAtiva((prev) => Math.max(prev - 1, 0));
    } else if (event.key === 'Enter' && pickerAberto && opcoesVisiveis[opcaoAtiva]) {
      event.preventDefault();
      selecionarColaborador(opcoesVisiveis[opcaoAtiva]);
    } else if (event.key === 'Escape') {
      setPickerAberto(false);
    }
  };

  const salvar = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      let colaboradorSelecionado = form.colaborador_id
        ? colaboradores.find((item) => String(item.id) === String(form.colaborador_id))
        : null;

      if (!colaboradorSelecionado && buscaColaborador.trim()) {
        colaboradorSelecionado = resolverColaboradorPorTexto(buscaColaborador);
      }

      const colaboradorNomeFinal = colaboradorSelecionado
        ? `${colaboradorSelecionado.nome}${colaboradorSelecionado.identificador ? ` (${colaboradorSelecionado.identificador})` : ''}`
        : form.colaborador_nome;

      await registrarRetiradaFerramenta({
        ...form,
        projeto_id: Number(projetoId),
        colaborador_id: colaboradorSelecionado?.tipo === 'sistema' ? Number(colaboradorSelecionado.usuario_id) : null,
        colaborador_nome: colaboradorNomeFinal,
        ferramenta_id: Number(form.ferramenta_id),
        quantidade: Number(form.quantidade)
      });
      success('Retirada registrada com sucesso.', 5000);
      setForm({ colaborador_id: '', colaborador_nome: '', ferramenta_id: '', quantidade: 1, previsao_devolucao: '', observacao: '' });
      setBuscaColaborador('');
      setTentativa((value) => value + 1);
    } catch (err) {
      error(err?.response?.data?.erro || 'Erro ao registrar retirada.', 7000);
    } finally {
      setSaving(false);
    }
  };

  const ativoSelecionado = ferramentas.find((item) => String(item.id) === String(form.ferramenta_id));

  return (
    <AlmoxarifadoLayout title="Retirada" description="Registre a entrega de ativos e acompanhe quem ficará responsável por eles.">
      <AssetsPanel title="Nova retirada" description="Informe o responsável, o ativo e a previsão de devolução." className="assets-panel-overflow">
        {loading || loadError ? <AssetsState loading={loading} error={loadError} onRetry={() => setTentativa((value) => value + 1)} /> :
          ferramentas.length === 0 ? <AssetsState title="Nenhum ativo disponível" description="Cadastre ativos ou registre uma devolução para disponibilizar itens nesta obra." /> :
          <form onSubmit={salvar} className="assets-form">
            <fieldset className="assets-form-section" disabled={saving}>
              <legend>Responsável pela retirada</legend>
              <p className="assets-section-hint">Selecione uma pessoa cadastrada ou informe o nome manualmente.</p>
              <div className="assets-form-grid assets-form-grid-two">
                <div className="assets-field">
                  <label htmlFor="retirada-colaborador">Pessoa cadastrada</label>
                  <div className="almox-user-picker" ref={pickerRef}>
                    <div className={`almox-user-picker-control${pickerAberto ? ' is-open' : ''}${colaboradorSelecionado ? ' has-value' : ''}`}>
                      <input id="retirada-colaborador" className="almox-user-picker-input" role="combobox" aria-expanded={pickerAberto} aria-controls="retirada-pessoas" aria-autocomplete="list"
                        aria-activedescendant={pickerAberto && opcoesVisiveis[opcaoAtiva] ? `retirada-pessoa-${opcoesVisiveis[opcaoAtiva].id}` : undefined}
                        placeholder="Buscar por nome, ID ou função" value={buscaColaborador} autoComplete="off"
                        onFocus={() => setPickerAberto(true)} onKeyDown={onKeyDownPicker}
                        onChange={(e) => { setBuscaColaborador(e.target.value); setPickerAberto(true); setForm((prev) => ({ ...prev, colaborador_id: '' })); }} />
                      {colaboradorSelecionado ? <button type="button" className="almox-user-picker-clear" onClick={limparColaboradorSelecionado} aria-label="Limpar pessoa selecionada">×</button> : <span className="almox-user-picker-caret" aria-hidden="true">⌄</span>}
                    </div>
                    {pickerAberto && <div className="almox-user-picker-menu" id="retirada-pessoas" role="listbox" aria-label="Pessoas cadastradas">
                      {opcoesVisiveis.length > 0 ? opcoesVisiveis.map((c, index) => <button type="button" key={c.id} id={`retirada-pessoa-${c.id}`} tabIndex={-1}
                        className={`almox-user-picker-option${index === opcaoAtiva ? ' is-active' : ''}${String(form.colaborador_id) === String(c.id) ? ' is-selected' : ''}`}
                        onMouseEnter={() => setOpcaoAtiva(index)} onClick={() => selecionarColaborador(c)} role="option" aria-selected={String(form.colaborador_id) === String(c.id)}>
                        <span className="almox-user-picker-name">{c.nome}</span><span className="almox-user-picker-meta">{c.identificador || 'Sem ID'} · {c.funcao || 'Sem função'}</span>
                        <span className={`almox-user-picker-type ${c.tipo === 'sistema' ? 'system' : 'direct'}`}>{c.tipo === 'sistema' ? 'Usuário do sistema' : 'Mão de obra direta'}</span>
                      </button>) : <div className="almox-user-picker-empty">Nenhuma pessoa cadastrada encontrada.</div>}
                    </div>}
                  </div>
                </div>
                <label className="assets-field">Colaborador manual
                  <input className="form-input" placeholder="Nome da pessoa não cadastrada" value={form.colaborador_nome}
                    onChange={(e) => { setForm({ ...form, colaborador_nome: e.target.value, colaborador_id: '' }); setBuscaColaborador(''); }} />
                  <small>Use este campo somente se a pessoa não estiver cadastrada.</small>
                </label>
              </div>
            </fieldset>
            <fieldset className="assets-form-section" disabled={saving}>
              <legend>Ativo e prazo</legend>
              <div className="assets-form-grid">
                <label className="assets-field">Ativo *
                  <select className="form-select" required value={form.ferramenta_id} onChange={(e) => setForm({ ...form, ferramenta_id: e.target.value })}>
                    <option value="">Selecionar ativo</option>{ferramentas.map((f) => <option key={f.id} value={f.id}>{f.nome} · {f.quantidade_disponivel} disponíveis</option>)}
                  </select>
                </label>
                <label className="assets-field">Quantidade *
                  <input className="form-input" type="number" min="1" max={ativoSelecionado?.quantidade_disponivel} required value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />
                  {ativoSelecionado && <small>{ativoSelecionado.quantidade_disponivel} disponíveis nesta obra.</small>}
                </label>
                <label className="assets-field">Previsão de devolução *
                  <input className="form-input" type="date" required value={form.previsao_devolucao} onChange={(e) => setForm({ ...form, previsao_devolucao: e.target.value })} />
                </label>
                <label className="assets-field assets-field-wide">Observação
                  <textarea className="form-textarea" rows={3} placeholder="Condição de entrega ou outras orientações (opcional)" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
                </label>
              </div>
            </fieldset>
            <div className="assets-form-actions"><button className="btn btn-primary" type="submit" disabled={saving}><ArrowUpRight size={16} aria-hidden="true" />{saving ? 'Registrando…' : 'Registrar retirada'}</button></div>
          </form>}
      </AssetsPanel>
    </AlmoxarifadoLayout>
  );
}

export default AlmoxRetirada;
