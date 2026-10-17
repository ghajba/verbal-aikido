import { render } from 'preact';
import { App } from './app/App';
import './ui/styles/base.css';

const container = document.getElementById('app');
if (container) {
  render(<App />, container);
}

// Service worker registration
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Degrades silently as per Ground Rule 5
    });
  });
}
