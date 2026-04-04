import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReactQuill from 'react-quill';
import Navbar from '../components/Navbar';
import { useNotification } from '../context/NotificationContext';
import {
  getEmailConfig,
  saveEmailConfig,
  testEmailConfig,
  sendEmailFormData,
  uploadEmailInlineImage,
  getEmailHistory,
  getEmailTemplates,
  getUsuarios,
  getEmailSignature,
  updateEmailSignature
} from '../services/api';
import {
  Inbox,
  Send,
  Loader,
  Check,
  AlertCircle,
  ChevronDown,
  FileText,
  Settings,
  Eye,
  XCircle,
  CheckCircle,
  Mail,
  Trash2,
  Star,
  ShieldAlert,
  Paperclip,
  Image as ImageIcon,
  Save
} from 'lucide-react';
import 'react-quill/dist/quill.snow.css';
import '../styles/EmailDashboard.css';

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

const MENU_ITEMS = [
  { key: 'recebidos', label: 'Recebidos', icon: Inbox },
  { key: 'novo-email', label: 'Novo Email', icon: Send },
  { key: 'enviado', label: 'Enviados', icon: CheckCircle },
  { key: 'importantes', label: 'Importantes', icon: AlertCircle },
  { key: 'favoritos', label: 'Favoritos', icon: Star },
  { key: 'spam', label: 'Spam', icon: ShieldAlert },
  { key: 'lixeira', label: 'Lixeira', icon: Trash2 },
  { key: 'erros', label: 'Erros', icon: XCircle },
  { key: 'configuracoes', label: 'Configurações', icon: Settings }
];

const VALID_TABS = new Set(MENU_ITEMS.map((item) => item.key));
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ACCEPTED_ATTACHMENTS = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg';

const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link', 'image'],
    ['clean']
  ]
};

function resolveSmtpErrorMsg(msg) {
  const m = msg || '';
  // Gmail: senha de app obrigatória (conta com 2FA)
  if (m.includes('534') && m.includes('Application-specific password required')) {
    return '⚠️ Autenticação falhou: sua conta Gmail exige Senha de App. Vá em Configurações → insira a Senha de App → clique SALVAR → e tente enviar novamente.\n\nComo criar a Senha de App: Conta Google → Segurança → Verificação em 2 etapas → Senhas de app.';
  }
  // Gmail: credenciais recusadas
  if ((m.includes('535') || m.includes('534')) && (m.includes('BadCredentials') || m.includes('Username and Password not accepted') || m.includes('InvalidSecondFactor'))) {
    return '⚠️ Credenciais recusadas pelo Gmail. Se sua conta tem verificação em 2 etapas, crie uma Senha de App e salve nas Configurações antes de enviar.';
  }
  // Outlook/Hotmail: autenticação básica desativada
  if ((m.includes('535') || m.includes('534')) && (m.includes('basic authentication is disabled') || m.includes('Basic Auth'))) {
    return '⚠️ O Outlook/Hotmail desativou a autenticação básica. Crie uma Senha de App em conta.microsoft.com → Segurança → Segurança avançada → Senhas de app.';
  }
  if (m.includes('535') || m.includes('534')) {
    return `⚠️ Autenticação recusada — se sua conta tem 2 fatores ativado, use uma Senha de App salva nas Configurações. Detalhe: ${m}`;
  }
  if (!m) return 'Erro ao enviar email';
  return `Erro na conexão SMTP: ${m}`;
}

function EmailDashboard() {
  const { showNotification } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialParamTab = searchParams.get('tab');
  const initialTab = VALID_TABS.has(initialParamTab) ? initialParamTab : 'recebidos';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [selectedPreset, setSelectedPreset] = useState('google');
  const [configFormData, setConfigFormData] = useState({
    provider: 'Google',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_user: '',
    smtp_pass: '',
    from_name: '',
    from_email: ''
  });
  const [composerFormData, setComposerFormData] = useState({
    to_email: '',
    subject: '',
    html_body: '',
    template_name: ''
  });
  const [attachments, setAttachments] = useState([]);
  const [signatureData, setSignatureData] = useState({
    email_signature_html: '',
    email_signature_auto: 1
  });

  const [emailsSent, setEmailsSent] = useState([]);
  const [emailsErrors, setEmailsErrors] = useState([]);
  const [allHistory, setAllHistory] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingConfig, setTestingConfig] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showUserList, setShowUserList] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const quillRef = useRef(null);
  const imageInputRef = useRef(null);

  useEffect(() => {
    setSearchParams({ tab: activeTab }, { replace: true });
  }, [activeTab, setSearchParams]);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (
      activeTab === 'enviado' ||
      activeTab === 'erros' ||
      activeTab === 'recebidos' ||
      activeTab === 'importantes' ||
      activeTab === 'favoritos' ||
      activeTab === 'spam' ||
      activeTab === 'lixeira'
    ) {
      loadEmailHistory();
    }
  }, [activeTab]);

  const emailsReceived = useMemo(() => {
    const localUserMail = (configFormData.from_email || '').trim().toLowerCase();
    if (!localUserMail) return [];
    return allHistory.filter((email) => (email.recipient_email || '').toLowerCase() === localUserMail);
  }, [allHistory, configFormData.from_email]);

  const loadInitialData = async () => {
    try {
      setLoading(true);

      try {
        const configResponse = await getEmailConfig();
        const config = configResponse?.data?.data;
        if (config) {
          setConfigFormData({
            provider: config.provider || 'Google',
            smtp_host: config.smtp_host || '',
            smtp_port: config.smtp_port || 587,
            smtp_user: config.smtp_user || '',
            smtp_pass: '',
            from_name: config.from_name || '',
            from_email: config.from_email || ''
          });

          if (config.smtp_host === 'smtp.gmail.com') {
            setSelectedPreset('google');
          } else if (config.smtp_host === 'smtp.outlook.com') {
            setSelectedPreset('microsoft');
          } else {
            setSelectedPreset('custom');
          }
        }
      } catch {
        // sem configuracao salva
      }

      const usersResponse = await getUsuarios();
      const usersData = Array.isArray(usersResponse?.data) ? usersResponse.data : [];
      if (usersData.length) {
        setUsers(usersData.filter((u) => u.email));
      }

      const templatesResponse = await getEmailTemplates();
      const templatesData = templatesResponse?.data?.data;
      if (Array.isArray(templatesData)) {
        setTemplates(templatesData);
      }

      try {
        const signatureResponse = await getEmailSignature();
        const signaturePayload = signatureResponse?.data?.data;
        if (signaturePayload) {
          setSignatureData({
            email_signature_html: signaturePayload.email_signature_html || '',
            email_signature_auto: signaturePayload.email_signature_auto === 0 ? 0 : 1
          });
        }
      } catch {
        // sem assinatura cadastrada
      }

      await loadEmailHistory();
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEmailHistory = async () => {
    try {
      setLoadingHistory(true);
      const response = await getEmailHistory({ limit: 100 });
      const data = response?.data?.data;
      if (Array.isArray(data)) {
        setAllHistory(data);
        setEmailsSent(data.filter((e) => e.status === 'ENVIADO'));
        setEmailsErrors(data.filter((e) => e.status === 'ERRO'));
      }
    } catch (error) {
      console.error('Erro ao carregar historico:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handlePresetChange = (presetKey) => {
    setSelectedPreset(presetKey);
    const preset = SMTP_PRESETS[presetKey];
    setConfigFormData((prev) => ({
      ...prev,
      provider: preset.provider,
      smtp_host: preset.smtp_host,
      smtp_port: preset.smtp_port
    }));
    setTestResult(null);
  };

  const handleConfigChange = (e) => {
    const { name, value } = e.target;
    setConfigFormData((prev) => ({
      ...prev,
      [name]: name === 'smtp_port' ? Number(value) : value
    }));
    setTestResult(null);
  };

  const handleTestConnection = async (e) => {
    e.preventDefault();

    if (!configFormData.smtp_host || !configFormData.smtp_user || !configFormData.smtp_pass) {
      showNotification('Preencha todos os campos SMTP para testar', 'error');
      return;
    }

    try {
      setTestingConfig(true);
      const response = await testEmailConfig({
        smtp_host: configFormData.smtp_host,
        smtp_port: configFormData.smtp_port,
        smtp_user: configFormData.smtp_user,
        smtp_pass: configFormData.smtp_pass
      });
      const payload = response?.data || {};

      setTestResult({ success: payload.success, message: payload.message });
      if (payload.success) {
        showNotification('Conexão SMTP validada com sucesso!', 'success');
      } else {
        const msg = payload.message || '';
        const friendlyMsg = resolveSmtpErrorMsg(msg);
        showNotification(friendlyMsg, 'error');
      }
    } catch (error) {
      const errMsg = error.response?.data?.message || 'Erro ao testar conexão';
      setTestResult({ success: false, message: errMsg });
      showNotification(resolveSmtpErrorMsg(errMsg), 'error');
    } finally {
      setTestingConfig(false);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();

    if (!configFormData.smtp_pass) {
      showNotification('Informe a senha SMTP', 'error');
      return;
    }

    if (!configFormData.from_email) {
      showNotification('Informe o email de origem', 'error');
      return;
    }

    try {
      setSavingConfig(true);
      await saveEmailConfig(configFormData);
      showNotification('Configuração salva com sucesso', 'success');
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      const mensagem = error?.response?.data?.message || error?.response?.data?.error || 'Erro ao salvar configuração';
      showNotification(mensagem, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    setComposerFormData((prev) => ({
      ...prev,
      subject: template.subject,
      html_body: template.body_html,
      template_name: template.name
    }));
  };

  const handleComposerChange = (e) => {
    const { name, value } = e.target;
    setComposerFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditorChange = (value) => {
    setComposerFormData((prev) => ({ ...prev, html_body: value }));
  };

  const handleAttachmentChange = (event) => {
    const selected = Array.from(event.target.files || []);
    if (!selected.length) return;

    const oversized = selected.find((file) => file.size > MAX_ATTACHMENT_BYTES);
    if (oversized) {
      showNotification(`O arquivo ${oversized.name} excede 5 MB`, 'error');
      event.target.value = '';
      return;
    }

    setAttachments((prev) => [...prev, ...selected]);
    event.target.value = '';
  };

  const handleRemoveAttachment = (indexToRemove) => {
    setAttachments((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleInsertImageClick = () => {
    imageInputRef.current?.click();
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await uploadEmailInlineImage(formData);
      const imageUrl = response?.data?.data?.url;
      if (!imageUrl) {
        showNotification('Falha ao inserir imagem no email', 'error');
        return;
      }

      const editor = quillRef.current?.getEditor();
      if (!editor) return;
      const cursorPosition = editor.getSelection()?.index ?? editor.getLength();
      editor.insertEmbed(cursorPosition, 'image', imageUrl);
      editor.setSelection(cursorPosition + 1);
      showNotification('Imagem inserida com sucesso', 'success');
    } catch (error) {
      console.error('Erro ao enviar imagem inline:', error);
      showNotification('Erro ao enviar imagem', 'error');
    } finally {
      event.target.value = '';
    }
  };

  const handleSaveSignature = async () => {
    try {
      setSavingSignature(true);
      await updateEmailSignature(signatureData);
      showNotification('Assinatura atualizada com sucesso', 'success');
    } catch (error) {
      console.error('Erro ao salvar assinatura:', error);
      showNotification('Erro ao salvar assinatura', 'error');
    } finally {
      setSavingSignature(false);
    }
  };

  const composerModules = useMemo(() => ({
    ...quillModules,
    toolbar: {
      container: quillModules.toolbar,
      handlers: {
        image: handleInsertImageClick
      }
    }
  }), []);

  const handleSelectUser = (userEmail) => {
    setComposerFormData((prev) => ({ ...prev, to_email: userEmail }));
    setShowUserList(false);
  };

  const handleSendEmail = async (e) => {
    e.preventDefault();

    if (!composerFormData.to_email || !composerFormData.subject || !composerFormData.html_body) {
      showNotification('Preencha destinatário, assunto e corpo do e-mail', 'error');
      return;
    }

    try {
      setSendingEmail(true);
      const formData = new FormData();
      formData.append('to_email', composerFormData.to_email);
      formData.append('subject', composerFormData.subject);
      formData.append('html_body', composerFormData.html_body);
      formData.append('template_name', composerFormData.template_name || '');
      formData.append('include_signature', String(signatureData.email_signature_auto === 0 ? 0 : 1));

      attachments.forEach((file) => formData.append('attachments', file));

      const response = await sendEmailFormData(formData);
      const payload = response?.data || {};

      if (payload.success) {
        showNotification('Email enviado com sucesso', 'success');
        setComposerFormData({ to_email: '', subject: '', html_body: '', template_name: '' });
        setAttachments([]);
        setSelectedTemplate(null);
        await loadEmailHistory();
        setActiveTab('enviado');
      } else {
        showNotification(resolveSmtpErrorMsg(payload.message || ''), 'error');
      }
    } catch (error) {
      console.error('Erro ao enviar email:', error);
      const errMsg = error?.response?.data?.message || error?.response?.data?.error || error?.message || '';
      showNotification(resolveSmtpErrorMsg(errMsg) || 'Erro ao enviar email', 'error');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleViewDetails = (email) => {
    setSelectedEmail(email);
    setShowDetailModal(true);
  };

  const handleCloseModal = () => {
    setShowDetailModal(false);
    setTimeout(() => setSelectedEmail(null), 150);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('pt-BR');
  };

  const renderHistoryTable = (rows, emptyTitle, emptyText) => {
    if (loadingHistory) {
      return (
        <div className="loading-spinner">
          <Loader className="spinning" size={32} />
        </div>
      );
    }

    if (!rows.length) {
      return (
        <div className="empty-state">
          <Mail size={42} />
          <h3>{emptyTitle}</h3>
          <p>{emptyText}</p>
        </div>
      );
    }

    return (
      <div className="emails-table-wrapper">
        <table className="emails-table">
          <thead>
            <tr>
              <th>Para</th>
              <th>Assunto</th>
              <th>Data</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((email) => (
              <tr key={email.id} className={email.status === 'ERRO' ? 'error-row' : ''}>
                <td>{email.recipient_email}</td>
                <td className="subject-cell">{email.subject}</td>
                <td className="date-cell">{formatDate(email.created_at)}</td>
                <td>
                  <button className="btn-view-details" onClick={() => handleViewDetails(email)}>
                    <Eye size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="email-dashboard-wrapper">
        <Navbar />
        <div className="email-dashboard-container">
          <div className="loading-spinner">
            <Loader className="spinning" size={32} />
            <p>Carregando...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="email-dashboard-wrapper">
      <Navbar />

      <div className="email-dashboard-container">
        <div className="mail-shell">
          <aside className="mail-sidebar">
            <div className="mail-sidebar-header">Email</div>
            <div className="mail-sidebar-menu">
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    className={`mail-menu-item ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveTab(item.key)}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="mail-main">
            {activeTab === 'recebidos' && (
              <div className="tab-pane">
                {configFormData.from_email ? (
                  renderHistoryTable(
                    emailsReceived,
                    'Sem emails recebidos',
                    'A caixa de entrada ainda não possui mensagens para este e-mail configurado.'
                  )
                ) : (
                  <div className="empty-state">
                    <Inbox size={42} />
                    <h3>Configure seu e-mail primeiro</h3>
                    <p>Preencha a aba de configurações para identificar sua caixa de entrada.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'importantes' && (
              <div className="tab-pane">
                <div className="empty-state">
                  <AlertCircle size={42} />
                  <h3>Nenhum e-mail importante</h3>
                  <p>Marque mensagens como importantes para vê-las aqui.</p>
                </div>
              </div>
            )}

            {activeTab === 'favoritos' && (
              <div className="tab-pane">
                <div className="empty-state">
                  <Star size={42} />
                  <h3>Nenhum favorito</h3>
                  <p>Os e-mails favoritados aparecerão nesta pasta.</p>
                </div>
              </div>
            )}

            {activeTab === 'spam' && (
              <div className="tab-pane">
                <div className="empty-state">
                  <ShieldAlert size={42} />
                  <h3>Sem e-mails em spam</h3>
                  <p>Quando houver mensagens suspeitas, elas serão listadas aqui.</p>
                </div>
              </div>
            )}

            {activeTab === 'lixeira' && (
              <div className="tab-pane">
                <div className="empty-state">
                  <Trash2 size={42} />
                  <h3>Lixeira vazia</h3>
                  <p>Mensagens removidas aparecerão aqui temporariamente.</p>
                </div>
              </div>
            )}

            {activeTab === 'novo-email' && (
              <div className="tab-pane compose-pane">
                <form onSubmit={handleSendEmail} className="composer-form composer-card">
                  {templates.length > 0 && (
                    <div className="form-section templates-section">
                      <h3>
                        <FileText size={18} />
                        Templates
                      </h3>
                      <div className="templates-grid">
                        {templates.map((template) => (
                          <button
                            key={template.id}
                            type="button"
                            className={`template-card ${selectedTemplate?.id === template.id ? 'selected' : ''}`}
                            onClick={() => handleSelectTemplate(template)}
                          >
                            <div className="template-name">{template.name}</div>
                            <div className="template-subject">{template.subject}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="form-section">
                    <label>Email destinatário *</label>
                    <div className="email-input-wrapper">
                      <input
                        type="email"
                        name="to_email"
                        value={composerFormData.to_email}
                        onChange={handleComposerChange}
                        className="form-input"
                        placeholder="Informe o e-mail"
                        required
                      />
                      {users.length > 0 && (
                        <div className="user-selector">
                          <button type="button" className="btn-select-user" onClick={() => setShowUserList(!showUserList)}>
                            <ChevronDown size={18} />
                          </button>
                          {showUserList && (
                            <div className="user-dropdown">
                              <div className="user-list">
                                {users.map((u) => (
                                  <button key={u.id} type="button" className="user-item" onClick={() => handleSelectUser(u.email)}>
                                    <div className="user-name">{u.nome}</div>
                                    <div className="user-email">{u.email}</div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="form-section">
                    <label>Assunto *</label>
                    <input
                      type="text"
                      name="subject"
                      value={composerFormData.subject}
                      onChange={handleComposerChange}
                      className="form-input"
                      placeholder="Assunto do e-mail"
                      required
                    />
                  </div>

                  <div className="form-section">
                    <label>Corpo do e-mail *</label>
                    <div className="editor-toolbar-row">
                      <button type="button" className="btn-secondary btn-inline-tool" onClick={handleInsertImageClick}>
                        <ImageIcon size={16} />
                        Inserir imagem
                      </button>
                      <label className="btn-secondary btn-inline-tool btn-file-attachments">
                        <Paperclip size={16} />
                        Anexar arquivo
                        <input
                          type="file"
                          accept={ACCEPTED_ATTACHMENTS}
                          onChange={handleAttachmentChange}
                          multiple
                        />
                      </label>
                    </div>

                    <ReactQuill
                      ref={quillRef}
                      theme="snow"
                      value={composerFormData.html_body}
                      onChange={handleEditorChange}
                      modules={composerModules}
                      className="mail-quill-editor"
                    />
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      onChange={handleImageUpload}
                      style={{ display: 'none' }}
                    />

                    {attachments.length > 0 && (
                      <div className="attachments-list">
                        {attachments.map((file, index) => (
                          <div key={`${file.name}-${index}`} className="attachment-chip">
                            <span>{file.name}</span>
                            <button type="button" onClick={() => handleRemoveAttachment(index)}>Remover</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="form-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setComposerFormData({ to_email: '', subject: '', html_body: '', template_name: '' });
                        setAttachments([]);
                        setSelectedTemplate(null);
                      }}
                      className="btn-secondary"
                      disabled={sendingEmail}
                    >
                      Limpar
                    </button>
                    <button type="submit" disabled={sendingEmail} className="btn-primary">
                      {sendingEmail ? (
                        <>
                          <Loader size={18} className="spinning" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Send size={18} />
                          Enviar
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'enviado' && (
              <div className="tab-pane">
                {renderHistoryTable(emailsSent, 'Nenhum e-mail enviado', 'Os envios aparecerão aqui.')}
              </div>
            )}

            {activeTab === 'erros' && (
              <div className="tab-pane">
                {renderHistoryTable(emailsErrors, 'Nenhum erro', 'Sem falhas de envio registradas.')}
              </div>
            )}

            {activeTab === 'configuracoes' && (
              <div className="tab-pane">
                <form onSubmit={handleSaveConfig} className="config-form">
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

                  <div className="form-section">
                    <h3>Credenciais SMTP</h3>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Host SMTP *</label>
                        <input type="text" name="smtp_host" value={configFormData.smtp_host} onChange={handleConfigChange} className="form-input" required />
                      </div>
                      <div className="form-group">
                        <label>Porta *</label>
                        <input type="number" name="smtp_port" value={configFormData.smtp_port} onChange={handleConfigChange} className="form-input" required />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Email/Usuário *</label>
                      <input type="email" name="smtp_user" value={configFormData.smtp_user} onChange={handleConfigChange} className="form-input" required />
                    </div>

                    <div className="form-group">
                      <label>Senha *</label>
                      <input type="password" name="smtp_pass" value={configFormData.smtp_pass} onChange={handleConfigChange} className="form-input" required />
                    </div>
                  </div>

                  <div className="form-section">
                    <h3>Remetente padrão</h3>
                    <div className="form-group">
                      <label>Nome do remetente *</label>
                      <input type="text" name="from_name" value={configFormData.from_name} onChange={handleConfigChange} className="form-input" required />
                    </div>

                    <div className="form-group">
                      <label>Email do remetente *</label>
                      <input type="email" name="from_email" value={configFormData.from_email} onChange={handleConfigChange} className="form-input" required />
                    </div>
                  </div>

                  <div className="form-section">
                    <h3>Assinatura do usuário</h3>
                    <label className="signature-toggle">
                      <input
                        type="checkbox"
                        checked={signatureData.email_signature_auto !== 0}
                        onChange={(e) => setSignatureData((prev) => ({
                          ...prev,
                          email_signature_auto: e.target.checked ? 1 : 0
                        }))}
                      />
                      Anexar assinatura automaticamente ao enviar
                    </label>

                    <ReactQuill
                      theme="snow"
                      value={signatureData.email_signature_html}
                      onChange={(value) => setSignatureData((prev) => ({ ...prev, email_signature_html: value }))}
                      modules={quillModules}
                      className="mail-quill-signature"
                    />

                    <div>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={savingSignature}
                        onClick={handleSaveSignature}
                      >
                        {savingSignature ? (
                          <>
                            <Loader size={16} className="spinning" />
                            Salvando assinatura...
                          </>
                        ) : (
                          <>
                            <Save size={16} />
                            Salvar assinatura
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {testResult && (
                    <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                      <div className="test-result-icon">{testResult.success ? <Check size={20} /> : <AlertCircle size={20} />}</div>
                      <div className="test-result-message">
                        {testResult.success ? testResult.message : resolveSmtpErrorMsg(testResult.message)}
                      </div>
                    </div>
                  )}

                  <div className="form-actions">
                    <button type="button" onClick={handleTestConnection} disabled={testingConfig || savingConfig} className="btn-secondary">
                      {testingConfig ? (
                        <>
                          <Loader size={18} className="spinning" />
                          Testando...
                        </>
                      ) : (
                        'Testar conexão'
                      )}
                    </button>
                    <button type="submit" disabled={savingConfig || testingConfig} className="btn-primary">
                      {savingConfig ? (
                        <>
                          <Loader size={18} className="spinning" />
                          Salvando...
                        </>
                      ) : (
                        'Salvar'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>
        </div>
      </div>

      {showDetailModal && selectedEmail && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Detalhes do Email</h2>
              <button className="btn-close" onClick={handleCloseModal}>x</button>
            </div>

            <div className="modal-body">
              <div className="detail-group">
                <label>Status</label>
                <span className={`status-badge ${selectedEmail.status === 'ENVIADO' ? 'success' : 'error'}`}>
                  {selectedEmail.status}
                </span>
              </div>

              <div className="detail-group">
                <label>Email Destinatário</label>
                <p>{selectedEmail.recipient_email}</p>
              </div>

              <div className="detail-group">
                <label>Assunto</label>
                <p>{selectedEmail.subject}</p>
              </div>

              <div className="detail-group">
                <label>Data de Envio</label>
                <p>{formatDate(selectedEmail.created_at)}</p>
              </div>

              {selectedEmail.error_message && (
                <div className="detail-group error">
                  <label>Erro</label>
                  <p className="error-text">{selectedEmail.error_message}</p>
                </div>
              )}

              {selectedEmail.body_html && (
                <div className="detail-group">
                  <label>Corpo do Email</label>
                  <div className="email-body-preview">
                    <div dangerouslySetInnerHTML={{ __html: selectedEmail.body_html }} />
                  </div>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={handleCloseModal}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmailDashboard;
