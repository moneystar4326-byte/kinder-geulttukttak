import { createRoot } from 'react-dom/client';
import '@fontsource/noto-sans-kr/korean-400.css';
import '@fontsource/noto-sans-kr/korean-700.css';
import '@fontsource/noto-sans-kr/latin-400.css';
import '@fontsource/noto-sans-kr/latin-700.css';
import './styles.css';
import { App } from './App';
import { IND } from '../shared/industry';

document.title = IND.appName;
createRoot(document.getElementById('root')!).render(<App />);
