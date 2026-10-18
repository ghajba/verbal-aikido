import { render } from 'preact';
import { App } from './app/App';
import './ui/styles/base.css';

const container = document.getElementById('app');
if (container) {
  render(<App />, container);
}

import { initPwa } from './pwa';

initPwa();
