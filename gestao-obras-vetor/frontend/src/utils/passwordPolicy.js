const isAsciiAlpha = (code) => (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
const isDigit = (code) => code >= 48 && code <= 57;

const hasSequentialRun = (value, minRun = 4) => {
  const str = String(value || '');
  if (str.length < minRun) return false;

  let ascRun = 1;
  let descRun = 1;

  for (let i = 1; i < str.length; i += 1) {
    const prevCode = str.charCodeAt(i - 1);
    const currCode = str.charCodeAt(i);

    const sameCategory = (isDigit(prevCode) && isDigit(currCode)) || (isAsciiAlpha(prevCode) && isAsciiAlpha(currCode));

    if (sameCategory && currCode === prevCode + 1) {
      ascRun += 1;
    } else {
      ascRun = 1;
    }

    if (sameCategory && currCode === prevCode - 1) {
      descRun += 1;
    } else {
      descRun = 1;
    }

    if (ascRun >= minRun || descRun >= minRun) {
      return true;
    }
  }

  return false;
};

export const hasForbiddenPasswordSequence = (password) => {
  return hasSequentialRun(password, 4);
};

export const getPasswordStrength = (value) => {
  const password = String(value || '');
  if (!password) return { level: 'fraca', score: 0, label: 'Fraca', color: '#ef4444', width: '0%' };

  const upper = (password.match(/[A-Z]/g) || []).length;
  const lower = (password.match(/[a-z]/g) || []).length;
  const digits = (password.match(/\d/g) || []).length;
  const special = (password.match(/[^A-Za-z0-9]/g) || []).length;

  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (upper > 0) score += 1;
  if (upper >= 2) score += 1;
  if (lower > 0) score += 1;
  if (digits > 0) score += 1;
  if (digits >= 3) score += 1;
  if (special > 0) score += 1;
  if (special >= 2) score += 1;

  if (score <= 3) return { level: 'fraca', score, label: 'Fraca', color: '#ef4444', width: '25%' };
  if (score <= 6) return { level: 'medio', score, label: 'Médio', color: '#f59e0b', width: '50%' };
  if (score <= 8) return { level: 'forte', score, label: 'Forte', color: '#10b981', width: '75%' };
  return { level: 'extraforte', score, label: 'Extraforte', color: '#0ea5e9', width: '100%' };
};
