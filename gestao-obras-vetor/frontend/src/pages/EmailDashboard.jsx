import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  deleteReceivedEmail,
  toggleReceivedEmailFavorito,
  toggleReceivedEmailImportante,
  markReceivedEmailRead,
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
  MoreVertical,
  Reply,
  Forward,
  ArrowLeft,
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
  { key: 'novo-email', label: 'Novo E-mail', icon: Send },
  { key: 'rascunhos', label: 'Rascunhos', icon: FileText },
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
const AUTO_IMAP_SYNC_INTERVAL_MS = 90000;
const EMPTY_COMPOSER = { to_email: '', subject: '', html_body: '', template_name: '' };

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

function resolveSmtpTestErrorMsg(msg) {
  const m = String(msg || '').trim();

  if (!m || m === 'Erro ao testar conexão' || m === 'Erro ao testar configuracao' || m === 'Erro ao testar configuração') {
    return 'Não foi possível testar a conexão SMTP. Verifique host, porta, usuário e senha. Para Gmail, use Senha de App em vez da senha normal.';
  }

  if (m.includes('534') && m.includes('Application-specific password required')) {
    return 'Autenticação falhou: sua conta Gmail exige Senha de App. Insira a Senha de App nas Configurações, salve e tente novamente.';
  }

  if ((m.includes('535') || m.includes('534')) && (m.includes('BadCredentials') || m.includes('Username and Password not accepted') || m.includes('InvalidSecondFactor'))) {
    return 'Credenciais recusadas pelo Gmail. Se sua conta tem verificação em duas etapas, crie uma Senha de App e salve nas Configurações.';
  }

  if ((m.includes('535') || m.includes('534')) && (m.includes('basic authentication is disabled') || m.includes('Basic Auth'))) {
    return 'O Outlook/Hotmail desativou a autenticação básica. Use uma Senha de App ou revise o método de autenticação da conta.';
  }

  if (m.includes('535') || m.includes('534') || m.toLowerCase().includes('autenticacao') || m.toLowerCase().includes('autenticação')) {
    return `Autenticação recusada. Se a conta usa dois fatores, use uma Senha de App salva nas Configurações. Detalhe: ${m}`;
  }

  if (m.startsWith('Erro na conexão SMTP:') || m.startsWith('Erro na conexao SMTP:')) return m;
  return `Erro na conexão SMTP: ${m}`;
}

function EmailDashboard() {
  const { showNotification } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialParamTab = searchParams.get('tab');
  const initialTab = VALID_TABS.has(initialParamTab) ? initialParamTab : 'recebidos';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [selectedPreset, setSelectedPreset] = useState('google');
  const [hasSavedEmailConfig, setHasSavedEmailConfig] = useState(false);
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
  const [composerFormData, setComposerFormData] = useState(EMPTY_COMPOSER);
  const [replyContext, setReplyContext] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [activeDraftId, setActiveDraftId] = useState(null);
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
  const [imapSyncState, setImapSyncState] = useState({
    status: 'idle',
    message: '',
    detail: '',
    at: null
  });
  const [testResult, setTestResult] = useState(null);
  const [showUserList, setShowUserList] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [selectedReceivedEmail, setSelectedReceivedEmail] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const quillRef = useRef(null);
  const imageInputRef = useRef(null);
  const syncingImapRef = useRef(false);
  const draftsStorageKey = useMemo(() => {
    const pathKey = typeof window !== 'undefined'
      ? window.location.pathname.replace(/\/email-dashboard.*/, '/email-dashboard')
      : 'email-dashboard';
    return `vetor-email-drafts:${pathKey}`;
  }, []);

  useEffect(() => {
    setSearchParams({ tab: activeTab }, { replace: true });
  }, [activeTab, setSearchParams]);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(draftsStorageKey) || '[]');
      if (Array.isArray(stored)) {
        setDrafts(stored);
      }
    } catch {
      setDrafts([]);
    }
  }, [draftsStorageKey]);

  useEffect(() => {
    localStorage.setItem(draftsStorageKey, JSON.stringify(drafts));
  }, [drafts, draftsStorageKey]);

  useEffect(() => {
    if (
      activeTab === 'enviado' ||
      activeTab === 'erros' ||
      activeTab === 'recebidos' ||
      activeTab === 'importantes' ||
      activeTab === 'favoritos' ||
      activeTab === 'rascunhos' ||
      activeTab === 'spam' ||
      activeTab === 'lixeira'
    ) {
      loadEmailHistory();
    }
  }, [activeTab]);

  useEffect(() => {
    if (!selectedReceivedEmail) return;
    const refreshed = receivedEmails.find((email) => String(email.id) === String(selectedReceivedEmail.id));
    if (!refreshed) {
      setSelectedReceivedEmail(null);
      return;
    }
    if (refreshed !== selectedReceivedEmail) {
      setSelectedReceivedEmail(refreshed);
    }
  }, [receivedEmails, selectedReceivedEmail]);

  const loadInitialData = async () => {
    try {
      setLoading(true);

      try {
        const configResponse = await getEmailConfig();
        const config = configResponse?.data?.data;
        if (config) {
          setHasSavedEmailConfig(true);
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

  const runImapSync = useCallback(async ({ manual = false } = {}) => {
    if (syncingImapRef.current) return;

    syncingImapRef.current = true;
    setSyncingImap(true);

    if (manual) {
      setImapSyncState({
        status: 'running',
        message: 'Sincroniza-o em andamento...',
        detail: '',
        at: new Date().toISOString()
      });
    }

    try {
      const res = await syncImapEmails();
      const synced = Number(res?.data?.synced ?? 0);
      const successMsg = synced > 0
        ? `${synced} email(s) novo(s) recebido(s)`
        : 'Sincroniza-o concluida: nenhum email novo';

      if (manual || synced > 0) {
        showNotification(successMsg, 'success');
      }

      setImapSyncState({
        status: 'success',
        message: manual || synced > 0 ? successMsg : 'Sincronização automática ativa',
        detail: '',
        at: new Date().toISOString()
      });

      const recv = await getReceivedEmails();
      if (Array.isArray(recv?.data?.data)) {
        setReceivedEmails(recv.data.data);
      }
    } catch (error) {
      const apiError = error?.response?.data?.error;
      const detailError = error?.response?.data?.detalhe || error?.message || '';
      const userMsg = apiError || (detailError ? `Erro ao sincronizar emails: ${detailError}` : 'Erro ao sincronizar emails');
      showNotification(userMsg, 'error', 9000);
      setImapSyncState({
        status: 'error',
        message: userMsg,
        detail: detailError,
        at: new Date().toISOString()
      });
    } finally {
      syncingImapRef.current = false;
      setSyncingImap(false);
    }
  }, [showNotification]);

  const handleSyncImap = async () => {
    await runImapSync({ manual: true });
  };

  useEffect(() => {
    if (activeTab !== 'recebidos') {
      return;
    }

    const syncWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        runImapSync({ manual: false });
      }
    };

    syncWhenVisible();
    const intervalId = setInterval(syncWhenVisible, AUTO_IMAP_SYNC_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [activeTab, runImapSync]);

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
      console.error('Erro ao carregar histórico:', error);
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

    if (!configFormData.smtp_host || !configFormData.smtp_user) {
      showNotification('Preencha servidor e usuário SMTP para testar', 'error');
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
        const friendlyMsg = resolveSmtpTestErrorMsg(msg);
        showNotification(friendlyMsg, 'error');
      }
    } catch (error) {
      const responseData = error.response?.data || {};
      const errMsg = responseData.message || responseData.error || error.message || 'Erro ao testar conexão';
      const detail = responseData.detalhe_tecnico || responseData.detalhe || responseData.message || error.message || '';
      setTestResult({ success: false, message: errMsg, detalhe: detail });
      showNotification(resolveSmtpTestErrorMsg(errMsg), 'error');
    } finally {
      setTestingConfig(false);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();

    if (!configFormData.smtp_pass && !hasSavedEmailConfig) {
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
      setHasSavedEmailConfig(true);
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
    setReplyContext(null);
    setActiveDraftId(null);
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

  const getComposerPlainText = (html = '') => (
    String(html)
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );

  const hasComposerContent = () => Boolean(
    composerFormData.to_email ||
    composerFormData.subject ||
    getComposerPlainText(composerFormData.html_body) ||
    replyContext
  );

  const handleSaveDraft = () => {
    if (!hasComposerContent()) {
      showNotification('Nada para salvar em rascunhos', 'error');
      return;
    }

    const now = new Date().toISOString();
    const draft = {
      id: activeDraftId || `draft-${Date.now()}`,
      ...composerFormData,
      replyContext,
      updatedAt: now,
      createdAt: drafts.find((item) => item.id === activeDraftId)?.createdAt || now,
      attachmentNames: attachments.map((file) => file.name)
    };

    setDrafts((prev) => {
      const withoutCurrent = prev.filter((item) => item.id !== draft.id);
      return [draft, ...withoutCurrent];
    });
    setActiveDraftId(draft.id);

    if (attachments.length) {
      showNotification('Rascunho salvo. Anexos precisam ser adicionados novamente ao continuar.', 'success');
      return;
    }

    showNotification('Rascunho salvo', 'success');
  };

  const handleOpenDraft = (draft) => {
    setComposerFormData({
      to_email: draft.to_email || '',
      subject: draft.subject || '',
      html_body: draft.html_body || '',
      template_name: draft.template_name || ''
    });
    setReplyContext(draft.replyContext || null);
    setAttachments([]);
    setSelectedTemplate(null);
    setActiveDraftId(draft.id);
    setActiveTab('novo-email');
  };

  const handleDeleteDraft = (draftId, event) => {
    event?.stopPropagation?.();
    setDrafts((prev) => prev.filter((draft) => draft.id !== draftId));
    if (activeDraftId === draftId) {
      setActiveDraftId(null);
    }
    showNotification('Rascunho excluído', 'success');
  };

  const handleClearComposer = () => {
    setComposerFormData(EMPTY_COMPOSER);
    setReplyContext(null);
    setAttachments([]);
    setSelectedTemplate(null);
    setActiveDraftId(null);
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

  const patchReceivedEmail = useCallback((emailId, patch) => {
    setReceivedEmails((prev) => prev.map((email) => (
      String(email.id) === String(emailId) ? { ...email, ...patch } : email
    )));
    setSelectedReceivedEmail((prev) => (
      prev && String(prev.id) === String(emailId) ? { ...prev, ...patch } : prev
    ));
  }, []);

  const handleOpenReceivedEmail = useCallback(async (email) => {
    setSelectedEmail(null);
    setSelectedReceivedEmail(email);

    if (email.is_read) return;

    patchReceivedEmail(email.id, { is_read: 1 });
    try {
      await markReceivedEmailRead(email.id, 1);
    } catch (error) {
      console.error('Erro ao marcar email como lido:', error);
      patchReceivedEmail(email.id, { is_read: email.is_read || 0 });
    }
  }, [patchReceivedEmail]);

  const handleToggleReceivedFavorito = useCallback(async (event, email) => {
    event?.stopPropagation?.();
    setOpenMenuId(null);
    try {
      const response = await toggleReceivedEmailFavorito(email.id);
      const favorito = response?.data?.favorito ?? (email.favorito ? 0 : 1);
      patchReceivedEmail(email.id, { favorito });
      showNotification(favorito ? 'Adicionado aos favoritos' : 'Removido dos favoritos', 'success');
    } catch (error) {
      console.error('Erro ao favoritar email recebido:', error);
      showNotification('Erro ao favoritar email', 'error');
    }
  }, [patchReceivedEmail, showNotification]);

  const handleToggleReceivedImportante = useCallback(async (event, email) => {
    event?.stopPropagation?.();
    setOpenMenuId(null);
    try {
      const response = await toggleReceivedEmailImportante(email.id);
      const importante = response?.data?.importante ?? (email.importante ? 0 : 1);
      patchReceivedEmail(email.id, { importante });
      showNotification(importante ? 'Email marcado como importante' : 'Email removido dos importantes', 'success');
    } catch (error) {
      console.error('Erro ao marcar email importante:', error);
      showNotification('Erro ao marcar email importante', 'error');
    }
  }, [patchReceivedEmail, showNotification]);

  const handleToggleReceivedRead = useCallback(async (event, email) => {
    event?.stopPropagation?.();
    setOpenMenuId(null);
    const isRead = email.is_read ? 0 : 1;
    patchReceivedEmail(email.id, { is_read: isRead });
    try {
      await markReceivedEmailRead(email.id, isRead);
      showNotification(isRead ? 'Email marcado como lido' : 'Email marcado como não lido', 'success');
    } catch (error) {
      console.error('Erro ao atualizar leitura do email:', error);
      patchReceivedEmail(email.id, { is_read: email.is_read || 0 });
      showNotification('Erro ao atualizar leitura do email', 'error');
    }
  }, [patchReceivedEmail, showNotification]);

  const handleSelectUser = (userEmail) => {
    setComposerFormData((prev) => ({ ...prev, to_email: userEmail }));
    setShowUserList(false);
  };

  const buildQuotedEmailHtml = (context) => {
    if (!context) return '';
    const dateLabel = context.date ? new Date(context.date).toLocaleString('pt-BR') : '';
    const author = context.fromName || context.fromEmail || 'Remetente';
    const body = context.bodyHtml || `<pre style="white-space:pre-wrap;font-family:inherit">${context.bodyText || ''}</pre>`;

    return `
<div style="margin-top:24px;padding-top:14px;border-top:1px solid #e5e7eb;color:#5f6368;font-size:13px;">
  <div style="margin-bottom:10px;">Em ${dateLabel}, ${author} escreveu:</div>
  <blockquote style="margin:0;border-left:2px solid #dadce0;padding-left:12px;color:#5f6368;">
    ${body}
  </blockquote>
</div>`;
  };

  const handleReplyEmail = useCallback((email) => {
    setComposerFormData({
      to_email: email.from_email || '',
      subject: email.subject ? `Re: ${email.subject.replace(/^(Re:\s*)+/i, '')}` : '',
      html_body: '<p><br></p>',
      template_name: '',
    });
    setReplyContext({
      type: 'reply',
      fromName: email.from_name || '',
      fromEmail: email.from_email || '',
      date: email.received_at,
      subject: email.subject || '',
      bodyHtml: email.body_html || '',
      bodyText: email.body_text || ''
    });
    setAttachments([]);
    setSelectedTemplate(null);
    setActiveDraftId(null);
    setSelectedReceivedEmail(null);
    setActiveTab('novo-email');
  }, []);

  const handleForwardEmail = useCallback((email) => {
    setComposerFormData({
      to_email: '',
      subject: email.subject ? `Fwd: ${email.subject.replace(/^(Fwd:\s*)+/i, '')}` : '',
      html_body: '<p><br></p>',
      template_name: '',
    });
    setReplyContext({
      type: 'forward',
      fromName: email.from_name || '',
      fromEmail: email.from_email || '',
      date: email.received_at,
      subject: email.subject || '',
      bodyHtml: email.body_html || '',
      bodyText: email.body_text || ''
    });
    setAttachments([]);
    setSelectedTemplate(null);
    setActiveDraftId(null);
    setSelectedReceivedEmail(null);
    setActiveTab('novo-email');
  }, []);

  const handleDeleteReceivedEmail = useCallback(async (email, event) => {
    event?.stopPropagation?.();
    setOpenMenuId(null);
    const actionLabel = email.excluido ? 'Excluir permanentemente' : 'Mover para a lixeira';
    if (!window.confirm(`${actionLabel} o email "${email.subject || '(sem assunto)'}"?`)) return;
    try {
      const response = await deleteReceivedEmail(email.id);
      const permanente = response?.data?.permanente;
      if (permanente) {
        setReceivedEmails((prev) => prev.filter((item) => String(item.id) !== String(email.id)));
        setSelectedReceivedEmail(null);
        showNotification('Email excluido permanentemente', 'success');
      } else {
        patchReceivedEmail(email.id, { excluido: 1 });
        setSelectedReceivedEmail(null);
        showNotification('Email movido para a lixeira', 'success');
      }
    } catch (err) {
      console.error('Erro ao excluir email recebido:', err);
      showNotification('Erro ao excluir email', 'error');
    }
  }, [patchReceivedEmail, showNotification]);

  const handleSendEmail = async (e) => {
    e.preventDefault();

    if (!composerFormData.to_email || !composerFormData.subject || !getComposerPlainText(composerFormData.html_body)) {
      showNotification('Preencha destinatário, assunto e corpo do email', 'error');
      return;
    }

    try {
      setSendingEmail(true);
      const outgoingHtmlBody = replyContext
        ? `${composerFormData.html_body || ''}${buildQuotedEmailHtml(replyContext)}`
        : composerFormData.html_body;
      const formData = new FormData();
      formData.append('to_email', composerFormData.to_email);
      formData.append('subject', composerFormData.subject);
      formData.append('html_body', outgoingHtmlBody);
      formData.append('template_name', composerFormData.template_name || '');
      formData.append('include_signature', String(signatureData.email_signature_auto === 0 ? 0 : 1));

      attachments.forEach((file) => formData.append('attachments', file));

      const response = await sendEmailFormData(formData);
      const payload = response?.data || {};

      if (payload.success) {
        showNotification('Email enviado com sucesso', 'success');
        if (activeDraftId) {
          setDrafts((prev) => prev.filter((draft) => draft.id !== activeDraftId));
        }
        setComposerFormData(EMPTY_COMPOSER);
        setReplyContext(null);
        setAttachments([]);
        setSelectedTemplate(null);
        setActiveDraftId(null);
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
    setSelectedReceivedEmail(null);
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

  const receivedInboxEmails = receivedEmails.filter((email) => !email.excluido);
  const importantReceivedEmails = receivedEmails.filter((email) => !email.excluido && email.importante);
  const favoriteReceivedEmails = receivedEmails.filter((email) => !email.excluido && email.favorito);
  const trashedReceivedEmails = receivedEmails.filter((email) => email.excluido);
  const favoriteSentEmails = allHistory.filter((email) => email.favorito && !email.excluido);
  const trashedSentEmails = allHistory.filter((email) => email.excluido);
  const sortedDrafts = [...drafts].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const renderReceivedDetail = (email) => (
    <div className="gmail-detail">
      <div className="gmail-detail-header">
        <button
          type="button"
          className="gmail-detail-back"
          onClick={() => setSelectedReceivedEmail(null)}
        >
          <ArrowLeft size={16} />
          Voltar
        </button>
        <div className="gmail-detail-title">
          <h2 className="gmail-detail-subject">{email.subject || '(sem assunto)'}</h2>
          <div className="gmail-detail-kicker">Recebido de {email.from_name || email.from_email || '-'}</div>
        </div>
        <div className="mail-detail-actions">
          <button
            type="button"
            className={`mail-icon-button ${email.favorito ? 'is-active' : ''}`}
            title={email.favorito ? 'Remover favorito' : 'Favoritar'}
            onClick={(event) => handleToggleReceivedFavorito(event, email)}
          >
            <Star size={16} fill={email.favorito ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            className={`mail-icon-button ${email.importante ? 'is-important' : ''}`}
            title={email.importante ? 'Remover importante' : 'Marcar importante'}
            onClick={(event) => handleToggleReceivedImportante(event, email)}
          >
            <AlertCircle size={16} />
          </button>
          <button type="button" className="mail-icon-button" title="Responder" onClick={() => handleReplyEmail(email)}>
            <Reply size={16} />
          </button>
          <button type="button" className="mail-icon-button" title="Encaminhar" onClick={() => handleForwardEmail(email)}>
            <Forward size={16} />
          </button>
          <button type="button" className="mail-icon-button is-danger" title="Excluir" onClick={(event) => handleDeleteReceivedEmail(email, event)}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="gmail-detail-meta">
        <div className="gmail-detail-avatar">{((email.from_name || email.from_email || '?')[0] || '?').toUpperCase()}</div>
        <div>
          <div className="gmail-detail-from">
            De: <strong>{email.from_name || email.from_email || '-'}</strong>
            {email.importante ? (
              <span className="gmail-status-badge warning">
                {email.importante_auto ? 'Importante automático' : 'Importante'}
              </span>
            ) : null}
          </div>
          <div className="gmail-detail-date">
            {email.received_at ? formatDateFull(email.received_at) : '-'}
            {email.from_email ? ` · ${email.from_email}` : ''}
          </div>
        </div>
      </div>

      <div className="gmail-detail-body">
        {email.body_html
          ? (
            <iframe
              srcDoc={email.body_html}
              title="Conteúdo do email"
              className="gmail-body-iframe"
              sandbox="allow-same-origin"
            />
          )
          : (
            <div className="gmail-detail-body-content">
              <pre className="mail-plain-body">{email.body_text || '(Sem conteúdo)'}</pre>
            </div>
          )
        }
      </div>
    </div>
  );

  const renderSentDetail = (email) => (
    <div className="gmail-detail">
      <div className="gmail-detail-header">
        <button type="button" className="gmail-detail-back" onClick={handleCloseModal}>
          <ArrowLeft size={16} />
          Voltar
        </button>
        <div className="gmail-detail-title">
          <h2 className="gmail-detail-subject">{email.subject || '(sem assunto)'}</h2>
          <div className="gmail-detail-kicker">Enviado para {email.recipient_email || '-'}</div>
        </div>
        <div className="mail-detail-actions">
          <button
            type="button"
            className={`mail-icon-button ${email.favorito ? 'is-active' : ''}`}
            title={email.favorito ? 'Remover favorito' : 'Favoritar'}
            onClick={(event) => handleToggleFavorito(event, email)}
          >
            <Star size={16} fill={email.favorito ? 'currentColor' : 'none'} />
          </button>
          <button type="button" className="mail-icon-button is-danger" title="Excluir" onClick={(event) => handleDeleteEmail(event, email)}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="gmail-detail-meta">
        <div className="gmail-detail-avatar">{(email.recipient_email || '?')[0].toUpperCase()}</div>
        <div>
          <div className="gmail-detail-from">
            Para: <strong>{email.recipient_email}</strong>
            {email.status === 'ERRO'
              ? <span className="gmail-status-badge error">Falhou</span>
              : <span className="gmail-status-badge sent">Enviado</span>
            }
          </div>
          <div className="gmail-detail-date">{formatDateFull(email.created_at)}</div>
        </div>
      </div>

      {email.error_message && (
        <div className="gmail-error-banner">
          <AlertCircle size={15} />
          {email.error_message}
        </div>
      )}

      <div className="gmail-detail-body">
        {email.body_html
          ? (
            <iframe
              srcDoc={email.body_html}
              title="Conteúdo do email"
              className="gmail-body-iframe"
              sandbox="allow-same-origin"
            />
          )
          : <p className="mail-empty-copy">(Sem conteúdo HTML)</p>
        }
      </div>
    </div>
  );

  const renderReceivedMailbox = (rows, emptyTitle, emptyText) => {
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

    const selectedInRows = selectedReceivedEmail && rows.some((email) => String(email.id) === String(selectedReceivedEmail.id));

    return (
      <div className={`gmail-pane${selectedInRows ? ' has-detail' : ''}`}>
        <div className="gmail-list">
          {rows.map((email) => {
            const isSelected = selectedReceivedEmail && String(selectedReceivedEmail.id) === String(email.id);
            return (
              <div
                key={email.id}
                className={`gmail-row${isSelected ? ' gmail-row-selected' : ''}${email.is_read ? '' : ' gmail-row-unread'}${email.importante ? ' gmail-row-important' : ''}`}
                onClick={() => handleOpenReceivedEmail(email)}
              >
                <button
                  type="button"
                  className={`gmail-row-star-btn ${email.favorito ? 'is-active' : ''}`}
                  title={email.favorito ? 'Remover favorito' : 'Favoritar'}
                  onClick={(event) => handleToggleReceivedFavorito(event, email)}
                >
                  <Star size={15} fill={email.favorito ? 'currentColor' : 'none'} />
                </button>
                <div className="gmail-row-avatar">
                  {((email.from_name || email.from_email || '?')[0] || '?').toUpperCase()}
                </div>
                <div className="gmail-row-body">
                  <div className="gmail-row-top">
                    <span className="gmail-row-recipient">{email.from_name || email.from_email || '-'}</span>
                    <span className="gmail-row-date">{email.received_at ? formatDate(email.received_at) : ''}</span>
                  </div>
                  <div className="gmail-row-subject">{email.subject || '(sem assunto)'}</div>
                  <div className="gmail-row-preview">{email.body_text || email.from_email || 'Sem preview disponivel'}</div>
                </div>
                {email.importante ? (
                  <span className="mail-row-tag mail-row-tag-warning">
                    {email.importante_auto ? 'Auto' : 'Importante'}
                  </span>
                ) : null}
                <div className="gmail-row-menu" onClick={(event) => event.stopPropagation()}>
                  <button
                    className="gmail-row-menu-btn"
                    title="Mais a-es"
                    onClick={(event) => { event.stopPropagation(); setOpenMenuId(openMenuId === `received-${email.id}` ? null : `received-${email.id}`); }}
                  >
                    <MoreVertical size={16} />
                  </button>
                  {openMenuId === `received-${email.id}` && (
                    <div className="gmail-row-dropdown">
                      <button onClick={(event) => handleToggleReceivedFavorito(event, email)}>
                        <Star size={14} />
                        {email.favorito ? 'Remover favorito' : 'Favoritar'}
                      </button>
                      <button onClick={(event) => handleToggleReceivedImportante(event, email)}>
                        <AlertCircle size={14} />
                        {email.importante ? 'Remover importante' : 'Marcar importante'}
                      </button>
                      <button onClick={(event) => handleToggleReceivedRead(event, email)}>
                        <Mail size={14} />
                        {email.is_read ? 'Marcar como não lido' : 'Marcar como lido'}
                      </button>
                      <button className="gmail-dropdown-danger" onClick={(event) => handleDeleteReceivedEmail(email, event)}>
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
        {selectedInRows && renderReceivedDetail(selectedReceivedEmail)}
      </div>
    );
  };

  const renderCombinedMailbox = (items, emptyTitle, emptyText) => {
    if (loadingHistory) {
      return (
        <div className="loading-spinner">
          <Loader className="spinning" size={32} />
        </div>
      );
    }

    if (!items.length) {
      return (
        <div className="empty-state">
          <Mail size={42} />
          <h3>{emptyTitle}</h3>
          <p>{emptyText}</p>
        </div>
      );
    }

    const rows = items
      .map((item) => ({
        ...item,
        sortDate: new Date(item.kind === 'received' ? item.email.received_at : item.email.created_at).getTime() || 0
      }))
      .sort((a, b) => b.sortDate - a.sortDate);
    const selectedReceivedInRows = selectedReceivedEmail && rows.some((item) => item.kind === 'received' && String(item.email.id) === String(selectedReceivedEmail.id));
    const selectedSentInRows = selectedEmail && rows.some((item) => item.kind === 'sent' && String(item.email.id) === String(selectedEmail.id));

    return (
      <div className={`gmail-pane${selectedReceivedInRows || selectedSentInRows ? ' has-detail' : ''}`}>
        <div className="gmail-list">
          {rows.map(({ kind, email }) => {
            const isReceived = kind === 'received';
            const isSelected = isReceived
              ? selectedReceivedEmail && String(selectedReceivedEmail.id) === String(email.id)
              : selectedEmail && String(selectedEmail.id) === String(email.id);
            const title = isReceived ? (email.from_name || email.from_email || '-') : (email.recipient_email || '-');
            const date = isReceived ? email.received_at : email.created_at;
            return (
              <div
                key={`${kind}-${email.id}`}
                className={`gmail-row${isSelected ? ' gmail-row-selected' : ''}${isReceived && !email.is_read ? ' gmail-row-unread' : ''}${isReceived && email.importante ? ' gmail-row-important' : ''}`}
                onClick={() => (isReceived ? handleOpenReceivedEmail(email) : handleViewDetails(email))}
              >
                <button
                  type="button"
                  className={`gmail-row-star-btn ${email.favorito ? 'is-active' : ''}`}
                  title={email.favorito ? 'Remover favorito' : 'Favoritar'}
                  onClick={(event) => (isReceived ? handleToggleReceivedFavorito(event, email) : handleToggleFavorito(event, email))}
                >
                  <Star size={15} fill={email.favorito ? 'currentColor' : 'none'} />
                </button>
                <div className="gmail-row-avatar">{(title[0] || '?').toUpperCase()}</div>
                <div className="gmail-row-body">
                  <div className="gmail-row-top">
                    <span className="gmail-row-recipient">{title}</span>
                    <span className="gmail-row-date">{date ? formatDate(date) : ''}</span>
                  </div>
                  <div className="gmail-row-subject">{email.subject || '(sem assunto)'}</div>
                  <div className="gmail-row-preview">{isReceived ? (email.body_text || email.from_email || 'Recebido') : (email.status === 'ERRO' ? email.error_message : 'Enviado')}</div>
                </div>
                <span className="mail-row-tag">{isReceived ? 'Recebido' : 'Enviado'}</span>
              </div>
            );
          })}
        </div>
        {selectedReceivedInRows && renderReceivedDetail(selectedReceivedEmail)}
        {selectedSentInRows && renderSentDetail(selectedEmail)}
      </div>
    );
  };

  const renderDraftsMailbox = () => {
    if (!sortedDrafts.length) {
      return (
        <div className="empty-state">
          <FileText size={42} />
          <h3>Nenhum rascunho salvo</h3>
          <p>Comece um email e use “Salvar rascunho” para continuar depois.</p>
        </div>
      );
    }

    return (
      <div className="gmail-pane drafts-pane">
        <div className="gmail-list drafts-list">
          {sortedDrafts.map((draft) => {
            const preview = getComposerPlainText(draft.html_body) || 'Sem conteúdo';
            return (
              <div
                key={draft.id}
                className={`gmail-row draft-row${activeDraftId === draft.id ? ' gmail-row-selected' : ''}`}
                onClick={() => handleOpenDraft(draft)}
              >
                <div className="gmail-row-avatar draft-avatar">
                  <FileText size={15} />
                </div>
                <div className="gmail-row-body">
                  <div className="gmail-row-top">
                    <span className="gmail-row-recipient">{draft.to_email || 'Sem destinatário'}</span>
                    <span className="gmail-row-date">{draft.updatedAt ? formatDate(draft.updatedAt) : ''}</span>
                  </div>
                  <div className="gmail-row-subject">{draft.subject || '(sem assunto)'}</div>
                  <div className="gmail-row-preview">{preview}</div>
                  {draft.attachmentNames?.length ? (
                    <div className="draft-attachment-note">
                      {draft.attachmentNames.length} anexo(s) precisam ser adicionados novamente
                    </div>
                  ) : null}
                </div>
                <div className="draft-row-actions" onClick={(event) => event.stopPropagation()}>
                  <button type="button" className="mail-icon-button" title="Continuar edição" onClick={() => handleOpenDraft(draft)}>
                    <Send size={15} />
                  </button>
                  <button type="button" className="mail-icon-button is-danger" title="Excluir rascunho" onClick={(event) => handleDeleteDraft(draft.id, event)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
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
                    {item.key === 'rascunhos' && drafts.length > 0 && (
                      <span className="mail-menu-count">{drafts.length}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="mail-main">
            {activeTab === 'recebidos' && (
              <div className="tab-pane">
                <div className="mail-sync-actions">
                  <button
                    type="button"
                    className="btn-primary mail-sync-button"
                    onClick={handleSyncImap}
                    disabled={syncingImap}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '7px 14px' }}
                  >
                    {syncingImap ? <Loader size={15} className="spinning" /> : <Inbox size={15} />}
                    {syncingImap ? 'Sincronizando...' : 'Sincronizar Caixa de Entrada'}
                  </button>
                </div>
                {imapSyncState.status !== 'idle' && (
                  <div
                    style={{
                      marginBottom: '12px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      border: imapSyncState.status === 'error' ? '1px solid #fecaca' : '1px solid #bfdbfe',
                      background: imapSyncState.status === 'error' ? '#fef2f2' : '#eff6ff',
                      color: imapSyncState.status === 'error' ? '#991b1b' : '#1e3a8a'
                    }}
                  >
                    <strong>{imapSyncState.message}</strong>
                    {imapSyncState.detail && imapSyncState.detail !== imapSyncState.message && (
                      <div style={{ marginTop: '4px', opacity: 0.9 }}>{imapSyncState.detail}</div>
                    )}
                    {imapSyncState.at && (
                      <div style={{ marginTop: '4px', opacity: 0.75 }}>
                        Última tentativa: {new Date(imapSyncState.at).toLocaleString('pt-BR')}
                      </div>
                    )}
                  </div>
                )}
                {renderReceivedMailbox(
                  receivedInboxEmails,
                  'Nenhum email recebido',
                  'Configure o IMAP na aba Configurações. A sincronização automática busca novos emails periodicamente.'
                )}
                {false && (
                  <>
                {receivedEmails.length === 0 ? (
                  <div className="empty-state">
                    <Inbox size={42} />
                    <h3>Nenhum email recebido</h3>
                    <p>Configure o IMAP na aba Configurações. A sincronização automática busca novos emails periodicamente.</p>
                  </div>
                ) : (
                  !selectedReceivedEmail ? (
                    <div className="gmail-pane">
                      <div className="gmail-list">
                        {receivedEmails.map((email) => (
                          <div
                            key={email.id}
                            className="gmail-row"
                            onClick={() => setSelectedReceivedEmail(email)}
                          >
                            <div className="gmail-row-avatar">
                              {((email.from_name || email.from_email || '?')[0] || '?').toUpperCase()}
                            </div>
                            <div className="gmail-row-body">
                              <div className="gmail-row-top">
                                <span className="gmail-row-recipient">{email.from_name || email.from_email}</span>
                                <span className="gmail-row-date">{email.received_at ? formatDate(email.received_at) : ''}</span>
                              </div>
                              <div className="gmail-row-subject">{email.subject || '(sem assunto)'}</div>
                              {email.from_email && <div className="gmail-row-preview">{email.from_email}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="received-mail-reader">
                      <div className="received-mail-reader-topbar">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setSelectedReceivedEmail(null)}
                        >
                          <ArrowLeft size={16} style={{ marginRight: 6 }} />
                          Voltar
                        </button>
                        <div className="received-mail-reader-actions">
                          <button
                            type="button"
                            className="btn-action-email btn-reply"
                            title="Responder"
                            onClick={() => handleReplyEmail(selectedReceivedEmail)}
                          >
                            <Reply size={16} />
                            Responder
                          </button>
                          <button
                            type="button"
                            className="btn-action-email btn-forward"
                            title="Encaminhar"
                            onClick={() => handleForwardEmail(selectedReceivedEmail)}
                          >
                            <Forward size={16} />
                            Encaminhar
                          </button>
                          <button
                            type="button"
                            className="btn-action-email btn-delete"
                            title="Excluir"
                            onClick={() => handleDeleteReceivedEmail(selectedReceivedEmail)}
                          >
                            <Trash2 size={16} />
                            Excluir
                          </button>
                        </div>
                      </div>

                      <div className="gmail-detail received-mail-reader-detail">
                        <div className="gmail-detail-header">
                          <h2 className="gmail-detail-subject">{selectedReceivedEmail.subject || '(sem assunto)'}</h2>
                        </div>

                        <div className="gmail-detail-meta">
                          <div className="gmail-detail-avatar">{((selectedReceivedEmail.from_name || selectedReceivedEmail.from_email || '?')[0] || '?').toUpperCase()}</div>
                          <div>
                            <div className="gmail-detail-from">
                              De: <strong>{selectedReceivedEmail.from_name || selectedReceivedEmail.from_email}</strong>
                            </div>
                            <div className="gmail-detail-date">
                              {selectedReceivedEmail.received_at ? formatDateFull(selectedReceivedEmail.received_at) : '-'}
                            </div>
                          </div>
                        </div>

                        <div className="gmail-detail-body">
                          {selectedReceivedEmail.body_html
                            ? (
                              <div
                                className="gmail-detail-body-content"
                                dangerouslySetInnerHTML={{ __html: selectedReceivedEmail.body_html }}
                              />
                            )
                            : (
                              <div className="gmail-detail-body-content">
                                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '13px' }}>{selectedReceivedEmail.body_text || '(Sem conteúdo)'}</pre>
                              </div>
                            )
                          }
                        </div>

                        <div className="received-mail-reader-footer">
                          <button
                            type="button"
                            className="btn-action-email btn-reply"
                            onClick={() => handleReplyEmail(selectedReceivedEmail)}
                          >
                            <Reply size={16} />
                            Responder
                          </button>
                          <button
                            type="button"
                            className="btn-action-email btn-forward"
                            onClick={() => handleForwardEmail(selectedReceivedEmail)}
                          >
                            <Forward size={16} />
                            Encaminhar
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )}
                  </>
                )}
              </div>
            )}
            {activeTab === 'importantes' && (
              <div className="tab-pane">
                {renderReceivedMailbox(
                  importantReceivedEmails,
                  'Nenhum email importante',
                  'Emails com alerta, segurança, prazo, acesso ou cobrança entram aqui automaticamente, e você também pode marcar manualmente.'
                )}
              </div>
            )}

            {false && activeTab === 'importantes' && (
              <div className="tab-pane">
                <div className="empty-state">
                  <AlertCircle size={42} />
                  <h3>Nenhum email importante</h3>
                  <p>Marque mensagens como importantes para vê-las aqui.</p>
                </div>
              </div>
            )}

            {activeTab === 'favoritos' && (
              <div className="tab-pane">
                {renderCombinedMailbox(
                  [
                    ...favoriteReceivedEmails.map((email) => ({ kind: 'received', email })),
                    ...favoriteSentEmails.map((email) => ({ kind: 'sent', email }))
                  ],
                  'Nenhum favorito',
                  'Marque emails recebidos ou enviados com estrela para vê-los aqui.'
                )}
              </div>
            )}

            {activeTab === 'rascunhos' && (
              <div className="tab-pane">
                {renderDraftsMailbox()}
              </div>
            )}

            {false && activeTab === 'favoritos' && (
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
                  <h3>Sem emails em spam</h3>
                  <p>Quando houver mensagens suspeitas, elas serão listadas aqui.</p>
                </div>
              </div>
            )}

            {activeTab === 'lixeira' && (
              <div className="tab-pane">
                {renderCombinedMailbox(
                  [
                    ...trashedReceivedEmails.map((email) => ({ kind: 'received', email })),
                    ...trashedSentEmails.map((email) => ({ kind: 'sent', email }))
                  ],
                  'Lixeira vazia',
                  'Emails excluídos aparecem aqui. Abra um item para excluir permanentemente quando necessário.'
                )}
              </div>
            )}

            {false && activeTab === 'lixeira' && (
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
                  {activeDraftId && (
                    <div className="draft-editing-banner">
                      <FileText size={15} />
                      Editando rascunho salvo
                    </div>
                  )}

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
                        placeholder="Informe o email"
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
                      placeholder="Assunto do email"
                      required
                    />
                  </div>

                  <div className="form-section">
                    <label>Corpo do email *</label>
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
                    {replyContext && (
                      <div className="reply-context-card">
                        <div className="reply-context-main">
                          <div className="reply-context-avatar">
                            {((replyContext.fromName || replyContext.fromEmail || '?')[0] || '?').toUpperCase()}
                          </div>
                          <div className="reply-context-copy">
                            <div className="reply-context-title">
                              {replyContext.type === 'forward' ? 'Encaminhando mensagem' : 'Respondendo mensagem'}
                            </div>
                            <div className="reply-context-meta">
                              {replyContext.fromName || replyContext.fromEmail || '-'}
                              {replyContext.date ? ` - ${formatDateFull(replyContext.date)}` : ''}
                            </div>
                            <details className="reply-context-details">
                              <summary>Mostrar mensagem original</summary>
                              <div className="reply-context-preview">
                                {replyContext.bodyText || replyContext.subject || 'Sem preview disponivel'}
                              </div>
                            </details>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="reply-context-remove"
                          onClick={() => setReplyContext(null)}
                          title="Remover mensagem original"
                        >
                          <XCircle size={16} />
                        </button>
                      </div>
                    )}
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
                      onClick={handleClearComposer}
                      className="btn-secondary"
                      disabled={sendingEmail}
                    >
                      Limpar
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      className="btn-secondary"
                      disabled={sendingEmail}
                    >
                      <Save size={18} />
                      {activeDraftId ? 'Atualizar rascunho' : 'Salvar rascunho'}
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
                {renderHistoryTable(emailsSent, 'Nenhum email enviado', 'Os envios aparecerão aqui.')}
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
                      <label>{hasSavedEmailConfig ? 'Senha' : 'Senha *'}</label>
                      <input
                        type="password"
                        name="smtp_pass"
                        value={configFormData.smtp_pass}
                        onChange={handleConfigChange}
                        className="form-input"
                        required={!hasSavedEmailConfig}
                        placeholder={hasSavedEmailConfig ? 'deixe em branco para manter a senha atual' : ''}
                      />
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
                        {testResult.success ? testResult.message : resolveSmtpTestErrorMsg(testResult.message)}
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
