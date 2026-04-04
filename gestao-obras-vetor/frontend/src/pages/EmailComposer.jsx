import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  sendEmail,
  getEmailTemplates,
  getUsuarios,
  getEmailConfig
} from '../services/api';
import { Mail, Send, Loader, ChevronDown, FileText } from 'lucide-react';
import '../styles/EmailComposer.css';

function EmailComposer() {
  const { user } = useAuth();
  const { showNotification } = useNotification();

  const [formData, setFormData] = useState({
    to_email: '',
    subject: '',
    html_body: '',
    template_name: ''
  });

  const [users, setUsers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [hasSmtpConfig, setHasSmtpConfig] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showUserList, setShowUserList] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);

      // Verificar se SMTP está configurado
      try {
        const configResponse = await getEmailConfig();
        setHasSmtpConfig(!!configResponse?.data);
      } catch (err) {
        setHasSmtpConfig(false);
      }

      // Carregar usuários
      const usersResponse = await getUsuarios();
      if (Array.isArray(usersResponse)) {
        setUsers(usersResponse.filter(u => u.email));
      }

      // Carregar templates
      const templatesResponse = await getEmailTemplates();
      if (templatesResponse?.data) {
        setTemplates(templatesResponse.data);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      showNotification('Erro ao carregar dados', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectUser = (userEmail) => {
    setFormData(prev => ({
      ...prev,
      to_email: userEmail
    }));
    setShowUserList(false);
  };

  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    setFormData(prev => ({
      ...prev,
      subject: template.subject,
      html_body: template.body_html,
      template_name: template.name
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSendEmail = async (e) => {
    e.preventDefault();

    if (!formData.to_email) {
      showNotification('Informe o email destinatário', 'error');
      return;
    }

    if (!formData.subject) {
      showNotification('Informe o assunto', 'error');
      return;
    }

    if (!formData.html_body) {
      showNotification('Informe o corpo do email', 'error');
      return;
    }

    try {
      setSending(true);
      const response = await sendEmail({
        to_email: formData.to_email,
        subject: formData.subject,
        html_body: formData.html_body,
        template_name: formData.template_name || null
      });

      if (response.success) {
        showNotification('Email enviado com sucesso!', 'success');
        setFormData({
          to_email: '',
          subject: '',
          html_body: '',
          template_name: ''
        });
        setSelectedTemplate(null);
      } else {
        showNotification(`Erro ao enviar: ${response.message}`, 'error');
      }
    } catch (error) {
      console.error('Erro ao enviar email:', error);
      showNotification('Erro ao enviar email', 'error');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="email-composer-wrapper">
        <Navbar />
        <div className="email-composer-container">
          <div className="loading-spinner">
            <Loader className="spinning" size={32} />
            <p>Carregando...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!hasSmtpConfig) {
    return (
      <div className="email-composer-wrapper">
        <Navbar />
        <div className="email-composer-container">
          <div className="alert alert-warning">
            <Mail size={24} />
            <div>
              <h3>Configuração Necessária</h3>
              <p>Configure o servidor de email antes de enviar mensagens.</p>
              <a href="/email-setup" className="btn-primary">
                Ir para Configuração
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="email-composer-wrapper">
      <Navbar />
      <div className="email-composer-container">
        <div className="composer-header">
          <Mail size={32} />
          <h1>Enviar Email</h1>
          <p>Compose e envie emails direto do sistema</p>
        </div>

        <form onSubmit={handleSendEmail} className="composer-form">
          {/* Templates */}
          {templates.length > 0 && (
            <div className="form-section templates-section">
              <h3>
                <FileText size={18} />
                Templates
              </h3>
              <div className="templates-list">
                {templates.map(template => (
                  <button
                    key={template.id}
                    type="button"
                    className={`template-card ${selectedTemplate?.id === template.id ? 'selected' : ''}`}
                    onClick={() => handleSelectTemplate(template)}
                  >
                    <div className="template-name">{template.name}</div>
                    <div className="template-subject">{template.subject}</div>
                    {template.description && (
                      <div className="template-description">{template.description}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Destinatário */}
          <div className="form-section">
            <label>Email Destinatário *</label>
            <div className="email-input-wrapper">
              <input
                type="email"
                name="to_email"
                value={formData.to_email}
                onChange={handleChange}
                className="form-input"
                placeholder="Informe o email destinatário"
                required
              />
              {users.length > 0 && (
                <div className="user-selector">
                  <button
                    type="button"
                    className="btn-select-user"
                    onClick={() => setShowUserList(!showUserList)}
                  >
                    <ChevronDown size={18} />
                  </button>
                  {showUserList && (
                    <div className="user-dropdown">
                      <input
                        type="text"
                        className="user-search"
                        placeholder="Buscar usuário..."
                        onChange={(e) => {
                          // Implementar filtro se necessário
                        }}
                      />
                      <div className="user-list">
                        {users.map(u => (
                          <button
                            key={u.id}
                            type="button"
                            className="user-item"
                            onClick={() => handleSelectUser(u.email)}
                          >
                            <div className="user-info">
                              <div className="user-name">{u.nome}</div>
                              <div className="user-email">{u.email}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Assunto */}
          <div className="form-section">
            <label>Assunto *</label>
            <input
              type="text"
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              className="form-input"
              placeholder="Assunto do email"
              required
            />
          </div>

          {/* Corpo do Email */}
          <div className="form-section">
            <label>Corpo do Email *</label>
            <textarea
              name="html_body"
              value={formData.html_body}
              onChange={handleChange}
              className="form-textarea"
              placeholder="Digite seu email aqui... Você pode usar HTML para formatação"
              rows="12"
              required
            />
            <small className="form-hint">
              Você pode usar HTML para formatação (ex: &lt;b&gt;, &lt;i&gt;, &lt;p&gt;, &lt;a href=&quot;...&quot;&gt;etc)
            </small>
          </div>

          {/* Preview */}
          {formData.html_body && (
            <div className="preview-section">
              <button
                type="button"
                className="btn-toggle-preview"
                onClick={() => setPreviewOpen(!previewOpen)}
              >
                {previewOpen ? 'Ocultar' : 'Mostrar'} Pré-visualização
              </button>

              {previewOpen && (
                <div className="email-preview">
                  <h4>Pré-visualização do Email</h4>
                  <div className="preview-content" dangerouslySetInnerHTML={{ __html: formData.html_body }} />
                </div>
              )}
            </div>
          )}

          {/* Botões de Ação */}
          <div className="form-actions">
            <button
              type="button"
              onClick={() => {
                setFormData({
                  to_email: '',
                  subject: '',
                  html_body: '',
                  template_name: ''
                });
                setSelectedTemplate(null);
              }}
              className="btn-secondary"
              disabled={sending}
            >
              Limpar
            </button>

            <button
              type="submit"
              disabled={sending}
              className="btn-primary"
            >
              {sending ? (
                <>
                  <Loader size={18} className="spinning" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send size={18} />
                  Enviar Email
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EmailComposer;
