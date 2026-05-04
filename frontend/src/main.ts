import { mount } from 'ripple';
import { App } from './App.tsrx';
import { createDashboard } from './dashboard';
import './styles.css';

mount(App, {
  target: document.getElementById('root')!,
});

queueMicrotask(() => {
  const root = document.getElementById('kpop-dashboard');
  if (!root) {
    throw new Error('No se encontro el contenedor principal');
  }

  createDashboard(root);
});
