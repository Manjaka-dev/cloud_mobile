// javascript
// Fichier : `public/firebase-messaging-sw.js`
// Remplacer les valeurs par celles de votre config si besoin
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: 'AIzaSyBuiUJBK9_eEXVKjc89iUNn1gLHdrcqwQk',
    authDomain: 'fir-getting-started-6c8b0.firebaseapp.com',
    projectId: 'fir-getting-started-6c8b0', // nécessaire pour installations
    storageBucket: 'fir-getting-started-6c8b0.firebasestorage.app',
    messagingSenderId: '1039491872784',
    appId: '1:1039491872784:web:e4e3f10066bf40b624b295',
    measurementId: 'G-HDLX2L3XLW'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
    const { title, body } = (payload && payload.notification) || {};
    const options = {
        body: body || '',
        data: payload.data || {}
    };
    self.registration.showNotification(title || 'Notification', options);
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(windowClients => {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url === url && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow(url);
        })
    );
});
