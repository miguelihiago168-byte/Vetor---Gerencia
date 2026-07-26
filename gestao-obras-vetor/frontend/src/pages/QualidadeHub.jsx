import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getMaterialTraceIndicators, getRNCs } from '../services/api';
import { ClipboardCheck, FileWarning, PackageSearch, ArrowRight } from 'lucide-react';
import './RastreabilidadeMateriais.css';

export default function QualidadeHub() {
  const { projetoId } = useParams(); const navigate = useNavigate(); const [stats,setStats]=useState({total:0,por_inspecao:[],rncs_abertas:0}); const [rnc,setRnc]=useState(0);
  useEffect(()=>{ Promise.all([getMaterialTraceIndicators(projetoId),getRNCs(projetoId)]).then(([a,b])=>{setStats(a.data||{});setRnc((b.data||[]).filter(x=>x.status!=='Encerrada').length);}).catch(()=>{});},[projetoId]);
  const waiting=(stats.por_inspecao||[]).find(x=>x.status_inspecao==='Aguardando inspeção')?.total||0;
  return <><Navbar/><main className="container quality-page"><div className="page-header"><div><p className="eyebrow">GESTÃO DA QUALIDADE</p><h1>Qualidade</h1><p>Controle de não conformidades e rastreabilidade dos materiais da obra.</p></div></div><div className="quality-kpis"><div className="quality-kpi"><PackageSearch/><div><strong>{stats.total||0}</strong><span>Materiais recebidos</span></div></div><div className="quality-kpi"><ClipboardCheck/><div><strong>{waiting}</strong><span>Aguardando inspeção</span></div></div><div className="quality-kpi"><FileWarning/><div><strong>{rnc||stats.rncs_abertas||0}</strong><span>RNC abertas</span></div></div></div><div className="quality-hub-grid"><button className="quality-hub-card" onClick={()=>navigate(`/projeto/${projetoId}/rnc`)}><FileWarning size={28}/><div><h2>RNC</h2><p>Registre, acompanhe e trate não conformidades.</p></div><ArrowRight/></button><button className="quality-hub-card" onClick={()=>navigate(`/projeto/${projetoId}/rastreabilidade-materiais`)}><PackageSearch size={28}/><div><h2>Rastreabilidade de materiais</h2><p>Recebimento, inspeção, lote, evidências e aplicação.</p></div><ArrowRight/></button></div></main></>;
}
