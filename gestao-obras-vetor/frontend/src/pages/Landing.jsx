import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, BarChart3, CalendarDays, CheckCircle2, ChevronDown, ClipboardCheck, Mail, Menu, PackageCheck, ShieldCheck, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { enviarContato } from '../services/api';
import './Landing.css';

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';
const modules = [
  { icon: CalendarDays, title: 'Planejamento', text: 'EAP, cronograma, Curva S e acompanhamento físico-financeiro.' },
  { icon: ClipboardCheck, title: 'Diário de Obra', text: 'RDOs, equipe, equipamentos, ocorrências e evidências de campo.' },
  { icon: ShieldCheck, title: 'Qualidade', text: 'Checklists, inspeções e não conformidades com rastreabilidade.' },
  { icon: PackageCheck, title: 'Suprimentos', text: 'Requisições, cotações, compras, estoque e movimentações.' },
];

const solutions = [
  { icon: CalendarDays, title: 'Planejamento conectado', text: 'Transforme escopo, prazo e orçamento em um plano executável, acompanhado em uma única visão.' },
  { icon: Users, title: 'Execução alinhada', text: 'Conecte escritório e campo com registros diários, responsáveis definidos e informação atualizada.' },
  { icon: BarChart3, title: 'Decisão com contexto', text: 'Antecipe desvios de prazo, custo e qualidade com dados que mostram o que exige atenção.' },
];

const results = [
  { icon: CheckCircle2, title: 'Mais previsibilidade', text: 'Acompanhe o planejado e o realizado para agir antes que um desvio vire atraso.' },
  { icon: BarChart3, title: 'Visão para decidir', text: 'Consolide indicadores de avanço, recursos e pendências para decisões mais rápidas.' },
  { icon: Users, title: 'Times alinhados', text: 'Centralize o que cada frente precisa executar, aprovar ou corrigir.' },
  { icon: ShieldCheck, title: 'Histórico confiável', text: 'Mantenha registros, evidências e aprovações disponíveis durante toda a obra.' },
];

const phoneCountries = [
  { code: 'BR', name: 'Brasil', dial: '+55' },
  { code: 'PT', name: 'Portugal', dial: '+351' },
  { code: 'US', name: 'Estados Unidos', dial: '+1' },
  { code: 'CA', name: 'Canadá', dial: '+1' },
  { code: 'ES', name: 'Espanha', dial: '+34' },
  { code: 'IT', name: 'Itália', dial: '+39' },
  { code: 'MX', name: 'México', dial: '+52' },
  { code: 'AR', name: 'Argentina', dial: '+54' },
  { code: 'CL', name: 'Chile', dial: '+56' },
  { code: 'CN', name: 'China', dial: '+86' },
  { code: 'JP', name: 'Japão', dial: '+81' },
  { code: 'GB', name: 'Reino Unido', dial: '+44' },
];

const formatPhone = (value, countryCode) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 15);
  if (countryCode === 'BR') {
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  }
  if (countryCode === 'US' || countryCode === 'CA') {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }
  return digits;
};

function Blueprint({ className = '' }) {
  return <svg className={`landing-blueprint ${className}`} viewBox="0 0 1040 600" aria-hidden="true" preserveAspectRatio="xMidYMid slice"><g fill="none" stroke="currentColor" strokeWidth="1"><path d="M180 528V231h421v297M229 528V190h323v338M277 528V149h227v379M326 528V110h129v418M180 231l96-82h228l97 82M229 190l97-80h129l97 80M277 149l98-75h80l98 75M326 110l98-70 80 70M153 528h477M153 482h477M153 437h477M153 392h477M153 347h477M153 302h477M229 190l-76 57M552 190l78 57M277 149l-48 41M504 149l48 41" /><path d="M180 528 601 231M180 482 601 190M180 437 552 149M229 528 601 302M277 528 601 347M326 528 601 392M601 528V92M579 528V122M601 92h258M601 118h198M683 92v35M744 92v26M805 92v19M859 92v49M859 141l73 390M883 528h97M859 141 772 528M772 528h111" /><path d="M601 179 859 141M601 219l280-78M601 259l288-70M601 299l299-63M601 339l307-53M601 379l316-43M601 419l324-33M601 459l334-23M601 499l341-13M112 528h840M60 556h920M0 584h1000" opacity=".53" /><path d="M140 528 424 40 705 528M82 528 424 75l358 453M236 528 424 110l263 418M70 475 424 284l390 191M70 428l354-144 438 144M70 381l354-97 486 97M70 334l354-50 534 50" opacity=".5" /></g></svg>;
}

export default function Landing() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [form, setForm] = useState({ nome: '', email: '', empresa: '', telefone: '', mensagem: '' });
  const [phoneCountryCode, setPhoneCountryCode] = useState('BR');
  const [phonePickerOpen, setPhonePickerOpen] = useState(false);
  const [phoneSearch, setPhoneSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const recaptchaRef = useRef(null);
  const widgetId = useRef(null);
  const phonePickerRef = useRef(null);
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY) { setCaptchaError('O formulário de contato está temporariamente indisponível.'); return undefined; }
    let cancelled = false;
    const renderCaptcha = () => {
      if (cancelled || !recaptchaRef.current || widgetId.current !== null || !window.grecaptcha?.render) return;
      widgetId.current = window.grecaptcha.render(recaptchaRef.current, { sitekey: RECAPTCHA_SITE_KEY, callback: (token) => { setCaptchaToken(token); setCaptchaError(''); }, 'expired-callback': () => setCaptchaToken(''), 'error-callback': () => { setCaptchaToken(''); setCaptchaError('Não foi possível carregar a verificação. Tente novamente.'); } });
    };
    const existing = document.getElementById('google-recaptcha-script');
    const script = existing || document.createElement('script');
    if (!existing) { script.id = 'google-recaptcha-script'; script.src = 'https://www.google.com/recaptcha/api.js?render=explicit'; script.async = true; script.defer = true; document.head.appendChild(script); }
    if (window.grecaptcha?.render) renderCaptcha(); else script.addEventListener('load', renderCaptcha);
    return () => { cancelled = true; script.removeEventListener('load', renderCaptcha); };
  }, []);

  useEffect(() => {
    const closePhonePicker = (event) => { if (!phonePickerRef.current?.contains(event.target)) setPhonePickerOpen(false); };
    document.addEventListener('pointerdown', closePhonePicker);
    return () => document.removeEventListener('pointerdown', closePhonePicker);
  }, []);

  const selectedPhoneCountry = phoneCountries.find(({ code }) => code === phoneCountryCode) || phoneCountries[0];
  const filteredPhoneCountries = phoneCountries.filter(({ code, name, dial }) => `${code} ${name} ${dial}`.toLocaleLowerCase('pt-BR').includes(phoneSearch.trim().toLocaleLowerCase('pt-BR')));
  const changeForm = (event) => { const { name, value } = event.target; setForm((current) => ({ ...current, [name]: name === 'telefone' ? formatPhone(value, phoneCountryCode) : value })); };
  const selectPhoneCountry = (nextCountryCode) => { setPhoneCountryCode(nextCountryCode); setForm((current) => ({ ...current, telefone: formatPhone(current.telefone, nextCountryCode) })); setPhoneSearch(''); setPhonePickerOpen(false); };
  const resetCaptcha = () => { setCaptchaToken(''); if (widgetId.current !== null && window.grecaptcha?.reset) window.grecaptcha.reset(widgetId.current); };
  const submitContact = async (event) => {
    event.preventDefault(); setFeedback({ type: '', text: '' });
    if (!RECAPTCHA_SITE_KEY) return setCaptchaError('O formulário de contato está temporariamente indisponível.');
    if (!captchaToken) return setCaptchaError('Confirme que você não é um robô antes de enviar.');
    setSending(true);
    try { await enviarContato({ ...form, telefone: `${selectedPhoneCountry.dial} ${form.telefone}`.trim(), recaptchaToken: captchaToken }); setFeedback({ type: 'success', text: 'Mensagem enviada com sucesso. Em breve nossa equipe entrará em contato.' }); setForm({ nome: '', email: '', empresa: '', telefone: '', mensagem: '' }); resetCaptcha(); }
    catch (error) { setFeedback({ type: 'error', text: error.response?.data?.erro || 'Não foi possível enviar sua mensagem. Tente novamente.' }); resetCaptcha(); }
    finally { setSending(false); }
  };

  return <main className="vetor-landing">
    <header className="vetor-header"><div className="vetor-wrap vetor-nav"><a href="#inicio" className="vetor-brand" onClick={closeMenu}><img src="/logo_vetor_transparente.png" alt="" /><span><b>Vetor</b><small>Gestão de Obras</small></span></a><nav className={menuOpen ? 'open' : ''} aria-label="Navegação principal"><a href="#solucoes" onClick={closeMenu}>Soluções</a><a href="#modulos" onClick={closeMenu}>Módulos</a><a href="#resultados" onClick={closeMenu}>Resultados</a><a href="#contato" onClick={closeMenu}>Contato</a><button className="vetor-mobile-access" type="button" onClick={() => navigate('/login')}>Entrar <ArrowRight size={16} /></button></nav><div className="vetor-nav-actions"><button className="vetor-access" type="button" onClick={() => navigate('/login')}>Entrar</button><button className="vetor-menu" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuOpen}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button></div></div></header>
    <section className="vetor-hero" id="inicio"><img className="vetor-construction-art vetor-hero-construction" src="/hero-construction-blueprint-v3.png" alt="" aria-hidden="true" /><div className="vetor-wrap vetor-hero-inner"><div className="vetor-hero-copy"><span className="vetor-kicker">TECNOLOGIA QUE CONSTRÓI RESULTADOS</span><h1>Sua obra sob controle,<em>do planejamento<br />à execução.</em></h1><p>Planejamento, acompanhamento, qualidade e suprimentos em uma única plataforma, para obras mais eficientes e previsíveis.</p><div className="vetor-hero-actions"><a href="#contato" className="vetor-button vetor-button-primary">Solicitar demonstração <ArrowRight size={18} /></a><a href="#modulos" className="vetor-button vetor-button-outline">Conhecer os módulos</a></div></div></div></section>
    <section className="vetor-solutions-section" id="solucoes"><div className="vetor-wrap"><div className="vetor-section-heading"><div><span className="vetor-kicker">SOLUÇÕES PARA A OPERAÇÃO</span><h2>Uma visão única para conduzir a obra.</h2><p>O Vetor organiza os pontos que mais impactam prazo, custo, qualidade e produtividade.</p></div></div><div className="vetor-solution-grid">{solutions.map(({ icon: Icon, title, text }) => <article key={title} className="vetor-solution"><span><Icon size={26} /></span><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>
    <section className="vetor-modules-section" id="modulos"><div className="vetor-wrap"><div className="vetor-section-heading"><div><span className="vetor-kicker">MÓDULOS DA PLATAFORMA</span><h2>Ferramentas para cada frente da obra.</h2><p>Use os módulos de forma integrada ou comece pelo que a sua operação precisa agora.</p></div><a className="vetor-all-modules" href="#contato">SOLICITAR DEMONSTRAÇÃO <ArrowRight size={15} /></a></div><div className="vetor-module-grid">{modules.map(({ icon: Icon, title, text }) => <article key={title} className="vetor-module"><span><Icon size={31} /></span><h3>{title}</h3><p>{text}</p><i><ArrowRight size={16} /></i></article>)}</div></div></section>
    <section className="vetor-results" id="resultados"><div className="vetor-wrap"><div className="vetor-results-heading"><span className="vetor-kicker">RESULTADOS QUE CONSTROEM</span><h2>Menos incerteza. Mais controle para avançar.</h2><p>Informação confiável para transformar rotina de obra em resultado mensurável.</p></div><div className="vetor-results-grid">{results.map(({ icon: Icon, title, text }) => <article key={title}><Icon size={34} /><div><h3>{title}</h3><p>{text}</p></div></article>)}</div></div></section>
    <section className="vetor-contact" id="contato"><img className="vetor-construction-art vetor-contact-construction" src="/hero-construction-blueprint.png" alt="" aria-hidden="true" /><div className="vetor-wrap vetor-contact-inner"><div className="vetor-contact-copy"><span className="vetor-kicker">VAMOS CONSTRUIR JUNTOS?</span><h2>Fale com a nossa equipe e solicite uma demonstração.</h2><p>Veja na prática como o Vetor pode trazer mais controle e eficiência para a sua obra.</p><i /></div><form className="vetor-contact-form" onSubmit={submitContact}><div className="vetor-contact-form-heading"><b>Solicitar demonstração</b><span>Preencha os dados abaixo e entraremos em contato.</span></div><div className="vetor-contact-fields"><label>Nome<input name="nome" value={form.nome} onChange={changeForm} autoComplete="name" required /></label><label>Empresa<input name="empresa" value={form.empresa} onChange={changeForm} autoComplete="organization" required /></label><label>E-mail<input type="email" name="email" value={form.email} onChange={changeForm} autoComplete="email" required /></label><label>Telefone / WhatsApp<span className="vetor-phone-input"><span className="vetor-country-picker" ref={phonePickerRef}><button className="vetor-country-trigger" type="button" onClick={() => setPhonePickerOpen((open) => !open)} aria-haspopup="listbox" aria-expanded={phonePickerOpen}>{selectedPhoneCountry.code} <b>{selectedPhoneCountry.dial}</b><ChevronDown size={13} /></button>{phonePickerOpen && <span className="vetor-country-menu"><input value={phoneSearch} onChange={(event) => setPhoneSearch(event.target.value)} placeholder="Pesquisar país ou DDI" autoFocus aria-label="Pesquisar país ou DDI" /><span className="vetor-country-options" role="listbox">{filteredPhoneCountries.length ? filteredPhoneCountries.map(({ code, name, dial }) => <button key={code} type="button" role="option" aria-selected={code === phoneCountryCode} onClick={() => selectPhoneCountry(code)}><small>{code}</small><b>{name}</b><em>{dial}</em></button>) : <span className="vetor-country-empty">Nenhum país encontrado.</span>}</span></span>}</span><input type="tel" name="telefone" value={form.telefone} onChange={changeForm} autoComplete="tel-national" inputMode="numeric" placeholder={phoneCountryCode === 'BR' ? '(11) 99999-9999' : 'Número de telefone'} required /></span></label><label className="vetor-message">Mensagem<textarea name="mensagem" value={form.mensagem} onChange={changeForm} maxLength="4000" placeholder="Conte um pouco sobre a sua necessidade..." required /></label></div><div ref={recaptchaRef} className="vetor-recaptcha" />{captchaError && <p className="vetor-feedback error" role="alert">{captchaError}</p>}{feedback.text && <p className={`vetor-feedback ${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}<button className="vetor-button vetor-button-primary vetor-submit" type="submit" disabled={sending || !RECAPTCHA_SITE_KEY}>{sending ? 'Enviando...' : 'Solicitar demonstração'} <ArrowRight size={18} /></button></form></div></section>
    <footer className="vetor-footer"><div className="vetor-wrap"><a href="#inicio" className="vetor-brand"><img src="/logo_vetor_transparente.png" alt="" /><span><b>Vetor</b><small>Gestão de Obras</small></span></a><div><a href="#solucoes">Soluções</a><a href="#modulos">Módulos</a><a href="#resultados">Resultados</a><a href="#contato">Contato</a></div><small>© {new Date().getFullYear()} Vetor Gestão de Obras.<br />Todos os direitos reservados.</small></div></footer>
  </main>;
}
