// src/service/notificationService.ts
import { messaging } from '@/firebase';
import { getToken, onMessage } from 'firebase/messaging';
import { addDocument } from '@/service/fireStoreService';
import { isPlatform } from '@ionic/vue';
import { Capacitor } from '@capacitor/core';
// NOTE: import of @capacitor/push-notifications is done dynamically to avoid Vite resolving it in web builds

const VAPID_KEY = (import.meta.env.VITE_FIREBASE_VAPID_KEY as string) || '';

// Remarque: cette fonction ne demandera la permission et n'enregistrera le token
// que si `userEmail` est fourni (indicateur que l'utilisateur est connecté).
export async function requestPermissionAndSaveToken(userEmail?: string, swRegistration?: ServiceWorkerRegistration | null) {
    try {
        if (!userEmail) {
            // Ne pas demander la permission si l'utilisateur n'est pas connecté
            console.warn('requestPermissionAndSaveToken: no user email provided, skipping permission request');
            return null;
        }

        // branch selon plateforme
        if (isPlatform('hybrid')) {
            // Build module name at runtime to avoid static bundler resolution
            const modName = '@capacitor' + '/push-notifications';
            const { PushNotifications } = await import(modName);

            // Capacitor native flow
            const perm = await PushNotifications.requestPermissions();
            if (perm.receive !== 'granted') {
                console.warn('Push permission not granted on native platform', perm);
                return null;
            }

            // register -> triggers 'registration' event with token
            await PushNotifications.register();

            const tokenPromise: Promise<string> = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Push registration timed out'));
                }, 10000);

                const regListener = PushNotifications.addListener('registration', (token) => {
                    clearTimeout(timeout);
                    try { regListener.remove(); } catch (e) { /* ignore */ }
                    resolve((token as any).value ?? (token as any).token ?? '');
                });

                const errListener = PushNotifications.addListener('registrationError', (err) => {
                    clearTimeout(timeout);
                    try { errListener.remove(); } catch (e) { /* ignore */ }
                    reject(err);
                });
            });

            const token = await tokenPromise;
            if (!token) return null;

            try {
                await addDocument('fcmTokens', {
                    token,
                    userEmail: userEmail ?? null,
                    platform: Capacitor.getPlatform(),
                    createdAt: new Date().toISOString()
                });
            } catch (e) {
                console.warn('Erreur sauvegarde token natif', e);
            }

            return token;
        } else {
            // Web flow using Firebase Messaging
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return null;

            // si pas fourni, attend la registration active
            const registration = swRegistration ?? (await navigator.serviceWorker.ready);

            const token = await getToken(messaging, VAPID_KEY ? {
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: registration
            } : { serviceWorkerRegistration: registration });

            if (!token) return null;

            try {
                await addDocument('fcmTokens', {
                    token,
                    userEmail: userEmail ?? null,
                    platform: 'web',
                    createdAt: new Date().toISOString()
                });
            } catch (e) {
                console.warn('Erreur sauvegarde token web', e);
            }

            return token;
        }
    } catch (err) {
        console.error('FCM token error', err);
        return null;
    }
}

export async function onForegroundMessage(callback: (payload: any) => void) {
    if (isPlatform('hybrid')) {
        try {
            const modName = '@capacitor' + '/push-notifications';
            const { PushNotifications } = await import(modName);
            PushNotifications.addListener('pushNotificationReceived', (notification) => {
                callback(notification);
            });
        } catch (e) {
            console.warn('pushNotificationReceived listener failed', e);
        }
    } else {
        try {
            onMessage(messaging, payload => callback(payload));
        } catch (e) {
            console.warn('onMessage failed', e);
        }
    }
}
