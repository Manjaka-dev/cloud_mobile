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
import { addDocument } from '@/service/fireStoreService';

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

function formatDateISO(date: Date) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

function authModeLabel(remember?: boolean | null) {
    if (remember === true) return 'ONLINE';
    if (remember === false) return 'SESSION';
    return 'MEMORY';
}

async function logAuthEvent(email: string, action: 'LOGIN_SUCCESS' | 'LOGIN_FAILED', remember?: boolean | null, reason?: string | null) {
    const now = new Date();
    const payload: any = {
        dateCreation: formatDateISO(now),
        donnes: {
            action,
            authMode: authModeLabel(remember),
            email,
            timestamp: now.toISOString()
        },
        idEntite: null,
        localId: null,
        operation: "INSERT",
        synchronise: false,
        typeEntite: "utilisateurs",
        version: null
    };
    if (reason) payload.donnes.raison = reason;

    try {
        await addDocument('journal', payload);
    } catch (e) {
        // ne pas bloquer l'auth si l'écriture du journal échoue
        console.error('Erreur écriture journal auth', e);
    }
}

/**
 * login
 * @param email
 * @param password
 * @param remember - true = persistent (local), false = session, null/undefined = memory
 */
export const login = async (email: string, password: string, remember?: boolean | null) => {
    try {
        if (remember === true) await setPersistence(auth, browserLocalPersistence);
        else if (remember === false) await setPersistence(auth, browserSessionPersistence);
        else await setPersistence(auth, inMemoryPersistence);
    } catch (e: any) {
        // loger l'échec de persistance comme échec de connexion (ou séparé si souhaité)
        await logAuthEvent(email, 'LOGIN_FAILED', remember, `setPersistence_failed: ${e?.code || e?.message || String(e)}`);
        throw e;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await logAuthEvent(email, 'LOGIN_SUCCESS', remember);
        startInactivityWatcher();
        return userCredential.user;
    } catch (e: any) {
        const reason = e?.code || e?.message || String(e);
        await logAuthEvent(email, 'LOGIN_FAILED', remember, reason);
        throw e;
    }
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
