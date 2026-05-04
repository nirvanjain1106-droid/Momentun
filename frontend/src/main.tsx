import { createRoot } from 'react-dom/client';
import App from './app/App';
import './styles/index.css';
import { initGlass } from './lib/glassMode'

// Initialize glass mode before render
// so there's no flash of wrong state
initGlass()

createRoot(document.getElementById('root')!).render(<App />);
