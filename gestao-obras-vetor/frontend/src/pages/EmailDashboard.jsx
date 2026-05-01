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
  updateEmailSignature,
  toggleEmailFavorito,
  deleteEmailHistory,
  syncImapEmails,
  getReceivedEmails,
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
  Save,
  MoreVertical
} from 'lucide-react';
import 'react-quill/dist/quill.snow.css';
import '../styles/EmailDashboard.css';

const SMTP_PRESETS = {
  google: {
    provider: 'Google',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    imap_host: 'imap.gmail.com',
    imap_port: 993,
    imap_tls: 1,
    example: 'seu-email@gmail.com'
  },
  microsoft: {
    provider: 'Microsoft',
    smtp_host: 'smtp.outlook.com',
    smtp_port: 587,
    imap_host: 'outlook.office365.com',
    imap_port: 993,
    imap_tls: 1,
    example: 'seu-email@outlook.com'
  },
  custom: {
    provider: 'Outro',
    smtp_host: '',
    smtp_port: 587,
    imap_host: '',
    imap_port: 993,
    imap_tls: 1,
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
    from_email: '',
    imap_host: 'imap.gmail.com',
    imap_port: 993,
    imap_user: '',
    imap_pass: '',
    imap_tls: 1
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
    const [receivedEmails, setReceivedEmails] = useState([]);
    const [syncingImap, setSyncingImap] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showUserList, setShowUserList] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
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
            from_email: config.from_email || '',
            imap_host: config.imap_host || '',
            imap_port: config.imap_port || 993,
            imap_user: config.imap_user || '',
            imap_pass: '',
            imap_tls: config.imap_tls !== undefined ? config.imap_tls : 1
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
      try {
        const recv = await getReceivedEmails();
        if (Array.isArray(recv?.data?.data)) setReceivedEmails(recv.data.data);
      } catch {}
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncImap = async () => {
    setSyncingImap(true);
    try {
      const res = await syncImapEmails();
      const synced = res?.data?.synced ?? 0;
      showNotification(synced > 0 ? `${synced} email(s) novo(s) recebido(s)` : 'Nenhum email novo', 'success');
      const recv = await getReceivedEmails();
      if (Array.isArray(recv?.data?.data)) setReceivedEmails(recv.data.data);
    } catch (error) {
      showNotification(error?.response?.data?.error || 'Erro ao sincronizar emails', 'error');
    } finally {
      setSyncingImap(false);
    }
  };

  const loadEmailHistory = async () => {
    try {
      setLoadingHistory(true);
      const response = await getEmailHistory({ limit: 100 });
      const data = response?.data?.data;
      if (Array.isArray(data)) {
        setAllHistory(data);
        setEmailsSent(data.filter((e) => e.status === 'ENVIADO' && !e.excluido));
        setEmailsErrors(data.filter((e) => e.status === 'ERRO' && !e.excluido));
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
      smtp_port: preset.smtp_port,
      imap_host: preset.imap_host || '',
      imap_port: preset.imap_port || 993,
      imap_tls: preset.imap_tls !== undefined ? preset.imap_tls : 1
    }));
    setTestResult(null);
  };

  const handleConfigChange = (e) => {
    const { name, value } = e.target;
    setConfigFormData((prev) => ({
      ...prev,
      [name]: (name === 'smtp_port' || name === 'imap_port') ? Number(value) : value
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

      setTestResult({ success: payload.success, message: payload.message, detalhe: payload.detalhe_tecnico });
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
    setSelectedEmail(prev => prev?.id === email.id ? null : email);
    setShowDetailModal(false);
  };

  const handleToggleFavorito = async (e, email) => {
    e.stopPropagation();
    setOpenMenuId(null);
    try {
      const res = await toggleEmailFavorito(email.id);
      const novoFavorito = res?.data?.favorito ?? (email.favorito ? 0 : 1);
      setAllHistory(prev => prev.map(e => e.id === email.id ? { ...e, favorito: novoFavorito } : e));
      showNotification(novoFavorito ? 'Adicionado aos favoritos' : 'Removido dos favoritos', 'success');
    } catch {
      showNotification('Erro ao favoritar email', 'error');
    }
  };

  const handleDeleteEmail = async (e, email) => {
    e.stopPropagation();
    setOpenMenuId(null);
    try {
      const res = await deleteEmailHistory(email.id);
      const permanente = res?.data?.permanente;
      if (permanente) {
        setAllHistory(prev => prev.filter(e => e.id !== email.id));
        showNotification('Email excluído permanentemente', 'success');
      } else {
        setAllHistory(prev => prev.map(e => e.id === email.id ? { ...e, excluido: 1 } : e));
        if (selectedEmail?.id === email.id) setSelectedEmail(null);
        showNotification('Email movido para a lixeira', 'success');
      }
    } catch {
      showNotification('Erro ao excluir email', 'error');
    }
  };

  const handleCloseModal = () => {
    setSelectedEmail(null);
    setShowDetailModal(false);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const d = new Date(dateString);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  const formatDateFull = (dateString) => {
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
      <div className={`gmail-pane${selectedEmail ? ' has-detail' : ''}`}>
        {/* Email list */}
        <div className="gmail-list">
          {rows.map((email) => {
            const isSelected = selectedEmail?.id === email.id;
            const isError = email.status === 'ERRO';
            return (
              <div
                key={email.id}
                className={`gmail-row${isSelected ? ' gmail-row-selected' : ''}${isError ? ' gmail-row-error' : ''}`}
                onClick={() => handleViewDetails(email)}
              >
                <div className="gmail-row-avatar">
                  {(email.recipient_email || '?')[0].toUpperCase()}
                </div>
                <div className="gmail-row-body">
                  <div className="gmail-row-top">
                    <span className="gmail-row-recipient">{email.recipient_email}</span>
                    <span className="gmail-row-date">{formatDate(email.created_at)}</span>
                  </div>
                  <div className="gmail-row-subject">{email.subject || '(sem assunto)'}</div>
                  {isError && email.error_message && (
                    <div className="gmail-row-preview gmail-row-preview-error">{email.error_message}</div>
                  )}
                </div>
                {email.favorito ? <Star size={14} className="gmail-row-star-icon" /> : null}
                {isError && <span className="gmail-err-dot" title="Erro de envio" />}
                <div className="gmail-row-menu" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="gmail-row-menu-btn"
                    title="Mais ações"
                    onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === email.id ? null : email.id); }}
                  >
                    <MoreVertical size={16} />
                  </button>
                  {openMenuId === email.id && (
                    <div className="gmail-row-dropdown">
                      <button onClick={(e) => handleToggleFavorito(e, email)}>
                        <Star size={14} />
                        {email.favorito ? 'Remover favorito' : 'Favoritar'}
                      </button>
                      <button className="gmail-dropdown-danger" onClick={(e) => handleDeleteEmail(e, email)}>
                        <Trash2 size={14} />
                        {email.excluido ? 'Excluir permanentemente' : 'Mover para lixeira'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Email detail panel */}
        {selectedEmail && (
          <div className="gmail-detail">
            <div className="gmail-detail-header">
              <h2 className="gmail-detail-subject">{selectedEmail.subject || '(sem assunto)'}</h2>
              <button className="gmail-detail-close" onClick={handleCloseModal} title="Fechar">✕</button>
            </div>

            <div className="gmail-detail-meta">
              <div className="gmail-detail-avatar">{(selectedEmail.recipient_email || '?')[0].toUpperCase()}</div>
              <div>
                <div className="gmail-detail-from">
                  Para: <strong>{selectedEmail.recipient_email}</strong>
                  {selectedEmail.status === 'ERRO'
                    ? <span className="gmail-status-badge error">Falhou</span>
                    : <span className="gmail-status-badge sent">Enviado</span>
                  }
                </div>
                <div className="gmail-detail-date">{formatDateFull(selectedEmail.created_at)}</div>
              </div>
            </div>

            {selectedEmail.error_message && (
              <div className="gmail-error-banner">
                <AlertCircle size={15} />
                {selectedEmail.error_message}
              </div>
            )}

            <div className="gmail-detail-body">
              {selectedEmail.body_html
                ? <iframe
                    srcDoc={selectedEmail.body_html}
                    title="Conteúdo do email"
                    className="gmail-body-iframe"
                    sandbox="allow-same-origin"
                  />
                : <p style={{ color: '#94a3b8', fontSize: 14 }}>(Sem conteúdo HTML)</p>
              }
            </div>
          </div>
        )}
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
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSyncImap}
                    disabled={syncingImap}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '7px 14px' }}
                  >
                    {syncingImap ? <Loader size={15} className="spinning" /> : <Inbox size={15} />}
                    {syncingImap ? 'Sincronizando...' : 'Sincronizar Caixa de Entrada'}
                  </button>
                </div>
                {receivedEmails.length === 0 ? (
                  <div className="empty-state">
                    <Inbox size={42} />
                    <h3>Nenhum email recebido</h3>
                    <p>Configure o IMAP na aba Configurações e clique em "Sincronizar" para buscar emails.</p>
                  </div>
                ) : (
                  <div className="email-list">
                    {receivedEmails.map((email) => (
                      <div key={email.id} className="gmail-row" onClick={() => setSelectedEmail(prev => prev?.id === email.id ? null : email)}>
                        <div className="gmail-row-icon"><Inbox size={16} /></div>
                        <div className="gmail-row-from">{email.from_name || email.from_email}</div>
                        <div className="gmail-row-subject">
                          <span className="gmail-row-subj">{email.subject}</span>
                          {email.from_email && <span className="gmail-row-preview"> — {email.from_email}</span>}
                        </div>
                        <div className="gmail-row-date">{email.received_at ? new Date(email.received_at).toLocaleDateString('pt-BR') : ''}</div>
                      </div>
                    ))}
                  </div>
                )}
                {selectedEmail && receivedEmails.some(e => e.id === selectedEmail.id) && (
                  <div className="email-detail-panel" style={{ marginTop: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div>
                        <strong>{selectedEmail.subject}</strong>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                          De: {selectedEmail.from_name} &lt;{selectedEmail.from_email}&gt; — {selectedEmail.received_at ? new Date(selectedEmail.received_at).toLocaleString('pt-BR') : ''}
                        </div>
                      </div>
                      <button type="button" onClick={() => setSelectedEmail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>×</button>
                    </div>
                    {selectedEmail.body_html
                      ? <div dangerouslySetInnerHTML={{ __html: selectedEmail.body_html }} style={{ fontSize: '14px', lineHeight: '1.6' }} />
                      : <pre style={{ whiteSpace: 'pre-wrap', fontSize: '13px' }}>{selectedEmail.body_text}</pre>
                    }
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
                {renderHistoryTable(
                  allHistory.filter(e => e.favorito && !e.excluido),
                  'Nenhum favorito',
                  'Marque emails com estrela para vê-los aqui.'
                )}
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
                {renderHistoryTable(
                  allHistory.filter(e => e.excluido),
                  'Lixeira vazia',
                  'Emails excluídos aparecem aqui. Clique nos 3 pontinhos para excluir permanentemente.'
                )}
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

                  <div className="form-section" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Inbox size={16} /> Configuração IMAP (Recebimento)
                    </h3>
                    <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                      Preencha para receber emails na aba Recebidos. Para Gmail use <strong>imap.gmail.com</strong> porta 993 e a mesma Senha de App.
                    </p>
                    <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <div className="form-group">
                        <label>Servidor IMAP</label>
                        <input type="text" name="imap_host" value={configFormData.imap_host} onChange={handleConfigChange} className="form-input" placeholder="imap.gmail.com" />
                      </div>
                      <div className="form-group">
                        <label>Porta IMAP</label>
                        <input type="number" name="imap_port" value={configFormData.imap_port} onChange={handleConfigChange} className="form-input" placeholder="993" />
                      </div>
                      <div className="form-group">
                        <label>Usuário IMAP (opcional, padrão = usuário SMTP)</label>
                        <input type="text" name="imap_user" value={configFormData.imap_user} onChange={handleConfigChange} className="form-input" placeholder="igual ao email SMTP" />
                      </div>
                      <div className="form-group">
                        <label>Senha IMAP (opcional, padrão = senha SMTP)</label>
                        <input type="password" name="imap_pass" value={configFormData.imap_pass} onChange={handleConfigChange} className="form-input" placeholder="deixe em branco para usar a mesma senha SMTP" />
                      </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={configFormData.imap_tls === 1 || configFormData.imap_tls === true}
                        onChange={(e) => setConfigFormData(prev => ({ ...prev, imap_tls: e.target.checked ? 1 : 0 }))}
                      />
                      Usar TLS/SSL (recomendado, porta 993)
                    </label>
                  </div>

                  {testResult && (
                    <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                      <div className="test-result-icon">{testResult.success ? <Check size={20} /> : <AlertCircle size={20} />}</div>
                      <div className="test-result-message">
                        {testResult.success ? testResult.message : resolveSmtpErrorMsg(testResult.message)}
                        {!testResult.success && testResult.detalhe && (
                          <details style={{ marginTop: 6, fontSize: '0.8em', opacity: 0.7 }}>
                            <summary style={{ cursor: 'pointer' }}>Detalhe técnico</summary>
                            <code>{testResult.detalhe}</code>
                          </details>
                        )}
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
    </div>
  );
}

export default EmailDashboard;
