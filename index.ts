// Polyfill crypto.getRandomValues for socket.io-client (pure JS, no native modules)
if (typeof global.crypto === 'undefined') {
  (global as any).crypto = {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
  };
}

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
