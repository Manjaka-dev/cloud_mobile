import {
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    inMemoryPersistence,
    onAuthStateChanged,
    getIdToken
} from "firebase/auth";
import { auth } from "@/firebase";

const INACTIVITTY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
let inactivityTimer: number | null = null;

const activityEvents = ['mousemove', 'keydown', 'scroll'];

const resetInactivityTimer = () => {
    if (inactivityTimer) window.clearTimeout(inactivityTimer);
    inactivityTimer = window.setTimeout(async () => {
        try {
            await  signOut();
        } catch {
            /* ignore */
        }
    }, INACTIVITTY_TIMEOUT);
};

export const startInactivityWatcher = () => {
    resetInactivityTimer();
    for (const ev of activityEvents) window.addEventListener(ev, resetInactivityTimer);
};

export const stopInactivityWatcher = () => {
    if (inactivityTimer) window.clearTimeout(inactivityTimer);
    inactivityTimer = null;
    for (const ev of activityEvents) window.removeEventListener(ev, resetInactivityTimer);
};


/**
 * login
 * @param email
 * @param password
 * @param remember - true = persistent (local), false = session, null/undefined = memory
 */
export const login = async (email: string, password: string, remember?: boolean | null) => {
    if (remember === true) await setPersistence(auth, browserLocalPersistence);
    else if (remember === false) await setPersistence(auth, browserSessionPersistence);
    else await setPersistence(auth, inMemoryPersistence);

    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    startInactivityWatcher();
    return userCredential.user;
};

export const signOut = async () => {
    stopInactivityWatcher();
    try {
        await fetch("/sessionLogout", { method: "POST", credentials: "include" });
    } catch {
        /* ignore errors calling server logout */
    }
    await firebaseSignOut(auth);
};

/**
 * getToken
 * @param forceRefresh - true pour forcer le rafraîchissement du token
 */
export const getToken = async (forceRefresh = false): Promise<string | null> => {
    const user = auth.currentUser;
    if (!user) return null;
    try {
        return await getIdToken(user, forceRefresh);
    } catch (e) {
        console.error("Erreur getIdToken", e);
        return null;
    }
};

/**
 * createServerSession
 * envoie l'idToken au backend pour créer un session cookie HTTP-only
 * backend attendu: POST /sessionLogin { idToken, remember }
 */
export const createServerSession = async (idToken: string, remember = false): Promise<boolean> => {
    try {
        const res = await fetch("/sessionLogin", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken, remember })
        });
        return res.ok;
    } catch (e) {
        console.error("Erreur createServerSession", e);
        return false;
    }
};

// auto-start/stop watcher selon l'état d'auth
onAuthStateChanged(auth, (user) => {
    if (user) startInactivityWatcher();
    else stopInactivityWatcher();
});

export default {
    login,
    signOut,
    getToken,
    createServerSession,
    startInactivityWatcher,
    stopInactivityWatcher
};