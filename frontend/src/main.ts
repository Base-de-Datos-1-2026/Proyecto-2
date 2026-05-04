import { mount } from 'ripple';
// @ts-ignore - Svelte module typings are provided by the build tooling
import App from './App.svelte';
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
