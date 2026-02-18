import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getAtividadesEAP, createAtividade, updateAtividade } from '../services/api';
import { ArrowLeft, Save } from 'lucide-react';

function EAPForm() {
  const { projetoId, atividadeId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [atividades, setAtividades] = useState([]);
  const [formData, setFormData] = useState({
    codigo_eap: '',
    descricao: '',
    percentual_previsto: 0,
    pai_id: '',
    unidade_medida: '',
    quantidade_total: 0
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
          descricao: atividade.descricao || '',
          percentual_previsto: atividade.percentual_previsto || 0,
          pai_id: atividade.pai_id || '',
          unidade_medida: atividade.unidade_medida || '',
          quantidade_total: atividade.quantidade_total || 0
        });
      }
    } catch (error) {
      console.error('Erro ao carregar atividade:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (atividadeId) {
        const concorda = window.confirm('Ao alterar esta atividade da EAP, os RDOs relacionados serão recalculados (ajuste aplicado ao último RDO). Deseja continuar?');
        if (!concorda) { setLoading(false); return; }
      }
      const dataToSend = {
        ...formData,
        projeto_id: projetoId,
        pai_id: formData.pai_id || null
      };

      if (atividadeId) {
        await updateAtividade(atividadeId, dataToSend);
      } else {
        await createAtividade(dataToSend);
      }

      navigate(`/projeto/${projetoId}/eap`);
    } catch (error) {
      console.error('Erro ao salvar atividade:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newData = {
        ...prev,
        [name]: (['percentual_previsto','quantidade_total'].includes(name)) ? parseFloat(value) || 0 : value
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

  return (
    <>
      <Navbar />
      <div className="container" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <button className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}/eap`)}>
            <ArrowLeft size={16} />
          </button>
          <h1>{atividadeId ? 'Editar Atividade' : 'Nova Atividade'} - EAP</h1>
        </div>

        <div className="card" style={{ padding: '24px', maxWidth: '600px' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                Código EAP *
              </label>
              <input
                type="text"
                name="codigo_eap"
                value={formData.codigo_eap}
                onChange={handleChange}
                required
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                Descrição *
              </label>
              <textarea
                name="descricao"
                value={formData.descricao}
                onChange={handleChange}
                required
                rows={3}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                Atividade Pai (opcional)
              </label>
              <select
                name="pai_id"
                value={formData.pai_id}
                onChange={handleChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              >
                <option value="">Nenhuma (atividade raiz)</option>
                {atividadesPai.map(atividade => (
                  <option key={atividade.id} value={atividade.id}>
                    {atividade.codigo_eap} - {atividade.descricao}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                Unidade de Medida
              </label>
              <input
                type="text"
                name="unidade_medida"
                value={formData.unidade_medida}
                onChange={handleChange}
                placeholder="Ex: m², m³, un, etc."
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                Quantidade Total
              </label>
              <input
                type="number"
                name="quantidade_total"
                value={formData.quantidade_total}
                onChange={handleChange}
                step="0.01"
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>

            {/* Removidos campos de unidade base/metros/volume; manter apenas quantidade total e unidade de medida */}

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                Percentual Previsto (%)
              </label>
              <input
                type="number"
                name="percentual_previsto"
                value={formData.percentual_previsto}
                onChange={handleChange}
                min="0"
                max="100"
                step="0.1"
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
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
      </div>
    </>
  );
}

export default EAPForm;