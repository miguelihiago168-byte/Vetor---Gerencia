import React, { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import api from '../services/api';

const groupKey = photo => String(photo.atividade_eap_id ?? 'avulsas');

export function updatePhoto(photos,id,changes) {
  const current = photos.find(photo => photo.id === id);
  if (!current) return photos;
  if (changes.selecionada === true) {
    const count = photos.filter(photo => photo.selecionada && groupKey(photo) === groupKey(current)).length;
    if (current.selecionada || count >= 2) return photos;
    const last = photos.reduce((max,photo,index) => photo.selecionada ? Math.max(max,photo.ordem_selecao ?? index+1) : max,0);
    changes = {...changes,ordem_selecao:last+1};
  } else if (changes.selecionada === false) changes = {...changes,ordem_selecao:null};
  return photos.map(photo => photo.id === id ? {...photo,...changes} : photo);
}

function Thumbnail({url,description}) {
  const frame = useRef(null);
  const [visible,setVisible] = useState(false);
  const [src,setSrc] = useState('');
  const [failed,setFailed] = useState(false);
  useEffect(() => {
    if (!window.IntersectionObserver) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, {rootMargin:'160px'});
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    let objectUrl;
    setFailed(false);
    setSrc('');
    api.get(url,{responseType:'blob',signal:controller.signal,params:{miniatura:1}}).then(response => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(response.data);
      setSrc(objectUrl);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [visible,url]);
  return <div ref={frame}>{src && !failed
    ? <img src={src} alt={description || 'Fotografia do RDO'} onError={() => setFailed(true)}/>
    : <div className="rs-photo-empty">{failed ? <><ImageOff size={22}/>Arquivo indisponível</> : 'Carregando foto…'}</div>}</div>;
}

export default function RelatorioSemanalFotos({photos,base,reportId,onChange,formatDate,busy}) {
  const groups = new Map();
  for (const photo of photos) {
    const key = groupKey(photo);
    if (!groups.has(key)) groups.set(key,{title:photo.atividade_eap_id == null ? 'Sem vínculo com a EAP' : photo.atividade,photos:[]});
    groups.get(key).photos.push(photo);
  }
  return <section className="rs-card" id="rs-fotos">
    <div className="rs-section-heading"><div><h2>Fotos da semana</h2>
      <p>Escolha até duas fotografias por atividade. As legendas podem ser editadas para este relatório.</p></div></div>
    {!photos.length && <p>Nenhuma foto nos RDOs aprovados do período.</p>}
    {[...groups].map(([key,group]) => {
      const count = group.photos.filter(photo => photo.selecionada).length;
      return <fieldset key={key} className="rs-photo-group" disabled={busy}>
        <legend>{group.title} <span className="rs-count" aria-label={count+' de 2 selecionadas'}>{count}/2</span></legend>
        {count >= 2 && <p role="status">Limite de duas fotografias atingido. Remova uma fotografia deste grupo para selecionar outra.</p>}
        <div className="rs-photos">{group.photos.map(photo => <div key={photo.id} className={'rs-photo'+(photo.selecionada?' selected':'')}>
          <Thumbnail url={photo.tem_imagem && reportId ? base+'/'+reportId+'/foto/'+photo.id : base+'/fotos/'+photo.id} description={photo.descricao}/>
          <label className="rs-check"><input type="checkbox" checked={!!photo.selecionada} disabled={!photo.selecionada && count >= 2}
            onChange={e => onChange(photo.id,{selecionada:e.target.checked})}/>
            <span><strong>Foto #{photo.id}</strong><small>RDO #{photo.rdo_id} · {formatDate(photo.data)}</small></span></label>
          {photo.atividade_eap_id == null && photo.atividade && photo.atividade !== group.title && <small>{photo.atividade}</small>}
          {photo.fonte_ausente && <p>Ausente nas fontes atualizadas.</p>}
          {photo.selecionada && photo.aviso && <p role="status">{photo.aviso}</p>}
          {photo.selecionada ? <label>Legenda para o relatório<textarea value={photo.descricao || ''}
            onChange={e => onChange(photo.id,{descricao:e.target.value})}/></label> : <small>{photo.descricao}</small>}
        </div>)}</div>
      </fieldset>;
    })}
  </section>;
}
