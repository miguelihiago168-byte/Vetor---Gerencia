import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { createRNC, getUsuarios, getRDOs } from '../services/api';
import { ArrowLeft, Save } from 'lucide-react';

function RNCForm() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [rdos, setRdos] = useState([]);
  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    gravidade: 'Baixa',
    acao_corretiva: '',
    responsavel_id: '',
    rdo_id: '',
    projeto_id: projetoId,
    data_prevista_encerramento: '',
    origem: 'Execução',
    area_afetada: '',
    norma_referencia: '',
    registros_fotograficos: ''
  });

  useEffect(() => {
    const carregarDados = async () => {
      try {
        const [usuariosRes, rdosRes] = await Promise.all([
          getUsuarios(),
          getRDOs(projetoId)
        ]);
        setUsuarios(usuariosRes.data || []);
        setRdos(rdosRes.data || []);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      }
    };
    carregarDados();
  }, [projetoId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const dataToSend = {
        ...formData,
        projeto_id: parseInt(projetoId),
        responsavel_id: formData.responsavel_id ? parseInt(formData.responsavel_id) : null,
        rdo_id: formData.rdo_id ? parseInt(formData.rdo_id) : null
      };

      await createRNC(dataToSend);
      navigate(`/projeto/${projetoId}/rnc`);
    } catch (error) {
      console.error('Erro ao criar RNC:', error);
      alert('Erro ao criar RNC: ' + (error.response?.data?.erro || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <>
      <Navbar />
      <div className="container" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <button className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}/rnc`)}>
            <ArrowLeft size={16} />
          </button>
          <h1>Nova RNC</h1>
        </div>

        <div className="card" style={{ padding: '24px', maxWidth: '600px' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                Título *
              </label>
              <input
                type="text"
                name="titulo"
                value={formData.titulo}
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
                rows={5}
                required
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                Gravidade *
              </label>
              <select
                name="gravidade"
                value={formData.gravidade}
                onChange={handleChange}
                required
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              >
                <option value="Baixa">Baixa</option>
                <option value="Média">Média</option>
                <option value="Alta">Alta</option>
                <option value="Crítica">Crítica</option>
              </select>
            </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                  Data prevista para encerramento *
                </label>
                <input
                  type="date"
                  name="data_prevista_encerramento"
                  value={formData.data_prevista_encerramento}
                  onChange={handleChange}
                  required
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                  Origem
                </label>
                <select
                  name="origem"
                  value={formData.origem}
                  onChange={handleChange}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                >
                  <option value="Execução">Execução</option>
                  <option value="Projeto">Projeto</option>
                  <option value="Material">Material</option>
                  <option value="Segurança">Segurança</option>
                  <option value="Meio Ambiente">Meio Ambiente</option>
                  <option value="Administrativo">Administrativo</option>
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                  Área/Local afetado
                </label>
                <input
                  type="text"
                  name="area_afetada"
                  value={formData.area_afetada}
                  onChange={handleChange}
                  placeholder="Ex.: Bloco A - Pavimento 2"
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                  Norma/Referência aplicável
                </label>
                <input
                  type="text"
                  name="norma_referencia"
                  value={formData.norma_referencia}
                  onChange={handleChange}
                  placeholder="Ex.: NR-18, Projeto Executivo v3"
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                  Registros fotográficos
                </label>
                <textarea
                  name="registros_fotograficos"
                  value={formData.registros_fotograficos}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Links ou descrição dos registros fotográficos relacionados"
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                Ação Corretiva
              </label>
              <textarea
                name="acao_corretiva"
                value={formData.acao_corretiva}
                onChange={handleChange}
                rows={3}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                placeholder="Descreva a ação corretiva proposta"
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                Responsável
              </label>
              <select
                name="responsavel_id"
                value={formData.responsavel_id}
                onChange={handleChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              >
                <option value="">Selecione um responsável</option>
                {usuarios.map((usuario) => (
                  <option key={usuario.id} value={usuario.id}>
                    {usuario.nome}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                RDO Relacionado
              </label>
              <select
                name="rdo_id"
                value={formData.rdo_id}
                onChange={handleChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              >
                <option value="">Selecione um RDO (opcional)</option>
                {rdos.map((rdo) => (
                  <option key={rdo.id} value={rdo.id}>
                    {rdo.data_relatorio} - {rdo.dia_semana}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                <Save size={16} />
                {loading ? 'Criando...' : 'Criar RNC'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate(`/projeto/${projetoId}/rnc`)}
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

export default RNCForm;