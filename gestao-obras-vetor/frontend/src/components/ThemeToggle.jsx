import React from 'react';
import {Moon,Sun} from 'lucide-react';
import {useTheme} from '../context/ThemeContext';
export default function ThemeToggle(){const {theme,toggleTheme}=useTheme();const dark=theme==='dark';return <button type="button" onClick={toggleTheme} className="btn-icon theme-toggle" title={dark?'Ativar tema claro':'Ativar tema escuro'} aria-label={dark?'Ativar tema claro':'Ativar tema escuro'}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button>;}
