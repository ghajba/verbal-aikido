import { signal } from '@preact/signals';

export const needRefresh = signal<boolean>(false);
let waitingWorker: ServiceWorker | null = null;

export function initPwa(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;

  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => {
        // If there's already a waiting worker
        if (reg.waiting) {
          waitingWorker = reg.waiting;
          needRefresh.value = true;
          return;
        }

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                waitingWorker = newWorker;
                needRefresh.value = true;
              }
            });
          }
        });
      })
      .catch(() => {
        // Degrades silently as per Ground Rule 5
      });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}

export function applyUpdate(): void {
  if (waitingWorker) {
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  } else if (typeof window !== 'undefined') {
    window.location.reload();
  }
}
