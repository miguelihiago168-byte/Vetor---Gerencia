import React, { useRef, useState } from 'react';
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
import { cancelarConta, esqueciSenha, login as loginAPI, registerTrialAccount, renovarTrial } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Landing.css';

const CONTACT_EMAIL = 'contatovetorgerenciamento@gmail.com';

const modules = [
  { icon: Layers3, title: 'Projetos e EAP', text: 'Estruture etapas, atividades, responsáveis e avanços em uma única visão.' },
  { icon: Clock3, title: 'RDO', text: 'Registre diários de obra com histórico, revisões e evidências de campo.' },
  { icon: ClipboardCheck, title: 'RNC', text: 'Acompanhe não conformidades, tratativas e correções com rastreabilidade.' },
  { icon: PackageCheck, title: 'Compras e ativos', text: 'Controle requisições, cotações, ferramentas, retiradas e devoluções.' },
];

const features = [
  'Planejamento físico e acompanhamento por projeto',
  'Indicadores para gestores, fiscais e equipes de qualidade',
  'Fluxos de compras, almoxarifado, RDO e RNC conectados',
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

  const accessRef = useRef(null);
  const navigate = useNavigate();
  const { loginAuth } = useAuth();
  const mailTo = `mailto:${CONTACT_EMAIL}?subject=Quero%20conhecer%20a%20Vetor`;

  const closeMenu = () => setMenuOpen(false);

  const openAccess = () => {
    setAccessOpen(true);
    setAccessMode('login');
    setForgotOpen(false);
    setErro('');
    setSucesso('');
    closeMenu();
    requestAnimationFrame(() => {
      accessRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

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

  return (
    <main className="landing-page">
      <header className="landing-header">
        <div className="landing-container landing-nav">
          <a className="landing-brand" href="#inicio" onClick={closeMenu}>
            <img src="/logo_vetor.png" alt="" />
            <span>Vetor Gerenciamento</span>
          </a>

          <nav className={`landing-nav-links ${menuOpen ? 'open' : ''}`} aria-label="Navegação principal">
            <a href="#solucoes" onClick={closeMenu}>Soluções</a>
            <a href="#modulos" onClick={closeMenu}>Módulos</a>
            <a href="#seguranca" onClick={closeMenu}>Segurança</a>
            <a href="#contato" onClick={closeMenu}>Contato</a>
          </nav>

          <div className="landing-nav-actions">
            <button type="button" className="landing-nav-access" onClick={openAccess}>Acessar sistema</button>
            <button
              type="button"
              className="landing-menu-btn"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </header>

      <section className="landing-hero" id="inicio">
        <div className="landing-container landing-hero-grid">
          <div className="landing-hero-copy">
            <span className="landing-kicker">Gerenciamento, consultoria e tecnologia</span>
            <h1>
              Gestão de obras
              <span>com controle real.</span>
            </h1>
            <p>
              A Vetor centraliza projetos, RDO, RNC, compras, ativos e indicadores para equipes que precisam
              decidir rápido sem perder rastreabilidade.
            </p>
            <div className="landing-hero-actions">
              <button type="button" className="landing-btn landing-btn-primary" onClick={openAccess}>
                Entrar no sistema
                <ArrowRight size={18} />
              </button>
              <a className="landing-btn landing-btn-light" href={mailTo}>
                <Mail size={18} />
                Contato
              </a>
            </div>
            <div className="landing-hero-points">
              {features.map((feature) => (
                <span key={feature}>
                  <CheckCircle2 size={18} />
                  {feature}
                </span>
              ))}
            </div>
          </div>

          {accessOpen ? (
            <section className="landing-access-card" ref={accessRef} aria-label="Acesso ao sistema">
              <div className="landing-access-brand">
                <img src="/logo_vetor.png" alt="Vetor" />
                <span>Área do cliente</span>
              </div>

              <div className="landing-access-tabs" aria-label="Tipo de acesso">
                <button
                  type="button"
                  className={accessMode === 'login' ? 'active' : ''}
                  onClick={() => { setAccessMode('login'); setForgotOpen(false); setErro(''); setSucesso(''); }}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  className={accessMode === 'cadastro' ? 'active' : ''}
                  onClick={() => { setAccessMode('cadastro'); setForgotOpen(false); setErro(''); setSucesso(''); }}
                >
                  Criar conta
                </button>
              </div>

              <h2>{forgotOpen ? 'Recuperar senha' : accessMode === 'cadastro' ? 'Criar conta' : 'Entrar no sistema'}</h2>
              <p>
                {forgotOpen
                  ? 'Informe seu login ou e-mail cadastrado para receber as instruções.'
                  : accessMode === 'cadastro'
                    ? 'Preencha os dados para criar sua conta e acessar seus projetos.'
                  : 'Use seu usuário ou e-mail e a senha cadastrada para acessar seus projetos.'}
              </p>

              {erro && <div className="landing-access-alert error">{erro}</div>}
              {sucesso && <div className="landing-access-alert success">{sucesso}</div>}

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
                <form className="landing-access-form" onSubmit={handleCadastro}>
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
                        Nível da senha: {getPasswordStrength(cadastroForm.senha).label}
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
                      maxLength="40"
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
            </section>
          ) : (
            <div className="landing-product" aria-label="Prévia visual do sistema Vetor">
              <div className="landing-product-top">
                <img src="/logo_vetor.png" alt="" />
                <span>Obra Residencial Aurora</span>
              </div>
              <div className="landing-product-stats">
                <div>
                  <small>Avanço físico</small>
                  <strong>74%</strong>
                </div>
                <div>
                  <small>RDOs no mês</small>
                  <strong>28</strong>
                </div>
                <div>
                  <small>RNCs abertas</small>
                  <strong>05</strong>
                </div>
              </div>
              <div className="landing-product-body">
                <div className="landing-chart">
                  <div style={{ height: '54%' }} />
                  <div style={{ height: '72%' }} />
                  <div style={{ height: '48%' }} />
                  <div style={{ height: '88%' }} />
                  <div style={{ height: '66%' }} />
                  <div style={{ height: '79%' }} />
                </div>
                <div className="landing-timeline">
                  <span><b>Fundação</b><i>Concluído</i></span>
                  <span><b>Estrutura</b><i>Em andamento</i></span>
                  <span><b>Acabamento</b><i>Planejado</i></span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="landing-strip" id="solucoes">
        <div className="landing-container landing-strip-inner">
          <div className="landing-strip-copy">
            <strong>Operação conectada</strong>
            <span>Obra, suprimentos e qualidade em uma leitura objetiva.</span>
          </div>
          <div className="landing-strip-modules">
            <span>RDO</span>
            <span>RNC</span>
            <span>EAP</span>
            <span>Compras</span>
            <span>Ativos</span>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-container landing-split">
          <div>
            <span className="landing-kicker">Controle integrado</span>
            <h2>
              Menos planilhas soltas.
              <span>Mais contexto para gerir a obra.</span>
            </h2>
            <p>
              A Vetor conecta rotinas que normalmente ficam dispersas: planejamento, acompanhamento diário,
              não conformidades, compras e ativos. O resultado é uma leitura mais precisa do que está acontecendo.
            </p>
          </div>
          <div className="landing-checklist">
            <span><CheckCircle2 size={20} /> Histórico por projeto e por usuário</span>
            <span><CheckCircle2 size={20} /> Indicadores de prazo, qualidade e suprimentos</span>
            <span><CheckCircle2 size={20} /> Perfis de acesso para cada papel da equipe</span>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-dark" id="modulos">
        <div className="landing-container">
          <div className="landing-section-head">
            <span className="landing-kicker">Módulos do sistema</span>
            <h2>Ferramentas para a rotina de quem executa e acompanha obras.</h2>
          </div>
          <div className="landing-modules">
            {modules.map(({ icon: Icon, title, text }) => (
              <article className="landing-module" key={title}>
                <Icon size={28} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" id="seguranca">
        <div className="landing-container landing-security">
          <div>
            <span className="landing-kicker">Gestão com governança</span>
            <h2>
              Dados organizados.
              <span>Acessos definidos.</span>
              <span>Decisões rastreáveis.</span>
            </h2>
            <p>
              O sistema foi estruturado para equipes com múltiplos perfis, mantendo cada usuário no fluxo certo
              e preservando o registro das ações importantes.
            </p>
          </div>
          <div className="landing-security-grid">
            <span><ShieldCheck size={24} /> Controle por perfil</span>
            <span><FileText size={24} /> Documentos e evidências</span>
            <span><BarChart3 size={24} /> Indicadores executivos</span>
            <span><HardHat size={24} /> Rotina de campo</span>
          </div>
        </div>
      </section>

      <section className="landing-contact" id="contato">
        <div className="landing-container landing-contact-inner">
          <div>
            <span className="landing-kicker">Contato</span>
            <h2>Quer adaptar a Vetor para sua operação?</h2>
            <p>Fale com a equipe e solicite uma demonstração do sistema.</p>
          </div>
          <a className="landing-btn landing-btn-primary" href={mailTo}>
            <Mail size={18} />
            {CONTACT_EMAIL}
          </a>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <img src="/logo_externo_vetor.png" alt="Vetor" />
          <span>© {new Date().getFullYear()} Vetor Gerenciamento. Todos os direitos reservados.</span>
        </div>
      </footer>

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
