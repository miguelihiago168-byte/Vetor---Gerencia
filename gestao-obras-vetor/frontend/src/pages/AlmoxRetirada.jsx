import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import AlmoxarifadoLayout from '../components/AlmoxarifadoLayout';
import { getFerramentas, getColaboradoresRetirada, registrarRetiradaFerramenta } from '../services/api';
import { useNotification } from '../context/NotificationContext';

function AlmoxRetirada() {
  const { projetoId } = useParams();
  const { success, error } = useNotification();
  const [ferramentas, setFerramentas] = useState([]);
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
      try {
        const [fRes, cRes] = await Promise.all([
          getFerramentas({ projeto_id: projetoId }),
          getColaboradoresRetirada(projetoId)
        ]);
        setFerramentas((fRes.data || []).filter((f) => Number(f.quantidade_disponivel) > 0));
        setColaboradores(cRes.data || []);
      } catch (err) {
        error(err?.response?.data?.erro || 'Erro ao carregar dados para retirada.', 7000);
      }
    };

    carregar();
  }, [projetoId]);

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
    } catch (err) {
      error(err?.response?.data?.erro || 'Erro ao registrar retirada.', 7000);
    }
  };

  return (
    <AlmoxarifadoLayout title="Retirada">
        <div className="card">
          <h2 className="card-header">Nova retirada</h2>
          <form onSubmit={salvar} className="grid grid-2" style={{ gap: 12 }}>
            <div>
              <label className="form-label">Pessoa cadastrada</label>
              <div className="almox-user-picker" ref={pickerRef}>
                <div className={`almox-user-picker-control${pickerAberto ? ' is-open' : ''}${colaboradorSelecionado ? ' has-value' : ''}`}>
                  <input
                    className="almox-user-picker-input"
                    placeholder="Buscar por nome, ID ou função"
                    value={buscaColaborador}
                    autoComplete="off"
                    onFocus={() => setPickerAberto(true)}
                    onKeyDown={onKeyDownPicker}
                    onChange={(e) => {
                      setBuscaColaborador(e.target.value);
                      setPickerAberto(true);
                      setForm((prev) => ({
                        ...prev,
                        colaborador_id: ''
                      }));
                    }}
                  />
                  {colaboradorSelecionado ? (
                    <button type="button" className="almox-user-picker-clear" onClick={limparColaboradorSelecionado} aria-label="Limpar pessoa selecionada">
                      ×
                    </button>
                  ) : (
                    <span className="almox-user-picker-caret">⌄</span>
                  )}
                </div>

                {pickerAberto && (
                  <div className="almox-user-picker-menu" role="listbox">
                    {opcoesVisiveis.length > 0 ? opcoesVisiveis.map((c, index) => (
                      <button
                        type="button"
                        key={c.id}
                        className={`almox-user-picker-option${index === opcaoAtiva ? ' is-active' : ''}${String(form.colaborador_id) === String(c.id) ? ' is-selected' : ''}`}
                        onMouseEnter={() => setOpcaoAtiva(index)}
                        onClick={() => selecionarColaborador(c)}
                        role="option"
                        aria-selected={String(form.colaborador_id) === String(c.id)}
                      >
                        <span className="almox-user-picker-name">{c.nome}</span>
                        <span className="almox-user-picker-meta">
                          {c.identificador || 'Sem ID'} · {c.funcao || 'Sem função'}
                        </span>
                        <span className={`almox-user-picker-type ${c.tipo === 'sistema' ? 'system' : 'direct'}`}>
                          {c.tipo === 'sistema' ? 'Usuário do sistema' : 'Mão de obra direta'}
                        </span>
                      </button>
                    )) : (
                      <div className="almox-user-picker-empty">
                        Nenhuma pessoa cadastrada encontrada.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="form-label">Colaborador manual</label>
              <input
                className="form-input"
                placeholder="Use somente se a pessoa não estiver cadastrada"
                value={form.colaborador_nome}
                onChange={(e) => {
                  setForm({ ...form, colaborador_nome: e.target.value, colaborador_id: '' });
                  setBuscaColaborador('');
                }}
              />
            </div>
            <div>
              <label className="form-label">Ativo</label>
              <select className="form-select" required value={form.ferramenta_id} onChange={(e) => setForm({ ...form, ferramenta_id: e.target.value })}>
                <option value="">Selecionar</option>
                {ferramentas.map((f) => <option key={f.id} value={f.id}>{f.nome} · disponível {f.quantidade_disponivel}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Quantidade</label>
              <input className="form-input" type="number" min="1" required value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Previsão de devolução</label>
              <input className="form-input" type="date" required value={form.previsao_devolucao} onChange={(e) => setForm({ ...form, previsao_devolucao: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Observação</label>
              <input className="form-input" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <button className="btn btn-primary" type="submit">Registrar retirada</button>
            </div>
          </form>
        </div>
    </AlmoxarifadoLayout>
  );
}

export default AlmoxRetirada;
