import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getAtividadesEAP, createAtividade, updateAtividade } from '../services/api';
import { useDialog } from '../context/DialogContext';
import { ArrowLeft, Save, Info, Layers3, GitBranchPlus } from 'lucide-react';
import './EAPForm.css';

function EAPForm() {
  const { projetoId, atividadeId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { confirm } = useDialog();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [atividades, setAtividades] = useState([]);
  const [formData, setFormData] = useState({
    codigo_eap: '',
    nome: '',
    descricao: '',
    peso_percentual_projeto: '',
    data_inicio_planejada: '',
    data_fim_planejada: '',
    pai_id: '',
    unidade_medida: '',
    quantidade_total: ''
  });

  useEffect(() => {
    carregarAtividades();
    if (atividadeId) {
      carregarAtividade();
    } else {
      // Se não é edição, verificar se há pai_id nos parâmetros da URL
      const paiId = searchParams.get('pai');
      if (paiId) {
        setFormData(prev => ({ ...prev, pai_id: paiId }));
        // Gerar código EAP automaticamente para atividade filha
        gerarCodigoEAPFilha(paiId);
      }
    }
  }, [projetoId, atividadeId, searchParams]);

  const gerarCodigoEAPFilha = (paiId) => {
    if (!paiId || !atividades.length) return;

    const atividadePai = atividades.find(a => a.id == paiId);
    if (!atividadePai) return;

    // Encontrar todas as atividades filhas do pai
    const atividadesFilhas = atividades.filter(a => a.pai_id == paiId);

    // Extrair os códigos EAP das filhas e converter para números
    const codigosFilhas = atividadesFilhas
      .map(a => parseFloat(a.codigo_eap))
      .filter(num => !isNaN(num))
      .sort((a, b) => a - b);

    // Encontrar o próximo número disponível
    let proximoNumero = 1;
    for (let i = 0; i < codigosFilhas.length; i++) {
      if (codigosFilhas[i] === proximoNumero) {
        proximoNumero++;
      } else {
        break;
      }
    }

    // Gerar código EAP baseado no pai
    const codigoPai = atividadePai.codigo_eap;
    const novoCodigo = `${codigoPai}.${proximoNumero}`;

    setFormData(prev => ({ ...prev, codigo_eap: novoCodigo }));
  };

  const carregarAtividades = async () => {
    try {
      const response = await getAtividadesEAP(projetoId);
      setAtividades(response.data || []);

      // Após carregar atividades, verificar se há pai_id para gerar código EAP
      const paiId = searchParams.get('pai');
      if (paiId && !atividadeId) {
        setTimeout(() => gerarCodigoEAPFilha(paiId), 100);
      }
    } catch (error) {
      console.error('Erro ao carregar atividades:', error);
    }
  };

  const carregarAtividade = async () => {
    try {
      // Como não temos endpoint para buscar atividade específica, vamos buscar todas e filtrar
      const response = await getAtividadesEAP(projetoId);
      const atividade = response.data.find(a => a.id == atividadeId);
      if (atividade) {
        setFormData({
          codigo_eap: atividade.codigo_eap || '',
          nome: atividade.nome || '',
          descricao: atividade.descricao || '',
          peso_percentual_projeto: String(atividade.peso_percentual_projeto ?? atividade.percentual_previsto ?? ''),
          data_inicio_planejada: atividade.data_inicio_planejada || '',
          data_fim_planejada: atividade.data_fim_planejada || '',
          pai_id: atividade.pai_id || '',
          unidade_medida: atividade.unidade_medida || '',
          quantidade_total: String(atividade.quantidade_total ?? '')
        });
      }
    } catch (error) {
      console.error('Erro ao carregar atividade:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErro('');

    try {
      if (atividadeId) {
        const concorda = await confirm({
          title: 'Recalcular EAP',
          message: 'Ao alterar esta atividade da EAP, os RDOs relacionados serão recalculados (ajuste aplicado ao último RDO). Deseja continuar?',
          confirmText: 'Continuar',
          cancelText: 'Cancelar'
        });
        if (!concorda) { setLoading(false); return; }
      }
      const dataToSend = {
        ...formData,
        projeto_id: projetoId,
        pai_id: formData.pai_id || null,
        peso_percentual_projeto: formData.peso_percentual_projeto === ''
          ? (formData.pai_id ? undefined : 0)
          : Number(formData.peso_percentual_projeto),
        percentual_previsto: formData.peso_percentual_projeto === ''
          ? (formData.pai_id ? undefined : 0)
          : Number(formData.peso_percentual_projeto),
        quantidade_total: formData.quantidade_total === '' ? null : Number(formData.quantidade_total)
      };

      if (atividadeId) {
        await updateAtividade(atividadeId, dataToSend);
      } else {
        await createAtividade(dataToSend);
      }

      navigate(`/projeto/${projetoId}/eap`);
    } catch (error) {
      console.error('Erro ao salvar atividade:', error);
      setErro(error?.response?.data?.erro || 'Erro ao salvar atividade. Verifique os campos e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newData = {
        ...prev,
        [name]: value
      };

      // Se mudou a atividade pai, gerar novo código EAP
      if (name === 'pai_id' && value && !atividadeId) {
        // Usar setTimeout para garantir que o estado foi atualizado
        setTimeout(() => gerarCodigoEAPFilha(value), 0);
      }

      return newData;
    });
  };

  const atividadesPai = atividades.filter(a => !a.pai_id);
  const isAtividadePai = !formData.pai_id;

  return (
    <>
      <Navbar />
      <div className="container eap-form-page">
        <div className="eap-form-header">
          <button className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}/eap`)}>
            <ArrowLeft size={16} />
          </button>
          <h1>{atividadeId ? 'Editar Atividade' : 'Nova Atividade'} - EAP</h1>
        </div>

        <div className="eap-form-layout">
          <div className="card eap-form-card">
            {erro && <div className="alert alert-error eap-form-alert">{erro}</div>}

            <div className="eap-form-mode">
              <span className={`eap-mode-badge ${isAtividadePai ? 'is-parent' : 'is-child'}`}>
                {isAtividadePai ? 'Criando atividade pai (raiz)' : 'Criando atividade filha'}
              </span>
              <p>
                {isAtividadePai
                  ? 'Use atividades pai para organizar os grandes blocos do cronograma.'
                  : 'Atividades filhas detalham o escopo e alimentam o avanço físico do projeto.'}
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="eap-field">
                <label className="eap-label">
                  Código EAP e Nome da Atividade
                </label>
                <div className="eap-grid-code-name">
                  <input
                    type="text"
                    name="codigo_eap"
                    value={formData.codigo_eap}
                    onChange={handleChange}
                    required
                    placeholder="Ex: 2.1"
                    className="eap-input"
                  />
                  <input
                    type="text"
                    name="nome"
                    value={formData.nome}
                    onChange={handleChange}
                    required
                    placeholder="Ex: Lançamento de módulos"
                    className="eap-input"
                  />
                </div>
              </div>

              <div className="eap-field">
                <label className="eap-label">
                  Descrição (opcional)
                </label>
                <textarea
                  name="descricao"
                  value={formData.descricao}
                  onChange={handleChange}
                  rows={3}
                  className="eap-input eap-textarea"
                />
              </div>

              <div className="eap-grid-2">
                <div className="eap-field">
                  <label className="eap-label">
                    Data Início Planejada {isAtividadePai ? '(opcional para atividade pai)' : '*'}
                  </label>
                  <input
                    type="date"
                    name="data_inicio_planejada"
                    value={formData.data_inicio_planejada}
                    onChange={handleChange}
                    required={!isAtividadePai}
                    className="eap-input"
                  />
                </div>

                <div className="eap-field">
                  <label className="eap-label">
                    Data Fim Planejada {isAtividadePai ? '(opcional para atividade pai)' : '*'}
                  </label>
                  <input
                    type="date"
                    name="data_fim_planejada"
                    value={formData.data_fim_planejada}
                    onChange={handleChange}
                    required={!isAtividadePai}
                    className="eap-input"
                  />
                </div>
              </div>

              <div className="eap-field">
                <label className="eap-label">
                  Atividade Pai (opcional)
                </label>
                <select
                  name="pai_id"
                  value={formData.pai_id}
                  onChange={handleChange}
                  className="eap-input"
                >
                  <option value="">Nenhuma (atividade raiz)</option>
                  {atividadesPai.map(atividade => (
                    <option key={atividade.id} value={atividade.id}>
                      {atividade.codigo_eap} - {atividade.nome || atividade.descricao || 'Sem descrição'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="eap-grid-2">
                <div className="eap-field">
                  <label className="eap-label">
                    Unidade de Medida
                  </label>
                  <input
                    type="text"
                    name="unidade_medida"
                    value={formData.unidade_medida}
                    onChange={handleChange}
                    placeholder="Ex: m², m³, un, etc."
                    className="eap-input"
                  />
                </div>

                <div className="eap-field">
                  <label className="eap-label">
                    Quantidade Total
                  </label>
                  <input
                    type="number"
                    name="quantidade_total"
                    value={formData.quantidade_total}
                    onChange={handleChange}
                    step="0.01"
                    className="eap-input"
                  />
                </div>
              </div>

              {/* Removidos campos de unidade base/metros/volume; manter apenas quantidade total e unidade de medida */}

              <div className="eap-field eap-field-last">
                <label className="eap-label">
                  Peso Percentual no Projeto (%) {isAtividadePai ? '(opcional para atividade pai)' : '*'}
                </label>
                <input
                  type="number"
                  name="peso_percentual_projeto"
                  value={formData.peso_percentual_projeto}
                  onChange={handleChange}
                  min="0"
                  max="100"
                  step="0.1"
                  required={!isAtividadePai}
                  className="eap-input"
                />
              </div>

              <div className="eap-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  <Save size={16} />
                  {loading ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate(`/projeto/${projetoId}/eap`)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>

          <aside className="card eap-info-card">
            <div className="eap-info-header">
              <Info size={18} />
              <h2>Como montar sua EAP</h2>
            </div>
            <p className="eap-info-intro">
              Use este guia rápido para criar a estrutura corretamente e manter o cronograma organizado.
            </p>

            <div className="eap-info-block">
              <div className="eap-info-block-title">
                <Layers3 size={16} />
                <strong>Atividade pai (raiz)</strong>
              </div>
              <ol>
                <li>Deixe o campo Atividade Pai como Nenhuma (atividade raiz).</li>
                <li>Cadastre o Código EAP principal (ex.: 2.1) e um nome claro.</li>
                <li>Se quiser, deixe datas e peso para detalhar nas atividades filhas.</li>
              </ol>
            </div>

            <div className="eap-info-block">
              <div className="eap-info-block-title">
                <GitBranchPlus size={16} />
                <strong>Atividade filha</strong>
              </div>
              <ol>
                <li>Selecione a Atividade Pai no campo correspondente.</li>
                <li>O código da filha é sugerido automaticamente (ex.: 2.1.1).</li>
                <li>Preencha datas e peso da filha para controle do avanço físico.</li>
              </ol>
            </div>

            <p className="eap-info-tip">
              Dica: comece pelas atividades pai e depois detalhe as filhas para evitar retrabalho.
            </p>
          </aside>
        </div>
      </div>
    </>
  );
}

export default EAPForm;