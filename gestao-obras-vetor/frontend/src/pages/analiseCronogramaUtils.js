export function prepararPrioridades(analise, atividades) {
  const pais = new Set((atividades || []).filter(a => a.pai_id != null).map(a => String(a.pai_id)));
  const predecessoras = new Map((analise.predecessoras_pendentes || []).map(item => [String(item.atividade?.id), item.pendentes || []]));
  const atrasadas = analise.atividades_atrasadas || [];
  const executaveis = atrasadas.filter(a => !pais.has(String(a.id)));
  const prioridades = executaveis.map(a => ({
    ...a,
    bloqueios: predecessoras.get(String(a.id)) || [],
    sucessorasAbertas: (a.sucessoras_impactadas || []).filter(s => Number(s.percentual_executado || 0) < 100 && !pais.has(String(s.id)))
  })).sort((a, b) => Number(!!b.no_caminho_critico) - Number(!!a.no_caminho_critico)
    || b.sucessorasAbertas.length - a.sucessorasAbertas.length
    || Number(b.dias_atraso || 0) - Number(a.dias_atraso || 0)
    || String(a.codigo_eap || '').localeCompare(String(b.codigo_eap || ''), 'pt-BR', { numeric: true }));
  return { prioridades, agrupadoras: atrasadas.length - executaveis.length };
}
