import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Copy } from 'lucide-react';
import { registerWithInviteToken, validateInviteToken } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { hasForbiddenPasswordSequence } from '../utils/passwordPolicy';
import AuthShell from '../components/AuthShell';
import './Login.css';

const SENHA_REGEX = /^(?=(.*\d){4,})(?=.*[a-zA-Z])(?=.*[^a-zA-Z0-9]).{6}$/;

export default function CriarConta() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { loginAuth } = useAuth();
  const [form, setForm] = useState({ nome: '', email: '', senha: '', confirmar: '' });
  const [erro, setErro] = useState('');
  const [erroToken, setErroToken] = useState('');
  const [tokenValido, setTokenValido] = useState(false);
  const [validandoToken, setValidandoToken] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loginGerado, setLoginGerado] = useState(null);
  const [copiado, setCopiado] = useState(false);

  React.useEffect(() => {
    const validarToken = async () => {
      if (!token) { setErroToken('Convite inválido. Solicite um novo link ao administrador.'); setValidandoToken(false); return; }
      try {
        const response = await validateInviteToken(token);
        setTokenValido(true);
        setForm((current) => ({ ...current, email: response.data?.email || '', nome: response.data?.nome || current.nome }));
      } catch (error) { setErroToken(error.response?.data?.erro || 'Convite inválido, expirado ou já utilizado.'); }
      finally { setValidandoToken(false); }
    };
    validarToken();
  }, [token]);

  const handleSubmit = async (event) => {
    event.preventDefault(); setErro('');
    let validationError = null;
    if (!form.nome.trim()) validationError = 'Informe seu nome completo.';
    else if (!form.email.trim()) validationError = 'E-mail do convite não encontrado.';
    else if (form.senha.length !== 6) validationError = 'A senha deve ter exatamente 6 caracteres.';
    else if (!SENHA_REGEX.test(form.senha)) validationError = 'A senha deve conter pelo menos 4 números, 1 letra e 1 caractere especial (ex: 1234a!).';
    else if (hasForbiddenPasswordSequence(form.senha)) validationError = 'A senha não pode conter sequência crescente/decrescente de letras ou números (ex: abcd, 1234, 9876).';
    else if (form.senha !== form.confirmar) validationError = 'As senhas não conferem.';
    if (validationError) { setErro(validationError); return; }
    setLoading(true);
    try {
      const response = await registerWithInviteToken(token, { nome: form.nome.trim(), email: form.email.trim().toLowerCase(), senha: form.senha });
      if (response?.data?.token && response?.data?.usuario) loginAuth(response.data.token, response.data.usuario);
      setLoginGerado(response.data?.usuario?.login || response.data?.login || '');
      setTimeout(() => navigate('/projetos'), 700);
    } catch (error) { setErro(error.response?.data?.erro || 'Erro ao criar conta. Tente novamente.'); }
    finally { setLoading(false); }
  };

  const copiarLogin = () => { navigator.clipboard.writeText(loginGerado); setCopiado(true); setTimeout(() => setCopiado(false), 2000); };
  const renderContent = () => {
    if (validandoToken) return <div className="auth-card"><div className="auth-card-heading"><h2>Validando convite...</h2><p>Estamos conferindo seu acesso.</p></div></div>;
    if (!tokenValido) return <div className="auth-card"><div className="auth-alert auth-alert-error"><AlertCircle size={17} />{erroToken || 'Convite inválido.'}</div><Link className="auth-back" to="/login"><ArrowLeft size={16} />Voltar ao login</Link></div>;
    if (loginGerado) return <div className="auth-card"><div className="auth-card-heading"><h2>Acesso configurado!</h2><p>Guarde seu login. Com ele, você entra na operação da sua equipe.</p></div><div className="invite-login-box"><small>SEU LOGIN</small><strong>{loginGerado}</strong><button type="button" onClick={copiarLogin} aria-label="Copiar login">{copiado ? <Check size={17} /> : <Copy size={17} />}</button></div><Link to="/login" className="auth-submit invite-login-link">Ir para o login <ArrowRight size={18} /></Link></div>;
    return <div className="auth-card"><div className="auth-card-heading"><h2>Ative seu acesso</h2><p>Crie sua senha para entrar na operação da sua equipe.</p></div>{erro && <div className="auth-alert auth-alert-error" role="alert"><AlertCircle size={17} />{erro}</div>}<form className="auth-form" onSubmit={handleSubmit}><label>Nome completo<input type="text" value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} placeholder="Seu nome" autoComplete="name" required /></label><label>E-mail<input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="seu@email.com" autoComplete="email" disabled required /></label><label>Senha <small className="auth-label-note">6 caracteres: 4 números, 1 letra e 1 especial</small><input type="password" maxLength="6" value={form.senha} onChange={(event) => setForm((current) => ({ ...current, senha: event.target.value }))} placeholder="ex: 1234a!" autoComplete="new-password" required /></label><label>Confirmar senha<input type="password" maxLength="6" value={form.confirmar} onChange={(event) => setForm((current) => ({ ...current, confirmar: event.target.value }))} placeholder="ex: 1234a!" autoComplete="new-password" required /></label><button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Criando conta...' : 'Criar conta'}<ArrowRight size={18} /></button></form><Link className="auth-back" to="/login"><ArrowLeft size={16} />Voltar ao login</Link></div>;
  };

  return <AuthShell mode="register">{renderContent()}</AuthShell>;
}
