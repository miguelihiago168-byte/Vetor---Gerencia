import React,{createContext,useContext,useLayoutEffect,useEffect,useState,useMemo} from 'react';
const ThemeContext=createContext(null);
const initial=()=>{try{return localStorage.getItem('theme')==='dark'?'dark':'light';}catch{return 'light';}};
export function ThemeProvider({children}){
 const [theme,setTheme]=useState(initial);
 useLayoutEffect(()=>{document.body.classList.toggle('dark-mode',theme==='dark');try{localStorage.setItem('theme',theme);}catch{/* Persistência opcional. */}},[theme]);
 useEffect(()=>{const sync=e=>{if(e.key==='theme')setTheme(e.newValue==='dark'?'dark':'light');};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
 const value=useMemo(()=>({theme,setTheme:value=>setTheme(value==='dark'?'dark':'light'),toggleTheme:()=>setTheme(t=>t==='dark'?'light':'dark')}),[theme]);
 return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme(){const context=useContext(ThemeContext);if(!context)throw Error('useTheme deve estar dentro de ThemeProvider');return context;}
