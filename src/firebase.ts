import { initializeApp } from "firebase/app";
import {getAuth, initializeAuth, indexedDBLocalPersistence, setPersistence, Auth} from "firebase/auth";
import { getFirestore } from 'firebase/firestore';
import {isPlatform} from "@ionic/vue";

const firebaseConfig = {
    apiKey: "AIzaSyBuiUJBK9_eEXVKjc89iUNn1gLHdrcqwQk",
    authDomain: "fir-getting-started-6c8b0.firebaseapp.com",
    projectId: "fir-getting-started-6c8b0",
    storageBucket: "fir-getting-started-6c8b0.firebasestorage.app",
    messagingSenderId: "1039491872784",
    appId: "1:1039491872784:web:e4e3f10066bf40b624b295",
    measurementId: "G-HDLX2L3XLW"
};

const app = initializeApp(firebaseConfig);
let auth: Auth;
if (isPlatform('hybrid')) {
    auth = initializeAuth(app, {persistence: indexedDBLocalPersistence})
} else {
    auth = getAuth(app);
    setPersistence(auth,indexedDBLocalPersistence);
}
export {auth};
export const db = getFirestore(app);