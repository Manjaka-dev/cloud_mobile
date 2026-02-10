import { createApp } from 'vue'
import App from './App.vue'
import router from './router';

import { IonicVue, isPlatform } from '@ionic/vue';

/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/vue/css/padding.css';
import '@ionic/vue/css/float-elements.css';
import '@ionic/vue/css/text-alignment.css';
import '@ionic/vue/css/text-transformation.css';
import '@ionic/vue/css/flex-utils.css';
import '@ionic/vue/css/display.css';

/*
 * Ionic Dark Mode
 * -----------------------------------------------------
 * For more info, please see:
 * https://ionicframework.com/docs/theming/dark-mode
 */

/* @import '@ionic/vue/css/palettes/dark.always.css'; */
/* @import '@ionic/vue/css/palettes/dark.class.css'; */
import '@ionic/vue/css/palettes/dark.system.css';

/* Theme variables */
import './theme/variables.css';

// typescript
// Extrait à mettre dans `src/main.ts` (remplacer l'appel actuel)
import { requestPermissionAndSaveToken, onForegroundMessage } from '@/service/notificationService';
import { auth } from '@/firebase';
import { onAuthStateChanged } from 'firebase/auth';

// Fonction utilitaire locale pour vérifier que navigator.serviceWorker est sûr à utiliser
function canUseServiceWorker(): boolean {
  try {
    return (typeof navigator !== 'undefined') &&
           ('serviceWorker' in navigator) &&
           !!navigator.serviceWorker &&
           typeof (navigator.serviceWorker as any).register === 'function' &&
           typeof (navigator.serviceWorker as any).ready !== 'undefined';
  } catch (e) {
    return false;
  }
}

// Ne pas tenter d'enregistrer le SW sur les plateformes "hybrid" (Capacitor iOS/Android)
onAuthStateChanged(auth, async (user) => {
  if (user && user.email) {
    // Si on est sur web et que ServiceWorker est utilisable, on essaye d'enregistrer
    if (!isPlatform('hybrid') && canUseServiceWorker()) {
      try {
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.log('FCM SW registered', registration);
        await requestPermissionAndSaveToken(user.email, registration);
      } catch (err) {
        console.error('SW registration failed:', err);
        // fallback sans registration
        try { await requestPermissionAndSaveToken(user.email); } catch (e) { console.error('requestPermission fallback failed', e); }
      }
    } else {
      // native/hybrid or serviceWorker non disponible -> laisser notificationService gérer la logique hybrid
      try { await requestPermissionAndSaveToken(user.email); } catch (e) { console.error('requestPermissionAndSaveToken failed for hybrid/non-sw', e); }
    }
  } else {
    console.log('Utilisateur non connecté - notifications non initialisées');
  }
});

onForegroundMessage(payload => {
  console.log('Message foreground', payload);
});

const app = createApp(App)
  .use(IonicVue)
  .use(router);

router.isReady().then(() => {
  app.mount('#app');
});
