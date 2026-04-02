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
