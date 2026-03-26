import React, { useState, useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';

function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    try {
      return localStorage.getItem('theme') === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (isDark) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
      } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
      }
    } catch {
      // silenciar erros de localStorage em contextos restritos
    }
  }, [isDark]);

  return (
    <button
      onClick={() => setIsDark(d => !d)}
      className="btn-icon theme-toggle"
      title={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export default ThemeToggle;
