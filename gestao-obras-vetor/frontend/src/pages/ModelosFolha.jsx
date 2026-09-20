import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, FilePlus2, RefreshCw } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { createModeloFolha, getModelosFolha } from '../services/api';
import './FolhasVerificacao.css';
import './ModelosFolha.css';

const emptyForm = { codigo: '', nome: '', tipo_folha: 'MONTAGEM', categoria_id: '' };

const MODEL_GUIDES = {
  MONTAGEM: {
    description: 'Modelo padrão para inspeção da montagem de estruturas.',
    example: 'String 01_02_03 | Inversor 01 | montagem conforme projeto, alinhamento e fixadores verificados.',
    steps: [
      'Identifique obra, lote, atividade EAP e área da inspeção.',
      'Informe população e amostra prevista.',
      'Para cada estrutura, marque Conforme, Não conforme ou Não aplicável com justificativa.',
      'Anexe fotos e documentos quando forem necessários para comprovar o resultado.',
      'Assine como executante e inspetor e envie para aprovação.'
    ]
  },
  TORQUE: {
    description: 'Modelo padrão para controle de torque e rastreabilidade do instrumento.',
    example: 'Parafuso M12 | nominal 75 N·m | limites 71,25 a 78,75 N·m | medição 75 N·m = Conforme.',
    steps: [
      'Informe fixador, torque nominal, tolerância, documento e revisão.',
      'Selecione o torquímetro e confira faixa de operação e validade da calibração.',
      'Registre um ponto para cada local e informe o valor medido em N·m.',
      'O sistema compara a medição com os limites e sinaliza o resultado.',
      'Anexe certificado de calibração, fotos e demais evidências antes da aprovação.'
    ]
  }
};

const parseConfig = (value) => {
  try { return typeof value === 'string' ? JSON.parse(value) : (value || {}); } catch { return {}; }
};

export default function ModelosFolha() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const [models, setModels] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getModelosFolha();
      const rows = Array.isArray(response.data) ? response.data : (Array.isArray(response.data?.data) ? response.data.data : []);
      setModels(rows);
      if (!form.categoria_id && rows[0]?.categoria_id) setForm((current) => ({ ...current, categoria_id: rows[0].categoria_id }));
    } catch (requestError) {
      setModels([]);
      setError(requestError.response?.data?.erro || 'Não foi possível carregar os modelos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.categoria_id) {
      setError('Nenhuma categoria de modelo está disponível para este ambiente.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const guide = MODEL_GUIDES[form.tipo_folha];
      await createModeloFolha({
        ...form,
        descricao: guide.description,
        categoria_id: Number(form.categoria_id),
        configuracao: { exemplo: guide.example, instrucoes: guide.steps }
      });
      setForm((current) => ({ ...emptyForm, categoria_id: current.categoria_id }));
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.erro || 'Não foi possível criar o modelo.');
    } finally {
      setSaving(false);
    }
  };

  return <>
    <Navbar />
    <main className="container folhas-page">
      <header className="folhas-header">
        <div>
          <p className="eyebrow">QUALIDADE / FOLHAS DE VERIFICAÇÃO</p>
          <h1>Modelos de folha</h1>
          <p>Configure os modelos usados para abrir folhas de montagem e torque.</p>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => navigate(`/projeto/${projetoId}/qualidade/folhas`)}><ArrowLeft size={16} /> Voltar às folhas</button>
          <button type="button" onClick={load} disabled={loading}><RefreshCw size={16} /> Atualizar</button>
        </div>
      </header>

      {error && <div className="folhas-error" role="alert">{error}</div>}

      <div className="models-layout">
        <form className="folha-form" onSubmit={submit}>
          <section>
            <h2><FilePlus2 size={18} /> Novo modelo</h2>
            <p className="measurement-guidance">O modelo é copiado para a folha como um snapshot e preserva o histórico da configuração utilizada.</p>
            <label>Código<input required value={form.codigo} onChange={(event) => setForm((current) => ({ ...current, codigo: event.target.value }))} placeholder="Ex.: FV-TOR-001" /></label>
            <label>Nome<input required value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} placeholder="Ex.: Folha de torque de estruturas" /></label>
            <label>Tipo<select value={form.tipo_folha} onChange={(event) => setForm((current) => ({ ...current, tipo_folha: event.target.value }))}><option value="MONTAGEM">Montagem de estruturas</option><option value="TORQUE">Controle de torque</option></select></label>
            <button className="btn-primary" disabled={saving || !form.categoria_id}>{saving ? 'Salvando…' : 'Criar modelo'}</button>
          </section>
        </form>

        <section className="folhas-list-card">
          <div className="folhas-list-head"><h2>Modelos disponíveis</h2><span>{models.length} modelo(s)</span></div>
          {loading ? <p className="folhas-empty">Carregando modelos…</p> : models.length === 0 ? <div className="folhas-empty"><p>Nenhum modelo disponível.</p><small>Verifique se a migration de Folhas de Verificação foi executada neste ambiente.</small></div> : models.map((model) => {
            const guide = MODEL_GUIDES[model.tipo_folha] || MODEL_GUIDES.MONTAGEM;
            const config = parseConfig(model.configuracao);
            const example = config.exemplo || guide.example;
            const steps = Array.isArray(config.instrucoes) && config.instrucoes.length ? config.instrucoes : guide.steps;
            return <article className="model-card model-card--expanded" key={model.id}>
              <div className="model-card-heading"><div><b>{model.codigo}</b><h3>{model.nome}</h3><span>{model.tipo_folha === 'TORQUE' ? 'Controle de torque' : 'Montagem de estruturas'} · Modelo disponível</span></div><span className="model-active-badge"><CheckCircle2 size={15} /> Disponível</span></div>
              <div className="model-guide"><div><strong>Exemplo preenchido</strong><p>{example}</p></div><div><strong>Como fazer</strong><ol>{steps.map((step) => <li key={step}>{step}</li>)}</ol></div></div>
            </article>;
          })}
        </section>
      </div>
      <section className="model-simulation">
        <h2>Simulação: como usar um modelo</h2>
        <ol>
          <li>Clique em <b>Voltar às folhas</b> e depois em <b>Nova folha</b>.</li>
          <li>Escolha o modelo de montagem ou controle de torque.</li>
          <li>Preencha obra, lote, atividade EAP, população e amostra prevista.</li>
          <li>Registre os pontos, medições, evidências e assinaturas.</li>
          <li>Quando a amostra estiver completa, envie para análise.</li>
        </ol>
        <p>O modelo permanece disponível. Cada folha criada recebe uma cópia da configuração utilizada, preservando o histórico mesmo que o modelo seja atualizado no futuro.</p>
      </section>
    </main>
  </>;
}
