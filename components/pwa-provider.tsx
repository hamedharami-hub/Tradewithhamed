// components/pwa-provider.tsx
'use client';

import React, { useEffect } from 'react';

export const PWAProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(reg => {
          console.log('[PWA] Service Worker registered successfully with scope:', reg.scope);
          void reg.update();
          const worker = navigator.serviceWorker.controller || reg.active;
          worker?.postMessage({ type: 'GET_OFFLINE_SHELL_STATUS' });
        })
        .catch(err => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
      const handleServiceWorkerMessage = (event: MessageEvent) => {
        if (event.data?.type === 'OFFLINE_SHELL_STATUS') {
          window.dispatchEvent(new CustomEvent('tradewithhamed:offline-shell-status', { detail: event.data }));
        }
      };
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
      return () => navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
    }
  }, []);

  return <>{children}</>;
};
