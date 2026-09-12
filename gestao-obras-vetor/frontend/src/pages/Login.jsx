import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarX, Eye, EyeOff, RotateCw, Trash2, X } from 'lucide-react';
import { cancelarConta, esqueciSenha, login as loginAPI, registerTrialAccount, renovarTrial } from '../services/api';
import { useAuth } from '../context/AuthContext';
import AuthShell from '../components/AuthShell';
import './Login.css';

const isSequentialPassword = (value) => {
  const pwd = String(value || '').toLowerCase().replace(/\s+/g, '');
  return ['123456', '1234567', '12345678', '123456789', '0123456789', 'qwerty', 'qwertyu', 'qwertyuiop', 'asdfgh', 'asdfghj', 'zxcvbn', 'abcdef', 'abcdefg', 'abcdefgh', 'abcdefghi', 'password'].some((sequence) => pwd.includes(sequence));
};

const getPasswordRequirements = (value) => {
  const password = String(value || '');
  return [
    { label: '8 ou mais caracteres', met: password.length >= 8 },
    { label: 'Uma letra e um número', met: /[a-zA-Z]/.test(password) && /\d/.test(password) },
    { label: 'Um caractere especial', met: /[^a-zA-Z0-9]/.test(password) },
    { label: 'Sem sequências comuns', met: password.length > 0 && !isSequentialPassword(password) },
  ];
};

const normalizeName = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
const buildUsernameFromName = (name) => `${normalizeName(name).slice(0, 14) || 'usuario'}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

export default function Login({ initialMode = 'login' }) {
  const navigate = useNavigate();
  const { loginAuth } = useAuth();
  const [modo, setModo] = useState(initialMode);
  const [loginForm, setLoginForm] = useState({ usuario: '', senha: '' });
  const [cadastroForm, setCadastroForm] = useState({ nome: '', empresa: '', email: '', usuario: '', senha: '', codigo_acesso: '' });
  const [usuarioManual, setUsuarioManual] = useState(false);
  const [showLoginSenha, setShowLoginSenha] = useState(false);
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

  useEffect(() => { setModo(initialMode); }, [initialMode]);
  const clearFeedback = () => { setErro(''); setSucesso(''); };

  const handleLogin = async (event) => {
    event.preventDefault(); clearFeedback();
    const credential = loginForm.usuario.trim();
    if (!credential) return setErro('Informe seu usuário ou e-mail.');
    if (!loginForm.senha) return setErro('Informe a senha.');
    setLoading(true);
    try {
      const response = await loginAPI({ usuario: credential, senha: loginForm.senha, manterLogin });
      loginAuth(response.data.token, response.data.usuario, manterLogin);
      navigate(response.data?.usuario?.primeiro_acesso_pendente ? '/primeiro-acesso' : '/projetos');
    } catch (error) {
      if (error.response?.data?.codigo === 'TRIAL_EXPIRADO') setTrialExpirado({ tenant_id: error.response.data.tenant_id, login: credential, senha: loginForm.senha });
      else setErro(String(error.response?.data?.erro || 'Erro ao fazer login.'));
    } finally { setLoading(false); }
  };

  const handleEsqueciSenha = async (event) => {
    event.preventDefault(); clearFeedback();
    if (!esqueciLogin.trim()) return setErro('Informe seu login ou e-mail.');
    setLoading(true);
    try { await esqueciSenha(esqueciLogin.trim()); setSucesso('Se o usuário existir, as instruções foram enviadas ao e-mail cadastrado.'); setEsqueciLogin(''); }
    catch { setSucesso('Se o usuário existir, as instruções foram enviadas ao e-mail cadastrado.'); }
    finally { setLoading(false); }
  };

  const handleCadastro = async (event) => {
    event.preventDefault(); clearFeedback();
    const usuario = cadastroForm.usuario.trim();
    if (!cadastroForm.nome.trim()) return setErro('Nome é obrigatório.');
    if (!cadastroForm.empresa.trim()) return setErro('Empresa é obrigatória.');
    if (!cadastroForm.email.trim()) return setErro('E-mail é obrigatório.');
    if (!usuario) return setErro('Usuário é obrigatório.');
    if (!cadastroForm.senha) return setErro('Senha é obrigatória.');
    if (!getPasswordRequirements(cadastroForm.senha).every(({ met }) => met)) return setErro('Conclua todos os requisitos da senha para continuar.');
    if (!cadastroForm.codigo_acesso.trim()) return setErro('Código global é obrigatório para criar conta.');
    setLoading(true);
    try {
      const response = await registerTrialAccount({ nome: cadastroForm.nome.trim(), empresa: cadastroForm.empresa.trim(), email: cadastroForm.email.trim(), usuario, senha: cadastroForm.senha, codigo_acesso: cadastroForm.codigo_acesso.trim() });
      const loginCriado = response.data?.usuario || usuario;
      setSucesso(`Conta criada com sucesso. Usuário: ${loginCriado}`);
      setModo('login'); setLoginForm((current) => ({ ...current, usuario: loginCriado }));
      setCadastroForm({ nome: '', empresa: '', email: '', usuario: '', senha: '', codigo_acesso: '' }); setUsuarioManual(false);
    } catch (error) { setErro(String(error.response?.data?.erro || 'Erro ao criar conta.')); }
    finally { setLoading(false); }
  };

  const handleRenovarTrial = async (event) => {
    event.preventDefault(); setTentandoRenovar(true); setErro('');
    try {
      await renovarTrial({ tenant_id: trialExpirado.tenant_id, codigo: codigoRenovacao.trim() });
      const response = await loginAPI({ usuario: trialExpirado.login, senha: trialExpirado.senha, manterLogin });
      setTrialExpirado(null); setCodigoRenovacao(''); loginAuth(response.data.token, response.data.usuario, manterLogin);
      navigate(response.data?.usuario?.primeiro_acesso_pendente ? '/primeiro-acesso' : '/projetos');
    } catch (error) { setErro(String(error.response?.data?.erro || 'Erro ao renovar trial.')); }
    finally { setTentandoRenovar(false); }
  };

  const handleCancelarConta = async () => {
    setCancelandoConta(true); setErro('');
    try { await cancelarConta(trialExpirado); setTrialExpirado(null); setConfirmarExclusao(false); setSucesso('Conta excluída com sucesso.'); }
    catch { setErro('Erro ao excluir conta. Tente novamente.'); }
    finally { setCancelandoConta(false); }
  };

  const isRegister = modo === 'cadastro';
  const title = modo === 'esqueci' ? 'Recupere seu acesso' : isRegister ? 'Crie sua conta' : 'Bem-vindo de volta';
  const subtitle = modo === 'esqueci' ? 'Informe seu login ou e-mail para receber as instruções.' : isRegister ? 'Organize sua operação desde o primeiro projeto.' : 'Acesse seu painel e acompanhe suas obras com clareza.';
  const passwordRequirements = getPasswordRequirements(cadastroForm.senha);
  const passwordValid = passwordRequirements.every(({ met }) => met);

  return (
    <>
      <AuthShell mode={isRegister ? 'register' : 'login'}>
        <div className={`auth-card ${isRegister ? 'auth-card-register' : ''} ${modo === 'login' ? 'auth-card-login' : ''}`}>
          <div className="auth-card-heading"><h2>{title}</h2><p>{subtitle}</p></div>
          {erro && <div className="auth-alert auth-alert-error" role="alert"><AlertCircle size={17} />{erro}</div>}
          {sucesso && <div className="auth-alert auth-alert-success" role="status">{sucesso}</div>}
          {modo === 'login' && <form className="auth-form" onSubmit={handleLogin}>
            <label>Usuário ou e-mail<input type="text" maxLength="120" value={loginForm.usuario} onChange={(event) => setLoginForm((current) => ({ ...current, usuario: event.target.value.trimStart() }))} placeholder="Seu usuário ou e-mail" autoComplete="username" autoFocus required /></label>
            <label>Senha<span className="auth-password-input"><input type={showLoginSenha ? 'text' : 'password'} maxLength="72" value={loginForm.senha} onChange={(event) => setLoginForm((current) => ({ ...current, senha: event.target.value }))} placeholder="Digite sua senha" autoComplete="current-password" required /><button type="button" aria-label={showLoginSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowLoginSenha((value) => !value)}>{showLoginSenha ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
            <div className="auth-form-row"><label className="auth-check"><input type="checkbox" checked={manterLogin} onChange={(event) => setManterLogin(event.target.checked)} />Manter minha sessão ativa</label><button type="button" className="auth-text-button" onClick={() => { setModo('esqueci'); clearFeedback(); }}>Esqueceu sua senha?</button></div>
            <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}<ArrowRight size={18} /></button>
          </form>}
          {modo === 'esqueci' && <form className="auth-form" onSubmit={handleEsqueciSenha}>
            <label>Login ou e-mail<input type="text" maxLength="120" value={esqueciLogin} onChange={(event) => setEsqueciLogin(event.target.value.trimStart())} placeholder="Seu login ou e-mail" autoFocus required /></label>
            <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Enviando...' : 'Enviar instruções'}<ArrowRight size={18} /></button>
            <button type="button" className="auth-back" onClick={() => { setModo('login'); clearFeedback(); }}><ArrowLeft size={16} />Voltar ao login</button>
          </form>}
          {isRegister && <form className="auth-form auth-form-register" onSubmit={handleCadastro}>
            <label className="auth-field-wide">Nome completo<input type="text" maxLength="80" value={cadastroForm.nome} onChange={(event) => { const nome = event.target.value; setCadastroForm((current) => ({ ...current, nome, usuario: usuarioManual ? current.usuario : buildUsernameFromName(nome) })); }} placeholder="Seu nome" autoComplete="name" autoFocus required /></label>
            <label>Empresa<input type="text" maxLength="80" value={cadastroForm.empresa} onChange={(event) => setCadastroForm((current) => ({ ...current, empresa: event.target.value }))} placeholder="Nome da empresa" autoComplete="organization" required /></label>
            <label>E-mail<input type="email" maxLength="120" value={cadastroForm.email} onChange={(event) => setCadastroForm((current) => ({ ...current, email: event.target.value }))} placeholder="seuemail@empresa.com" autoComplete="email" required /></label>
            <label>Usuário<input type="text" maxLength="40" value={cadastroForm.usuario} onChange={(event) => { setUsuarioManual(true); setCadastroForm((current) => ({ ...current, usuario: event.target.value.replace(/\s+/g, '') })); }} placeholder="seunome1234" autoComplete="username" required /></label>
            <label>Código global<input type="text" value={cadastroForm.codigo_acesso} onChange={(event) => setCadastroForm((current) => ({ ...current, codigo_acesso: event.target.value }))} placeholder="Informe o código" required /></label>
            <label className="auth-field-wide">Senha<span className="auth-password-input"><input type={showCadastroSenha ? 'text' : 'password'} maxLength="72" value={cadastroForm.senha} onChange={(event) => setCadastroForm((current) => ({ ...current, senha: event.target.value }))} placeholder="Crie uma senha segura" autoComplete="new-password" required /><button type="button" aria-label={showCadastroSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowCadastroSenha((value) => !value)}>{showCadastroSenha ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
            <div className="auth-password-requirements auth-field-wide" role="status" aria-live="polite">{passwordRequirements.map(({ label, met }) => <span className={met ? 'is-met' : ''} key={label}>{label}</span>)}</div>
            <button className="auth-submit auth-field-wide" type="submit" disabled={loading || !passwordValid}>{loading ? 'Criando conta...' : 'Criar conta'}<ArrowRight size={18} /></button>
          </form>}
        </div>
      </AuthShell>
      {trialExpirado && <div className="auth-modal" role="dialog" aria-modal="true" aria-label="Período de teste encerrado"><div className="auth-modal-card"><span className="auth-modal-icon"><CalendarX size={28} /></span><h2>Período de teste encerrado</h2><p>Seu período de 30 dias gratuitos expirou. Seus dados estão preservados.</p>{erro && <div className="auth-alert auth-alert-error" role="alert">{erro}</div>}{!confirmarExclusao ? <><form className="auth-form" onSubmit={handleRenovarTrial}><label>Código de renovação<input type="text" value={codigoRenovacao} onChange={(event) => setCodigoRenovacao(event.target.value)} placeholder="Informe o código" /></label><button className="auth-submit" type="submit" disabled={tentandoRenovar || !codigoRenovacao.trim()}>{tentandoRenovar ? 'Renovando...' : 'Renovar trial'}<RotateCw size={17} /></button></form><button className="auth-disabled-button" type="button" disabled>Assinar serviço <small>EM BREVE</small></button><button className="auth-danger-button" type="button" onClick={() => setConfirmarExclusao(true)}><Trash2 size={16} />Encerrar minha conta</button><button className="auth-back" type="button" onClick={() => { setTrialExpirado(null); setCodigoRenovacao(''); setErro(''); }}><X size={16} />Fechar</button></> : <><div className="auth-alert auth-alert-error">Esta ação é irreversível. Todos os dados serão excluídos permanentemente, sem possibilidade de recuperação.</div><button className="auth-danger-button auth-danger-solid" type="button" disabled={cancelandoConta} onClick={handleCancelarConta}>{cancelandoConta ? 'Excluindo...' : 'Confirmar exclusão definitiva'}<Trash2 size={16} /></button><button className="auth-back" type="button" onClick={() => { setConfirmarExclusao(false); setErro(''); }}><ArrowLeft size={16} />Voltar</button></>}</div></div>}
    </>
  );
}
