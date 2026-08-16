import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CalendarX,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Eye,
  EyeOff,
  FileText,
  HardHat,
  Layers3,
  Mail,
  Menu,
  PackageCheck,
  ShieldCheck,
  X,
} from 'lucide-react';
import { cancelarConta, enviarContato, esqueciSenha, login as loginAPI, registerTrialAccount, renovarTrial } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Landing.css';

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';

const formatBrazilianPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const modules = [
  { icon: Layers3, title: 'Projetos e EAP', text: 'Estruture etapas, atividades, responsáveis e avanços em uma única visão.' },
  { icon: Clock3, title: 'RDO', text: 'Registre diários de obra com histórico, revisões e evidências de campo.' },
  { icon: ClipboardCheck, title: 'RNC', text: 'Acompanhe não conformidades, tratativas e correções com rastreabilidade.' },
  { icon: PackageCheck, title: 'Compras e ativos', text: 'Controle requisições, cotações, ferramentas, retiradas e devoluções.' },
];

const features = [
  'Planejamento e execução conectados',
  'Qualidade com evidências rastreáveis',
  'Suprimentos e ativos no mesmo fluxo',
];

const workflowSteps = [
  { icon: Layers3, number: '01', title: 'Planeje', text: 'Organize escopo, etapas, responsáveis e prazos em uma EAP clara.' },
  { icon: Clock3, number: '02', title: 'Acompanhe', text: 'Registre a rotina da obra com RDOs, históricos e evidências de campo.' },
  { icon: ClipboardCheck, number: '03', title: 'Controle', text: 'Trate não conformidades e acompanhe cada correção até a conclusão.' },
  { icon: BarChart3, number: '04', title: 'Decida', text: 'Transforme a operação em indicadores objetivos para a gestão.' },
];

const normalizeAuthErrorMessage = (msg) => String(msg || '');

const getPasswordStrength = (value) => {
  const pwd = String(value || '');
  if (!pwd) return { level: 'fraca', label: 'Fraca', color: '#ef4444' };

  const upper = (pwd.match(/[A-Z]/g) || []).length;
  const lower = (pwd.match(/[a-z]/g) || []).length;
  const digits = (pwd.match(/\d/g) || []).length;
  const special = (pwd.match(/[^A-Za-z0-9]/g) || []).length;

  let score = 0;
  if (pwd.length >= 6) score += 1;
  if (pwd.length >= 8) score += 1;
  if (pwd.length >= 12) score += 1;
  if (upper > 0) score += 1;
  if (upper >= 2) score += 1;
  if (lower > 0) score += 1;
  if (digits > 0) score += 1;
  if (digits >= 3) score += 1;
  if (special > 0) score += 1;
  if (special >= 2) score += 1;

  if (score <= 3) return { level: 'fraca', label: 'Fraca', color: '#ef4444' };
  if (score <= 6) return { level: 'medio', label: 'Médio', color: '#f59e0b' };
  if (score <= 8) return { level: 'forte', label: 'Forte', color: '#10b981' };
  return { level: 'extraforte', label: 'Extraforte', color: '#0ea5e9' };
};

const isSequentialPassword = (value) => {
  const pwd = String(value || '').toLowerCase().replace(/\s+/g, '');
  if (!pwd) return false;
  return [
    '123456', '1234567', '12345678', '123456789', '0123456789',
    'qwerty', 'qwertyu', 'qwertyuiop', 'asdfgh', 'asdfghj', 'zxcvbn',
    'abcdef', 'abcdefg', 'abcdefgh', 'abcdefghi', 'password',
  ].some((seq) => pwd.includes(seq));
};

const normalizeName = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, '')
  .replace(/[^a-z0-9]/g, '');

const buildUsernameFromName = (name) => {
  const base = normalizeName(name).slice(0, 14) || 'usuario';
  const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `${base}${suffix}`;
};

function Landing({ initialAccess = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(initialAccess);
  const [accessMode, setAccessMode] = useState('login');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({ usuario: '', senha: '' });
  const [cadastroForm, setCadastroForm] = useState({ nome: '', empresa: '', email: '', usuario: '', senha: '', codigo_acesso: '' });
  const [usuarioManual, setUsuarioManual] = useState(false);
  const [showSenha, setShowSenha] = useState(false);
  const [showCadastroSenha, setShowCadastroSenha] = useState(false);
  const [manterLogin, setManterLogin] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [loading, setLoading] = useState(false);
  const [esqueciLogin, setEsqueciLogin] = useState('');
  const [trialExpirado, setTrialExpirado] = useState(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [cancelandoConta, setCancelandoConta] = useState(false);
  const [codigoRenovacao, setCodigoRenovacao] = useState('');
  const [tentandoRenovar, setTentandoRenovar] = useState(false);
  const [contactForm, setContactForm] = useState({ nome: '', email: '', empresa: '', telefone: '', mensagem: '' });
  const [contactError, setContactError] = useState('');
  const [contactSuccess, setContactSuccess] = useState('');
  const [contactSending, setContactSending] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaError, setCaptchaError] = useState('');

  const accessRef = useRef(null);
  const lastFocusedRef = useRef(null);
  const recaptchaRef = useRef(null);
  const recaptchaWidgetIdRef = useRef(null);
  const navigate = useNavigate();
  const { loginAuth } = useAuth();

  const closeMenu = () => setMenuOpen(false);

  const openAccess = () => {
    if (document.activeElement instanceof HTMLElement) {
      lastFocusedRef.current = document.activeElement;
    }
    setAccessOpen(true);
    setAccessMode('login');
    setForgotOpen(false);
    setErro('');
    setSucesso('');
    closeMenu();
  };

  const closeAccess = () => setAccessOpen(false);

  useEffect(() => {
    if (!accessOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const panel = accessRef.current;
    const focusableSelector = [
      'button:not([disabled])',
      'a[href]',
      'input:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    document.body.style.overflow = 'hidden';

    const focusTimer = window.requestAnimationFrame(() => {
      const firstFocusable = panel?.querySelector('[autofocus]') || panel?.querySelector(focusableSelector);
      firstFocusable?.focus();
    });

    const handleKeyDown = (event) => {
      if (trialExpirado) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        setAccessOpen(false);
        return;
      }

      if (event.key !== 'Tab' || !panel) return;

      const focusable = Array.from(panel.querySelectorAll(focusableSelector))
        .filter((element) => element instanceof HTMLElement && element.offsetParent !== null);

      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      window.setTimeout(() => lastFocusedRef.current?.focus(), 0);
    };
  }, [accessOpen, trialExpirado]);

  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY) {
      setCaptchaError('O formulário de contato está temporariamente indisponível.');
      return undefined;
    }

    let cancelled = false;
    const renderCaptcha = () => {
      if (cancelled || !recaptchaRef.current || recaptchaWidgetIdRef.current !== null || !window.grecaptcha?.render) return;
      recaptchaWidgetIdRef.current = window.grecaptcha.render(recaptchaRef.current, {
        sitekey: RECAPTCHA_SITE_KEY,
        callback: (token) => {
          setCaptchaToken(token);
          setCaptchaError('');
        },
        'expired-callback': () => setCaptchaToken(''),
        'error-callback': () => {
          setCaptchaToken('');
          setCaptchaError('Não foi possível carregar a verificação. Tente novamente.');
        },
      });
    };

    const existingScript = document.getElementById('google-recaptcha-script');
    const script = existingScript || document.createElement('script');
    if (!existingScript) {
      script.id = 'google-recaptcha-script';
      script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    if (window.grecaptcha?.render) renderCaptcha();
    else script.addEventListener('load', renderCaptcha);

    return () => {
      cancelled = true;
      script.removeEventListener('load', renderCaptcha);
    };
  }, []);

  const handleCadastro = async (event) => {
    event.preventDefault();
    setErro('');
    setSucesso('');

    const usuario = cadastroForm.usuario.trim();

    if (!cadastroForm.nome.trim()) {
      setErro('Nome é obrigatório.');
      return;
    }
    if (!cadastroForm.empresa.trim()) {
      setErro('Empresa é obrigatória.');
      return;
    }
    if (!cadastroForm.email.trim()) {
      setErro('E-mail é obrigatório.');
      return;
    }
    if (!usuario) {
      setErro('Usuário é obrigatório.');
      return;
    }
    if (!cadastroForm.senha) {
      setErro('Senha é obrigatória.');
      return;
    }
    if (isSequentialPassword(cadastroForm.senha)) {
      setErro('Senhas sequenciais não são aceitas.');
      return;
    }

    const senhaStrength = getPasswordStrength(cadastroForm.senha);
    if (senhaStrength.level === 'fraca') {
      setErro('Senha muito fraca. Use uma senha com nível mínimo Médio.');
      return;
    }

    if (!cadastroForm.codigo_acesso.trim()) {
      setErro('Código global é obrigatório para criar conta.');
      return;
    }

    setLoading(true);
    try {
      const response = await registerTrialAccount({
        nome: cadastroForm.nome.trim(),
        empresa: cadastroForm.empresa.trim(),
        email: cadastroForm.email.trim(),
        usuario,
        senha: cadastroForm.senha,
        codigo_acesso: cadastroForm.codigo_acesso.trim(),
      });

      const loginCriado = response.data?.usuario || usuario;
      setSucesso(`Conta criada com sucesso. Usuário: ${loginCriado}`);
      setAccessMode('login');
      setLoginForm((prev) => ({ ...prev, usuario: loginCriado }));
      setCadastroForm({ nome: '', empresa: '', email: '', usuario: '', senha: '', codigo_acesso: '' });
      setUsuarioManual(false);
    } catch (error) {
      setErro(normalizeAuthErrorMessage(error.response?.data?.erro || 'Erro ao criar conta.'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setErro('');
    setSucesso('');

    const credential = loginForm.usuario.trim();
    if (!credential) {
      setErro('Informe seu usuário ou e-mail.');
      return;
    }

    if (!loginForm.senha) {
      setErro('Informe a senha.');
      return;
    }

    setLoading(true);
    try {
      const response = await loginAPI({
        usuario: credential,
        senha: loginForm.senha,
        manterLogin,
      });
      loginAuth(response.data.token, response.data.usuario, manterLogin);
      navigate(response.data?.usuario?.primeiro_acesso_pendente ? '/primeiro-acesso' : '/projetos');
    } catch (error) {
      const codigo = error.response?.data?.codigo;
      if (codigo === 'TRIAL_EXPIRADO') {
        setTrialExpirado({
          tenant_id: error.response.data.tenant_id,
          login: credential,
          senha: loginForm.senha,
        });
      } else {
        setErro(normalizeAuthErrorMessage(error.response?.data?.erro || 'Erro ao fazer login.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEsqueciSenha = async (event) => {
    event.preventDefault();
    setErro('');
    setSucesso('');

    if (!esqueciLogin.trim()) {
      setErro('Informe seu login ou e-mail.');
      return;
    }

    setLoading(true);
    try {
      await esqueciSenha(esqueciLogin.trim());
      setSucesso('Se o usuário existir, as instruções foram enviadas ao e-mail cadastrado.');
      setEsqueciLogin('');
    } catch {
      setSucesso('Se o usuário existir, as instruções foram enviadas ao e-mail cadastrado.');
    } finally {
      setLoading(false);
    }
  };

  const handleRenovarTrial = async (event) => {
    event.preventDefault();
    setTentandoRenovar(true);
    setErro('');
    try {
      await renovarTrial({
        tenant_id: trialExpirado.tenant_id,
        codigo: codigoRenovacao.trim(),
      });
      const response = await loginAPI({
        usuario: trialExpirado.login,
        senha: trialExpirado.senha,
        manterLogin,
      });
      setTrialExpirado(null);
      setCodigoRenovacao('');
      loginAuth(response.data.token, response.data.usuario, manterLogin);
      navigate(response.data?.usuario?.primeiro_acesso_pendente ? '/primeiro-acesso' : '/projetos');
    } catch (error) {
      setErro(normalizeAuthErrorMessage(error.response?.data?.erro || 'Erro ao renovar trial.'));
    } finally {
      setTentandoRenovar(false);
    }
  };

  const handleCancelarConta = async () => {
    setCancelandoConta(true);
    setErro('');
    try {
      await cancelarConta(trialExpirado);
      setTrialExpirado(null);
      setConfirmarExclusao(false);
      setSucesso('Conta excluída com sucesso.');
    } catch {
      setErro('Erro ao excluir conta. Tente novamente.');
    } finally {
      setCancelandoConta(false);
    }
  };

  const handleContactChange = (event) => {
    const { name, value } = event.target;
    setContactForm((current) => ({
      ...current,
      [name]: name === 'telefone' ? formatBrazilianPhone(value) : value,
    }));
  };

  const resetCaptcha = () => {
    setCaptchaToken('');
    if (recaptchaWidgetIdRef.current !== null && window.grecaptcha?.reset) {
      window.grecaptcha.reset(recaptchaWidgetIdRef.current);
    }
  };

  const handleContactSubmit = async (event) => {
    event.preventDefault();
    setContactError('');
    setContactSuccess('');

    if (!RECAPTCHA_SITE_KEY) {
      setContactError('O formulário de contato está temporariamente indisponível.');
      return;
    }
    if (!captchaToken) {
      setCaptchaError('Confirme que você não é um robô antes de enviar.');
      return;
    }

    setContactSending(true);
    try {
      await enviarContato({ ...contactForm, recaptchaToken: captchaToken });
      setContactSuccess('Mensagem enviada com sucesso. Em breve nossa equipe entrará em contato.');
      setContactForm({ nome: '', email: '', empresa: '', telefone: '', mensagem: '' });
      resetCaptcha();
    } catch (error) {
      setContactError(error.response?.data?.erro || 'Não foi possível enviar sua mensagem. Tente novamente.');
      resetCaptcha();
    } finally {
      setContactSending(false);
    }
  };

  return (
    <main className="landing-page">
      <header className="landing-header">
        <div className="landing-container landing-nav">
          <a className="landing-brand" href="#inicio" onClick={closeMenu} aria-label="Vetor Gerenciamento — início">
            <span className="landing-logo-frame" aria-hidden="true"><img src="/logo_vetor_transparente.png" alt="" /></span>
            <span>Vetor <b>Gerenciamento</b></span>
          </a>

          <nav className={`landing-nav-links ${menuOpen ? 'open' : ''}`} aria-label="Navegação principal">
            <a href="#solucoes" onClick={closeMenu}>Soluções</a>
            <a href="#modulos" onClick={closeMenu}>Módulos</a>
            <a href="#seguranca" onClick={closeMenu}>Governança</a>
            <a href="#contato" onClick={closeMenu}>Contato</a>
            <button type="button" className="landing-nav-mobile-access" onClick={openAccess}>
              Acessar sistema
              <ArrowRight size={17} />
            </button>
          </nav>

          <div className="landing-nav-actions">
            <button type="button" className="landing-nav-access" onClick={openAccess}>
              Acessar sistema
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="landing-menu-btn"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>
      </header>

      <section className="landing-hero" id="inicio">
        <div className="landing-hero-grid-lines" aria-hidden="true" />
        <div className="landing-hero-orb landing-hero-orb-one" aria-hidden="true" />
        <div className="landing-hero-orb landing-hero-orb-two" aria-hidden="true" />

        <div className="landing-container landing-hero-grid">
          <div className="landing-hero-copy">
            <span className="landing-kicker landing-kicker-light">Plataforma integrada para gestão de obras</span>
            <h1>
              Sua obra inteira.
              <span>Sob controle.</span>
            </h1>
            <p>
              Planejamento, campo, qualidade e suprimentos reunidos em uma visão clara para sua equipe agir com
              rapidez e rastreabilidade.
            </p>

            <div className="landing-hero-actions">
              <button type="button" className="landing-btn landing-btn-primary" onClick={openAccess}>
                Acessar plataforma
                <ArrowRight size={18} />
              </button>
              <a className="landing-btn landing-btn-ghost" href="#contato">
                <Mail size={18} />
                Solicitar demonstração
              </a>
            </div>

            <div className="landing-hero-points" aria-label="Principais benefícios">
              {features.map((feature) => (
                <span key={feature}>
                  <CheckCircle2 size={17} />
                  {feature}
                </span>
              ))}
            </div>
          </div>

          <div className="landing-product-visual">
            <div className="landing-product-glow" aria-hidden="true" />
            <div className="landing-product-caption">
              <span aria-hidden="true" />
              Visão demonstrativa do produto
            </div>
            <div className="landing-product" aria-label="Prévia visual do sistema Vetor">
              <div className="landing-product-top">
                <span className="landing-product-brand">
                  <span className="landing-logo-frame" aria-hidden="true"><img src="/logo_vetor_transparente.png" alt="" /></span>
                  <b>Vetor</b>
                </span>
                <span className="landing-product-project">Obra Residencial Aurora</span>
                <span className="landing-product-status"><i /> Em andamento</span>
              </div>

              <div className="landing-product-heading">
                <div>
                  <small>Visão geral do projeto</small>
                  <strong>Indicadores da operação</strong>
                </div>
                <span>Atualizado hoje</span>
              </div>

              <div className="landing-product-stats">
                <div>
                  <small>Avanço físico</small>
                  <strong>74%</strong>
                  <span className="landing-stat-positive">Dentro do planejado</span>
                </div>
                <div>
                  <small>RDOs no mês</small>
                  <strong>28</strong>
                  <span>Registros de campo</span>
                </div>
                <div>
                  <small>RNCs abertas</small>
                  <strong>05</strong>
                  <span>Em acompanhamento</span>
                </div>
              </div>

              <div className="landing-product-body">
                <div className="landing-chart-card">
                  <div className="landing-chart-head">
                    <div><b>Evolução física</b><span>Planejado x realizado</span></div>
                    <strong>74%</strong>
                  </div>
                  <div className="landing-chart-bars" aria-hidden="true">
                    <div style={{ height: '46%' }} />
                    <div style={{ height: '58%' }} />
                    <div style={{ height: '53%' }} />
                    <div style={{ height: '74%' }} />
                    <div style={{ height: '68%' }} />
                    <div style={{ height: '88%' }} />
                    <div style={{ height: '81%' }} />
                  </div>
                  <div className="landing-chart-axis" aria-hidden="true"><span>Jan</span><span>Fev</span><span>Mar</span><span>Abr</span><span>Mai</span><span>Jun</span><span>Jul</span></div>
                </div>

                <div className="landing-timeline">
                  <div className="landing-timeline-head"><b>Etapas da obra</b><span>3 etapas</span></div>
                  <span className="done"><i /><b>Fundação</b><em>Concluído</em></span>
                  <span className="active"><i /><b>Estrutura</b><em>Em andamento</em></span>
                  <span><i /><b>Acabamento</b><em>Planejado</em></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-integrations" id="solucoes">
        <div className="landing-container landing-integrations-inner">
          <div className="landing-integrations-copy">
            <span>Uma operação, uma leitura</span>
            <strong>Todos os fluxos conectados ao projeto.</strong>
          </div>
          <div className="landing-integration-track" aria-label="Fluxos integrados">
            {['Projetos', 'EAP', 'RDO', 'RNC', 'Compras', 'Ativos'].map((item, index, items) => (
              <React.Fragment key={item}>
                <span>{item}</span>
                {index < items.length - 1 && <ArrowRight size={14} aria-hidden="true" />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-workflow-section">
        <div className="landing-container">
          <div className="landing-section-intro">
            <div>
              <span className="landing-kicker">Operação conectada</span>
              <h2>Da estratégia ao campo, tudo conversa.</h2>
            </div>
            <p>
              A Vetor organiza o ciclo da obra em um fluxo contínuo. A informação nasce na operação e chega à
              gestão pronta para orientar a próxima decisão.
            </p>
          </div>

          <div className="landing-workflow">
            {workflowSteps.map(({ icon: Icon, number, title, text }) => (
              <article className="landing-workflow-card" key={title}>
                <div className="landing-workflow-card-top">
                  <span><Icon size={21} /></span>
                  <small>{number}</small>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-dark" id="modulos">
        <div className="landing-section-dark-grid" aria-hidden="true" />
        <div className="landing-container">
          <div className="landing-section-intro landing-section-intro-dark">
            <div>
              <span className="landing-kicker landing-kicker-light">Módulos do sistema</span>
              <h2>Ferramentas que trabalham como uma só.</h2>
            </div>
            <p>Do planejamento aos ativos, cada módulo compartilha o contexto do projeto e reduz retrabalho.</p>
          </div>

          <div className="landing-modules">
            {modules.map(({ icon: Icon, title, text }, index) => (
              <article className={`landing-module ${index === 0 ? 'landing-module-featured' : ''}`} key={title}>
                <div className="landing-module-top">
                  <span><Icon size={25} /></span>
                  <small>0{index + 1}</small>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
                <div className="landing-module-foot">
                  <CheckCircle2 size={15} />
                  Conectado ao projeto
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-security-section" id="seguranca">
        <div className="landing-container landing-security">
          <div className="landing-security-copy">
            <span className="landing-kicker">Gestão com governança</span>
            <h2>Controle para a equipe. Clareza para a gestão.</h2>
            <p>
              Cada perfil acessa o que precisa, enquanto documentos, evidências e decisões permanecem vinculados
              à história do projeto.
            </p>
            <div className="landing-security-badge">
              <ShieldCheck size={20} />
              <span><b>Rastreabilidade de ponta a ponta</b>Informação organizada por projeto e por usuário.</span>
            </div>
          </div>

          <div className="landing-governance-panel">
            <div className="landing-governance-head">
              <span><ShieldCheck size={26} /></span>
              <div><small>Governança operacional</small><strong>Informação no fluxo certo</strong></div>
            </div>
            <div className="landing-governance-list">
              <span><i><ShieldCheck size={19} /></i><b>Controle por perfil</b><em>Cada função com os acessos necessários.</em></span>
              <span><i><FileText size={19} /></i><b>Documentos e evidências</b><em>Registros preservados no contexto da obra.</em></span>
              <span><i><BarChart3 size={19} /></i><b>Indicadores executivos</b><em>Leitura objetiva para acompanhar a operação.</em></span>
              <span><i><HardHat size={19} /></i><b>Rotina de campo</b><em>Execução conectada ao planejamento.</em></span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-contact" id="contato">
        <div className="landing-container landing-contact-inner">
          <div className="landing-contact-copy">
            <span className="landing-kicker landing-kicker-light">Próximo passo</span>
            <h2>Pronto para centralizar a gestão da sua obra?</h2>
            <p>Conheça a Vetor e veja como a plataforma se adapta à rotina da sua equipe.</p>
          </div>
          <form className="landing-contact-form" onSubmit={handleContactSubmit}>
            <div className="landing-contact-fields">
              <label>
                <span>Seu nome</span>
                <input name="nome" value={contactForm.nome} onChange={handleContactChange} autoComplete="name" required maxLength="120" />
              </label>
              <label>
                <span>Seu e-mail</span>
                <input type="email" name="email" value={contactForm.email} onChange={handleContactChange} autoComplete="email" required maxLength="254" />
              </label>
              <label>
                <span>Empresa</span>
                <input name="empresa" value={contactForm.empresa} onChange={handleContactChange} autoComplete="organization" required maxLength="160" />
              </label>
              <label>
                <span>Telefone / WhatsApp</span>
                <input type="tel" name="telefone" value={contactForm.telefone} onChange={handleContactChange} autoComplete="tel" inputMode="numeric" placeholder="(11) 99999-9999" required />
              </label>
              <label className="landing-contact-message">
                <span>Como podemos ajudar?</span>
                <textarea name="mensagem" value={contactForm.mensagem} onChange={handleContactChange} required maxLength="4000" />
              </label>
            </div>
            <div className="landing-contact-submit-row">
              <div>
                <div ref={recaptchaRef} className="landing-recaptcha" />
                {captchaError && <p className="landing-contact-feedback error" role="alert">{captchaError}</p>}
              </div>
              <button type="submit" className="landing-btn landing-btn-primary" disabled={contactSending || !RECAPTCHA_SITE_KEY}>
                <Mail size={18} />
                {contactSending ? 'Enviando mensagem...' : 'Enviar mensagem'}
              </button>
            </div>
            {contactError && <p className="landing-contact-feedback error" role="alert">{contactError}</p>}
            {contactSuccess && <p className="landing-contact-feedback success" role="status">{contactSuccess}</p>}
          </form>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <a className="landing-footer-brand" href="#inicio" aria-label="Voltar ao início">
            <span className="landing-logo-frame" aria-hidden="true"><img src="/logo_vetor_transparente.png" alt="" /></span>
            <span>Vetor <b>Gerenciamento</b></span>
          </a>
          <span>© {new Date().getFullYear()} Vetor Gerenciamento. Todos os direitos reservados.</span>
          <a href="#contato">Fale com a Vetor</a>
        </div>
      </footer>

      {accessOpen && (
        <div
          className="landing-access-overlay"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeAccess(); }}
          role="presentation"
        >
          <aside
            className="landing-access-panel"
            ref={accessRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="landing-access-title"
            aria-describedby="landing-access-description"
          >
            <div className="landing-access-panel-top">
              <div className="landing-access-brand">
                <span className="landing-logo-frame" aria-hidden="true"><img src="/logo_vetor_transparente.png" alt="" /></span>
                <span><b>Vetor Gerenciamento</b>Área do cliente</span>
              </div>
              <button type="button" className="landing-access-close" onClick={closeAccess} aria-label="Fechar acesso">
                <X size={21} />
              </button>
            </div>

            <div className="landing-access-scroll">
              <div className="landing-access-intro">
                <span className="landing-access-eyebrow">Acesso à plataforma</span>
                <h2 id="landing-access-title">
                  {forgotOpen ? 'Recupere seu acesso' : accessMode === 'cadastro' ? 'Crie sua conta' : 'Bem-vindo de volta'}
                </h2>
                <p id="landing-access-description">
                  {forgotOpen
                    ? 'Informe seu login ou e-mail cadastrado para receber as instruções.'
                    : accessMode === 'cadastro'
                      ? 'Preencha os dados abaixo para começar a organizar seus projetos.'
                      : 'Entre com seus dados para acessar projetos, indicadores e rotinas de obra.'}
                </p>
              </div>

              {!forgotOpen && (
                <div className="landing-access-tabs" role="tablist" aria-label="Tipo de acesso">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={accessMode === 'login'}
                    className={accessMode === 'login' ? 'active' : ''}
                    onClick={() => { setAccessMode('login'); setErro(''); setSucesso(''); }}
                  >
                    Entrar
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={accessMode === 'cadastro'}
                    className={accessMode === 'cadastro' ? 'active' : ''}
                    onClick={() => { setAccessMode('cadastro'); setErro(''); setSucesso(''); }}
                  >
                    Criar conta
                  </button>
                </div>
              )}

              {erro && <div className="landing-access-alert error" role="alert">{erro}</div>}
              {sucesso && <div className="landing-access-alert success" role="status">{sucesso}</div>}

              {forgotOpen ? (
                <form className="landing-access-form" onSubmit={handleEsqueciSenha}>
                  <label>
                    Login ou e-mail
                    <input
                      type="text"
                      maxLength="120"
                      value={esqueciLogin}
                      onChange={(event) => setEsqueciLogin(event.target.value.trimStart())}
                      placeholder="Seu login ou e-mail"
                      autoFocus
                      required
                    />
                  </label>

                  <button className="landing-access-submit" type="submit" disabled={loading}>
                    {loading ? 'Enviando...' : 'Enviar instruções'}
                    <ArrowRight size={18} />
                  </button>

                  <button
                    className="landing-access-link"
                    type="button"
                    onClick={() => { setForgotOpen(false); setErro(''); setSucesso(''); }}
                  >
                    Voltar ao login
                  </button>
                </form>
              ) : accessMode === 'cadastro' ? (
                <form className="landing-access-form landing-access-form-register" onSubmit={handleCadastro}>
                  <label>
                    Nome completo
                    <input
                      type="text"
                      maxLength="80"
                      value={cadastroForm.nome}
                      onChange={(event) => {
                        const nome = event.target.value;
                        setCadastroForm((prev) => ({
                          ...prev,
                          nome,
                          usuario: usuarioManual ? prev.usuario : buildUsernameFromName(nome),
                        }));
                      }}
                      placeholder="Seu nome"
                      autoFocus
                      required
                    />
                  </label>

                  <label>
                    Empresa
                    <input
                      type="text"
                      maxLength="80"
                      value={cadastroForm.empresa}
                      onChange={(event) => setCadastroForm((prev) => ({ ...prev, empresa: event.target.value }))}
                      placeholder="Nome da empresa"
                      required
                    />
                  </label>

                  <label>
                    E-mail
                    <input
                      type="email"
                      maxLength="120"
                      value={cadastroForm.email}
                      onChange={(event) => setCadastroForm((prev) => ({ ...prev, email: event.target.value }))}
                      placeholder="seuemail@empresa.com"
                      required
                    />
                  </label>

                  <label>
                    Usuário
                    <input
                      type="text"
                      maxLength="40"
                      value={cadastroForm.usuario}
                      onChange={(event) => {
                        setUsuarioManual(true);
                        setCadastroForm((prev) => ({ ...prev, usuario: event.target.value.replace(/\s+/g, '') }));
                      }}
                      placeholder="seunome1234"
                      required
                    />
                  </label>

                  <label>
                    Senha
                    <span className="landing-password-wrap">
                      <input
                        type={showCadastroSenha ? 'text' : 'password'}
                        maxLength="72"
                        value={cadastroForm.senha}
                        onChange={(event) => setCadastroForm((prev) => ({ ...prev, senha: event.target.value }))}
                        placeholder="Digite sua senha"
                        required
                      />
                      <button type="button" onClick={() => setShowCadastroSenha((value) => !value)} aria-label={showCadastroSenha ? 'Ocultar senha' : 'Mostrar senha'}>
                        {showCadastroSenha ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </span>
                    {cadastroForm.senha && (
                      <small className="landing-password-hint" style={{ color: getPasswordStrength(cadastroForm.senha).color }}>
                        Nível da senha: <b>{getPasswordStrength(cadastroForm.senha).label}</b>
                      </small>
                    )}
                  </label>

                  <label>
                    Código global de criação
                    <input
                      type="text"
                      value={cadastroForm.codigo_acesso}
                      onChange={(event) => setCadastroForm((prev) => ({ ...prev, codigo_acesso: event.target.value }))}
                      placeholder="Informe o código"
                      required
                    />
                  </label>

                  <button className="landing-access-submit" type="submit" disabled={loading}>
                    {loading ? 'Criando conta...' : 'Criar conta'}
                    <ArrowRight size={18} />
                  </button>
                </form>
              ) : (
                <form className="landing-access-form" onSubmit={handleLogin}>
                  <label>
                    Usuário ou e-mail
                    <input
                      type="text"
                      maxLength="120"
                      value={loginForm.usuario}
                      onChange={(event) => setLoginForm((prev) => ({ ...prev, usuario: event.target.value.trimStart() }))}
                      placeholder="Insira seu usuário ou e-mail"
                      autoFocus
                      required
                    />
                  </label>

                  <label>
                    Senha
                    <span className="landing-password-wrap">
                      <input
                        type={showSenha ? 'text' : 'password'}
                        maxLength="72"
                        value={loginForm.senha}
                        onChange={(event) => setLoginForm((prev) => ({ ...prev, senha: event.target.value }))}
                        placeholder="Insira sua senha"
                        required
                      />
                      <button type="button" onClick={() => setShowSenha((value) => !value)} aria-label={showSenha ? 'Ocultar senha' : 'Mostrar senha'}>
                        {showSenha ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </span>
                  </label>

                  <label className="landing-access-check">
                    <input
                      type="checkbox"
                      checked={manterLogin}
                      onChange={(event) => setManterLogin(event.target.checked)}
                    />
                    Manter minha sessão ativa
                  </label>

                  <button className="landing-access-submit" type="submit" disabled={loading}>
                    {loading ? 'Entrando...' : 'Entrar'}
                    <ArrowRight size={18} />
                  </button>

                  <button
                    className="landing-access-link"
                    type="button"
                    onClick={() => { setForgotOpen(true); setErro(''); setSucesso(''); }}
                  >
                    Esqueci minha senha
                  </button>
                </form>
              )}

              <div className="landing-access-assurance">
                <ShieldCheck size={18} />
                <span><b>Acesso por perfil</b>Você visualiza apenas os projetos e recursos autorizados.</span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {trialExpirado && (
        <div className="landing-trial-modal" role="dialog" aria-modal="true" aria-label="Período de teste encerrado">
          <div className="landing-trial-card">
            <div className="landing-trial-icon">
              <CalendarX size={30} />
            </div>
            <h2>Período de teste encerrado</h2>
            <p>
              Seu período de 30 dias gratuitos expirou. Seus dados estão preservados.
              Informe o código de liberação para continuar usando o sistema, assine quando a opção estiver disponível, ou encerre a conta.
            </p>

            {erro && <div className="landing-access-alert error">{erro}</div>}

            {!confirmarExclusao ? (
              <>
                <form className="landing-access-form" onSubmit={handleRenovarTrial}>
                  <label>
                    Código de renovação
                    <input
                      type="text"
                      value={codigoRenovacao}
                      onChange={(event) => setCodigoRenovacao(event.target.value)}
                      placeholder="Informe o código"
                    />
                  </label>
                  <button className="landing-access-submit" type="submit" disabled={tentandoRenovar || !codigoRenovacao.trim()}>
                    {tentandoRenovar ? 'Renovando...' : 'Renovar trial'}
                  </button>
                </form>
                <button className="landing-access-submit" type="button" disabled>
                  Assinar serviço <span className="landing-soon-badge">EM BREVE</span>
                </button>
                <button className="landing-danger-link" type="button" onClick={() => setConfirmarExclusao(true)}>
                  Encerrar minha conta
                </button>
                <button className="landing-access-link" type="button" onClick={() => { setTrialExpirado(null); setCodigoRenovacao(''); setErro(''); }}>
                  Fechar
                </button>
              </>
            ) : (
              <>
                <div className="landing-access-alert error">
                  Esta ação é irreversível. Todos os projetos, RDOs, EAP, compras e demais dados serão excluídos permanentemente, sem backup e sem possibilidade de recuperação. O e-mail poderá ser usado em uma nova conta futuramente.
                </div>
                <button className="landing-danger-button" type="button" onClick={handleCancelarConta} disabled={cancelandoConta}>
                  {cancelandoConta ? 'Excluindo...' : 'Confirmar exclusão definitiva'}
                </button>
                <button className="landing-access-link" type="button" onClick={() => { setConfirmarExclusao(false); setErro(''); }}>
                  Voltar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

export default Landing;
