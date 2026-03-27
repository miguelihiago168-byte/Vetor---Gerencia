/**
 * Faz o parse de strings de data/hora vindas do SQLite.
 *
 * SQLite armazena CURRENT_TIMESTAMP em UTC sem indicador de fuso (ex: "2026-03-27 18:30:00").
 * Ao tratar como UTC (sufixo Z) o browser converte automaticamente para o
 * fuso configurado no sistema operacional/browser do usuário.
 *
 * - Strings com hora  → interpretadas como UTC → exibidas no fuso local
 * - Strings só de data → parseadas ao meio-dia local para evitar virada de dia por fuso
 */
export const parseTs = (str) => {
  if (!str) return null;
  const s = String(str).trim();
  // Tem componente de hora (contém ':')
  if (s.includes(':')) {
    return new Date(s.replace(' ', 'T') + 'Z'); // UTC → fuso local
  }
  // Só data — adiciona meio-dia local para não virar o dia em UTC-3
  return new Date(s + 'T12:00:00');
};

export const fmtTs = (str) => {
  const d = parseTs(str);
  if (!d || isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
};

export const fmtData = (str) => {
  const d = parseTs(str);
  if (!d || isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
};
