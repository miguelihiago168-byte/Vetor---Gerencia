import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  getEmailConfig,
  saveEmailConfig,
  testEmailConfig
} from '../services/api';
import { Mail, Check, AlertCircle, Loader } from 'lucide-react';
import '../styles/EmailSetup.css';

const SMTP_PRESETS = {
  google: {
    provider: 'Google',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    example: 'seu-email@gmail.com'
  },
  microsoft: {
    provider: 'Microsoft',
    smtp_host: 'smtp.outlook.com',
    smtp_port: 587,
    example: 'seu-email@outlook.com'
  },
  custom: {
    provider: 'Outro',
    smtp_host: '',
    smtp_port: 587,
    example: ''
  }
};

function EmailSetup() {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  
  const [selectedPreset, setSelectedPreset] = useState('google');
  const [formData, setFormData] = useState({
    provider: 'Google',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_user: '',
    smtp_pass: '',
    from_name: '',
    from_email: ''
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    try {
      setLoading(true);
      const response = await getEmailConfig();
      
      if (response && response.data) {
        const config = response.data;
        setFormData({
          provider: config.provider || 'Google',
          smtp_host: config.smtp_host || '',
          smtp_port: config.smtp_port || 587,
          smtp_user: config.smtp_user || '',
          smtp_pass: '', // Nunca carrega a senha por segurança
          from_name: config.from_name || '',
          from_email: config.from_email || ''
        });

        // Detectar preset
        if (config.smtp_host === 'smtp.gmail.com') {
          setSelectedPreset('google');
        } else if (config.smtp_host === 'smtp.outlook.com') {
          setSelectedPreset('microsoft');
        } else {
          setSelectedPreset('custom');
        }
      }
    } catch (error) {
      console.error('Erro ao carregar configuração:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePresetChange = (presetKey) => {
    setSelectedPreset(presetKey);
    const preset = SMTP_PRESETS[presetKey];
    setFormData(prev => ({
      ...prev,
      provider: preset.provider,
      smtp_host: preset.smtp_host,
      smtp_port: preset.smtp_port
    }));
    setTestResult(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'smtp_port' ? Number(value) : value
    }));
    setTestResult(null);
  };

  const handleTestConnection = async (e) => {
    e.preventDefault();
    
    if (!formData.smtp_host || !formData.smtp_user || !formData.smtp_pass) {
      showNotification('Preencha todos os campos SMTP para testar', 'error');
      return;
    }

    try {
      setTesting(true);
      const response = await testEmailConfig({
        smtp_host: formData.smtp_host,
        smtp_port: formData.smtp_port,
        smtp_user: formData.smtp_user,
        smtp_pass: formData.smtp_pass
      });

      setTestResult({
        success: response.success,
        message: response.message
      });

      if (response.success) {
        showNotification('Conexão SMTP validada com sucesso!', 'success');
      } else {
        showNotification(`Erro na validação: ${response.message}`, 'error');
      }
    } catch (error) {
      console.error('Erro ao testar conexão:', error);
      setTestResult({
        success: false,
        message: error.response?.data?.message || 'Erro ao testar conexão'
      });
      showNotification('Erro ao testar configuração', 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfiguration = async (e) => {
    e.preventDefault();

    if (!formData.smtp_pass) {
      showNotification('Informe a senha SMTP', 'error');
      return;
    }

    if (!formData.from_email) {
      showNotification('Informe o email de origem', 'error');
      return;
    }

    try {
      setSaving(true);
      await saveEmailConfig(formData);
      showNotification('Configuração salva com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      showNotification('Erro ao salvar configuração', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="email-setup-wrapper">
        <Navbar />
        <div className="email-setup-container">
          <div className="loading-spinner">
            <Loader className="spinning" size={32} />
            <p>Carregando configuração...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="email-setup-wrapper">
      <Navbar />
      <div className="email-setup-container">
        <div className="email-setup-header">
          <Mail size={32} />
          <h1>Configurar Servidor de Email</h1>
          <p>Configure as credenciais SMTP para enviar emails pelo sistema</p>
        </div>

        <form onSubmit={handleSaveConfiguration} className="email-setup-form">
          {/* Seletor de Provider */}
          <div className="form-section">
            <h3>Provedor de Email</h3>
            <div className="presets-grid">
              {Object.entries(SMTP_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  type="button"
                  className={`preset-button ${selectedPreset === key ? 'active' : ''}`}
                  onClick={() => handlePresetChange(key)}
                >
                  <div className="preset-name">{preset.provider}</div>
                  <div className="preset-hint">{preset.example}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Configuração SMTP */}
          <div className="form-section">
            <h3>Credenciais SMTP</h3>
            
            <div className="form-group">
              <label>Provider</label>
              <input
                type="text"
                name="provider"
                value={formData.provider}
                disabled
                className="form-input"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Host SMTP *</label>
                <input
                  type="text"
                  name="smtp_host"
                  value={formData.smtp_host}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="smtp.gmail.com"
                  required
                />
              </div>

              <div className="form-group">
                <label>Porta *</label>
                <input
                  type="number"
                  name="smtp_port"
                  value={formData.smtp_port}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="587"
                  required
                  min="1"
                  max="65535"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Email/Usuário SMTP *</label>
              <input
                type="email"
                name="smtp_user"
                value={formData.smtp_user}
                onChange={handleChange}
                className="form-input"
                placeholder="seu-email@gmail.com"
                required
              />
              <small className="form-hint">
                Para Gmail, use seu email completo ou crie uma <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer">senha de app</a>
              </small>
            </div>

            <div className="form-group">
              <label>Senha SMTP *</label>
              <input
                type="password"
                name="smtp_pass"
                value={formData.smtp_pass}
                onChange={handleChange}
                className="form-input"
                placeholder="••••••••"
                required
              />
              <small className="form-hint">
                Sua senha é criptografada antes de salvar no banco
              </small>
            </div>
          </div>

          {/* Email de Origem */}
          <div className="form-section">
            <h3>Email de Origem</h3>
            
            <div className="form-group">
              <label>Nome do Remetente *</label>
              <input
                type="text"
                name="from_name"
                value={formData.from_name}
                onChange={handleChange}
                className="form-input"
                placeholder="Gestão de Obras"
                required
              />
            </div>

            <div className="form-group">
              <label>Email do Remetente *</label>
              <input
                type="email"
                name="from_email"
                value={formData.from_email}
                onChange={handleChange}
                className="form-input"
                placeholder="seu-email@gmail.com"
                required
              />
              <small className="form-hint">
                Este deve ser o mesmo email usado nas credenciais SMTP acima
              </small>
            </div>
          </div>

          {/* Resultado do Teste */}
          {testResult && (
            <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
              <div className="test-result-icon">
                {testResult.success ? <Check size={20} /> : <AlertCircle size={20} />}
              </div>
              <div className="test-result-message">
                {testResult.message}
              </div>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="form-actions">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || saving}
              className="btn-secondary"
            >
              {testing ? (
                <>
                  <Loader size={18} className="spinning" />
                  Testando...
                </>
              ) : (
                'Testar Conexão'
              )}
            </button>

            <button
              type="submit"
              disabled={saving || testing}
              className="btn-primary"
            >
              {saving ? (
                <>
                  <Loader size={18} className="spinning" />
                  Salvando...
                </>
              ) : (
                'Salvar Configuração'
              )}
            </button>
          </div>
        </form>

        {/* Informações de Ajuda */}
        <div className="help-section">
          <h3>Ajuda</h3>
          <div className="help-content">
            <h4>Gmail</h4>
            <ul>
              <li>Use seu email do Gmail na porta 587</li>
              <li>Se usar 2FA, crie uma <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer">senha de app</a></li>
            </ul>

            <h4>Outlook / Hotmail</h4>
            <ul>
              <li>Host: smtp.outlook.com, Porta: 587</li>
              <li>Use seu email completo como usuário</li>
            </ul>

            <h4>Servidor Customizado</h4>
            <ul>
              <li>Informe o host SMTP do seu servidor</li>
              <li>Geralmente a porta é 587 (TLS) ou 465 (SSL)</li>
              <li>Solicite as credenciais ao administrador do servidor</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EmailSetup;
