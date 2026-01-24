import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from 'firebase/firestore';

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
export const auth = getAuth(app);
export const db = getFirestore(app);

