import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AlmoxarifadoLayout from '../components/AlmoxarifadoLayout';
import { getFerramentas, getColaboradoresRetirada, registrarRetiradaFerramenta } from '../services/api';

function AlmoxRetirada() {
  const { projetoId } = useParams();
  const [ferramentas, setFerramentas] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [buscaColaborador, setBuscaColaborador] = useState('');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [form, setForm] = useState({ colaborador_id: '', colaborador_nome: '', ferramenta_id: '', quantidade: 1, previsao_devolucao: '', observacao: '' });

  const formatarOpcaoColaborador = (item) => {
    return `${item.nome}${item.identificador ? ` (${item.identificador})` : ''} · ${item.funcao || 'Sem função'} · ${item.tipo === 'sistema' ? 'Usuário do sistema' : 'Mão de obra direta'}`;
  };

  const colaboradoresFiltrados = (colaboradores || []).filter((item) => {
    const termo = String(buscaColaborador || '').trim().toLowerCase();
    if (!termo) return true;
    const nome = String(item.nome || '').toLowerCase();
    const identificador = String(item.identificador || '').toLowerCase();
    return nome.includes(termo) || identificador.includes(termo);
  });

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
      } catch (error) {
        setErro(error?.response?.data?.erro || 'Erro ao carregar dados para retirada.');
      }
    };

    carregar();
  }, [projetoId]);

  const salvar = async (e) => {
    e.preventDefault();
    setErro('');
    setSucesso('');

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
      setSucesso('Retirada registrada com sucesso.');
      setForm({ colaborador_id: '', colaborador_nome: '', ferramenta_id: '', quantidade: 1, previsao_devolucao: '', observacao: '' });
      setBuscaColaborador('');
    } catch (error) {
      setErro(error?.response?.data?.erro || 'Erro ao registrar retirada.');
    }
  };

  return (
    <AlmoxarifadoLayout title="Retirada">
        {erro && <div className="alert alert-error">{erro}</div>}
        {sucesso && <div className="alert alert-success">{sucesso}</div>}

        <div className="card">
          <h2 className="card-header">Nova retirada</h2>
          <form onSubmit={salvar} className="grid grid-2" style={{ gap: 12 }}>
            <div>
              <label className="form-label">Pessoa cadastrada</label>
              <input
                className="form-input"
                placeholder="Buscar por nome ou ID"
                list="colaboradores-retirada-list"
                value={buscaColaborador}
                onChange={(e) => {
                  const valor = e.target.value;
                  setBuscaColaborador(valor);

                  const encontrado = resolverColaboradorPorTexto(valor);
                  setForm((prev) => ({
                    ...prev,
                    colaborador_id: encontrado ? encontrado.id : ''
                  }));
                }}
              />
              <datalist id="colaboradores-retirada-list">
                {colaboradoresFiltrados.map((c) => (
                  <option key={c.id} value={formatarOpcaoColaborador(c)} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="form-label">Colaborador (nome manual, opcional)</label>
              <input className="form-input" value={form.colaborador_nome} onChange={(e) => setForm({ ...form, colaborador_nome: e.target.value })} />
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
