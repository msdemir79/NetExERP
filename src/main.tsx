import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { installGlobalErrorHandlers } from './components/Common/globalErrorHandlers';
import './index.css';

// React ağacının dışındaki hatalar (`.catch()`'siz promise redleri ve global
// hatalar) sessizce kaybolmasın: kullanıcıya bildirim olarak gösterilir.
installGlobalErrorHandlers();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
