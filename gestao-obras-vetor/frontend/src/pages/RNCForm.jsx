import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { createRNC, getUsuarios, getRDOs } from '../services/api';
import { ArrowLeft, Save } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

function RNCForm() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const { success, error: notifyError } = useNotification();
  const [loading, setLoading] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [rdos, setRdos] = useState([]);
  const [erro, setErro] = useState('');
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
    setErro('');

    try {
      const dataToSend = {
        ...formData,
        projeto_id: parseInt(projetoId),
        responsavel_id: formData.responsavel_id ? parseInt(formData.responsavel_id) : null,
        rdo_id: formData.rdo_id ? parseInt(formData.rdo_id) : null
      };

      await createRNC(dataToSend);
      if (dataToSend.responsavel_id) {
        success('RNC criada e responsável notificado!');
      } else {
        success('RNC criada com sucesso!');
      }
      navigate(`/projeto/${projetoId}/rnc`);
    } catch (error) {
      console.error('Erro ao criar RNC:', error);
      const msg = error.response?.data?.erro || error.message || 'Erro ao criar RNC.';
      setErro(msg);
      notifyError(msg);
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

  const textWrapStyle = {
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
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
        {erro && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{erro}</div>}

        <div className="card" style={{ padding: '24px' }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Título</label>
              <input
                className="form-input"
                type="text"
                name="titulo"
                value={formData.titulo}
                onChange={handleChange}
                required
                placeholder="Ex.: Falha de execução em estacas"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Descrição</label>
              <textarea
                className="form-input"
                style={textWrapStyle}
                name="descricao"
                value={formData.descricao}
                onChange={handleChange}
                rows={5}
                required
                placeholder="Descreva a não conformidade observada"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Gravidade</label>
                <select
                  className="form-input"
                  name="gravidade"
                  value={formData.gravidade}
                  onChange={handleChange}
                  required
                >
                  <option value="Baixa">Baixa</option>
                  <option value="Média">Média</option>
                  <option value="Alta">Alta</option>
                  <option value="Crítica">Crítica</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Data prevista para encerramento</label>
                <input
                  className="form-input"
                  type="date"
                  name="data_prevista_encerramento"
                  value={formData.data_prevista_encerramento}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Origem</label>
                <select
                  className="form-input"
                  name="origem"
                  value={formData.origem}
                  onChange={handleChange}
                >
                  <option value="Execução">Execução</option>
                  <option value="Projeto">Projeto</option>
                  <option value="Material">Material</option>
                  <option value="Segurança">Segurança</option>
                  <option value="Meio Ambiente">Meio Ambiente</option>
                  <option value="Administrativo">Administrativo</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Responsável</label>
                <select
                  className="form-input"
                  name="responsavel_id"
                  value={formData.responsavel_id}
                  onChange={handleChange}
                >
                  <option value="">Selecione um responsável</option>
                  {usuarios.map((usuario) => (
                    <option key={usuario.id} value={usuario.id}>
                      {usuario.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">RDO Relacionado</label>
                <select
                  className="form-input"
                  name="rdo_id"
                  value={formData.rdo_id}
                  onChange={handleChange}
                >
                  <option value="">Selecione um RDO</option>
                  {rdos.map((rdo) => (
                    <option key={rdo.id} value={rdo.id}>
                      {rdo.data_relatorio} - {rdo.dia_semana}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Área/Local afetado</label>
              <input
                className="form-input"
                type="text"
                name="area_afetada"
                value={formData.area_afetada}
                onChange={handleChange}
                placeholder="Ex.: Bloco A - Pavimento 2"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Norma/Referência aplicável</label>
              <input
                className="form-input"
                type="text"
                name="norma_referencia"
                value={formData.norma_referencia}
                onChange={handleChange}
                placeholder="Ex.: NR-18, Projeto Executivo v3"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Registros fotográficos</label>
              <textarea
                className="form-input"
                style={textWrapStyle}
                name="registros_fotograficos"
                value={formData.registros_fotograficos}
                onChange={handleChange}
                rows={3}
                placeholder="Links ou descrição dos registros fotográficos relacionados"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Ação Corretiva</label>
              <textarea
                className="form-input"
                style={textWrapStyle}
                name="acao_corretiva"
                value={formData.acao_corretiva}
                onChange={handleChange}
                rows={3}
                placeholder="Descreva a ação corretiva proposta"
              />
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