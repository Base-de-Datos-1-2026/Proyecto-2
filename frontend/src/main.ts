import { createDashboard } from './dashboard';
import './styles.css';

queueMicrotask(() => {
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('No se encontro el contenedor raiz');
  }

  createDashboard(root);
});
