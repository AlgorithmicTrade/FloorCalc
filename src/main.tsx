/**
 * Entry-point рендерера. Подключает все global-стили в правильном порядке
 * (tokens → typography → globals → print) и монтирует <App /> в #root.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/typography.css';
import './styles/globals.css';
import './styles/print.css';
import { App } from './App';

const root = document.getElementById('root');
if (!root) {
  throw new Error('#root not found in index.html');
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
