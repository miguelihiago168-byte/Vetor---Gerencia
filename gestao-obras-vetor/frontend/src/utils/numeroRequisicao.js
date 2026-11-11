// Os números antigos do mapa continuam gravados integralmente para preservar o histórico.
export function numeroRequisicaoExibicao(numero, requisicaoId) {
  if (typeof numero !== 'string') return numero || '';
  const antigo = numero.match(/^MAP-(\d{8})-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  const id = String(requisicaoId ?? '');
  if (!antigo || !/^[1-9]\d*$/.test(id)) return numero;
  return `MAP-${antigo[1]}-${id.padStart(6, '0')}`;
}

export function buscaNumeroRequisicao(numero, requisicaoId, busca) {
  const query = String(busca || '').toLocaleLowerCase('pt-BR');
  return String(numero || '').toLocaleLowerCase('pt-BR').includes(query)
    || numeroRequisicaoExibicao(numero, requisicaoId).toLocaleLowerCase('pt-BR').includes(query);
}
