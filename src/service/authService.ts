import {
    browserLocalPersistence,
    browserSessionPersistence,
    getIdToken,
    inMemoryPersistence,
    onAuthStateChanged,
    setPersistence,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut
} from "firebase/auth";
import {auth} from "@/firebase";
import {addDocument, getCollection,} from '@/service/fireStoreService';

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

async function logAuthEvent(email: string, action: 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'USER_BLOCKED', remember?: boolean | null, reason?: string | null) {
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
        // n'empêche pas le flow d'auth, logs en warn
        console.warn('Erreur écriture journal auth', e);
    }
}

/* ----- paramètres et suivi des tentatives ----- */

// typescript
async function getParamNumber(name: string, fallback = 0): Promise<number> {
    try {
        const items = await getCollection('parametres');
        const p = items.find((it: any) => it.nom === name || it.donnes?.nom === name);
        if (!p) return fallback;
        const raw = p.valeur ?? p.donnes?.valeur;
        const n = parseInt(String(raw ?? ''), 10);
        return Number.isNaN(n) ? fallback : n;
    } catch (e: any) {
        // si permissions manquantes, utiliser la valeur par défaut au lieu de bloquer le login
        if (e?.code === 'permission-denied' || (typeof e?.message === 'string' && e.message.includes('Missing or insufficient permissions'))) {
            console.warn(`getParamNumber: lecture de 'parametres' refusée, utilisation de la valeur par défaut pour ${name}: ${fallback}`);
            return fallback;
        }
        console.error('Erreur getParamNumber', e);
        throw e;
    }
}

async function getJournalForEmail(email: string) {
    const all = await getCollection<any>('journal');
    const filtered = (all || []).filter((it: any) => it?.donnes?.email === email);
    filtered.sort((a: any, b: any) => {
        const ta = a?.donnes?.timestamp ? new Date(a.donnes.timestamp).getTime() : 0;
        const tb = b?.donnes?.timestamp ? new Date(b.donnes.timestamp).getTime() : 0;
        return ta - tb;
    });
    return filtered;
}

async function findAttemptByEmail(email: string): Promise<AttemptDoc | null> {
    try {
        const entries = await getJournalForEmail(email);
        if (!entries || entries.length === 0) return null;

        // index du dernier LOGIN_SUCCESS
        let lastSuccessIndex = -1;
        for (let i = entries.length - 1; i >= 0; i--) {
            if (entries[i]?.donnes?.action === 'LOGIN_SUCCESS') {
                lastSuccessIndex = i;
                break;
            }
        }

        // échecs après le dernier succès
        const after = lastSuccessIndex >= 0 ? entries.slice(lastSuccessIndex + 1) : entries;
        const failedEntries = after.filter(e => e?.donnes?.action === 'LOGIN_FAILED');

        const failedCount = failedEntries.length;
        const lastAttempt = failedEntries.length ? failedEntries[failedEntries.length - 1].donnes.timestamp : undefined;

        // rechercher dernier blocage explicite dans le journal
        const blockEntry = [...entries].reverse().find(e =>
            e?.donnes?.action === 'USER_BLOCKED' ||
            (typeof e?.donnes?.raison === 'string' && e.donnes.raison?.startsWith('USER_BLOCKED'))
        );

        let blockedUntil: string | undefined;
        if (blockEntry) {
            // on peut stocker la date ISO directement dans donnes.raison pour simplicité
            if (typeof blockEntry.donnes.raison === 'string' && blockEntry.donnes.raison !== '') {
                // format attendu : iso ou "USER_BLOCKED:<iso>"
                const r = blockEntry.donnes.raison;
                blockedUntil = r.startsWith('USER_BLOCKED') ? r.split(':')[1] : r;
            } else {
                blockedUntil = undefined;
            }
        }

        return {
            email,
            failedCount,
            lastAttempt,
            blockedUntil
        };
    } catch (e) {
        // si lecture du journal refusée, revenir à null (comportement tolérant)
        if ((e as any)?.code === 'permission-denied' || (typeof (e as any)?.message === 'string' && (e as any).message.includes('Missing or insufficient permissions'))) {
            console.warn(`findAttemptByEmail: lecture de 'journal' refusée pour ${email}`);
            return null;
        }
        console.error('Erreur findAttemptByEmail', e);
        throw e;
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function updateFailedAttempt(email: string, maxFailed: number, blockMinutes: number, remember?: boolean | null) {
    // Reconstruire l'état depuis le journal (le dernier LOGIN_FAILED vient d'être ajouté)
    const attempt = await findAttemptByEmail(email);
    const newCount = attempt?.failedCount ?? 0;

    if (newCount >= maxFailed) {
        const blockedIso = isoNowPlusMinutes(blockMinutes);
        // créer une entrée USER_BLOCKED dans le journal (raison contient la date ISO)
        await logAuthEvent(email, 'USER_BLOCKED', remember, `USER_BLOCKED:${blockedIso}`);
    }
}


type AttemptDoc = {
    id?: string;
    email: string;
    failedCount: number;
    lastAttempt?: string; // ISO
    blockedUntil?: string; // ISO
};

function isoNowPlusMinutes(minutes: number) {
    const d = new Date();
    d.setMinutes(d.getMinutes() + minutes);
    return d.toISOString();
}

async function ensureNotBlocked(email: string) {
    const attempt = await findAttemptByEmail(email);
    if (!attempt || !attempt.blockedUntil) return;
    const until = new Date(attempt.blockedUntil);
    if (until > new Date()) {
        const err = new Error('USER_BLOCKED');
        (err as any).blockedUntil = attempt.blockedUntil;
        throw err;
    }
}

/* ----- login avec contrôle de blocage ----- */

/**
 * login
 * @param email
 * @param password
 * @param remember - true = persistent (local), false = session, null/undefined = memory
 */
export const login = async (email: string, password: string, remember?: boolean | null) => {
    // lire paramètres
    const maxFailed = await getParamNumber('MAX_FAILED_ATTEMPTS', 5);
    const blockMinutes = await getParamNumber('BLOCK_DURATION_MINUTES', 30);

    // vérifier si déjà bloqué
    try {
        await ensureNotBlocked(email);
    } catch (e: any) {
        // bloqué : journaliser l'échec et renvoyer
        await logAuthEvent(email, 'LOGIN_FAILED', remember, `USER_BLOCKED until ${e?.blockedUntil || 'unknown'}`);
        throw e;
    }

    try {
        if (remember === true) await setPersistence(auth, browserLocalPersistence);
        else if (remember === false) await setPersistence(auth, browserSessionPersistence);
        else await setPersistence(auth, inMemoryPersistence);
    } catch (e: any) {
        await logAuthEvent(email, 'LOGIN_FAILED', remember, `setPersistence_failed: ${e?.code || e?.message || String(e)}`);
        throw e;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await logAuthEvent(email, 'LOGIN_SUCCESS', remember);

        // succès -> rien à faire : l'état des tentatives est reconstruit depuis la collection 'journal'

        startInactivityWatcher();
        return userCredential.user;
    } catch (e: any) {
        const reason = e?.code || e?.message || String(e);
        await logAuthEvent(email, 'LOGIN_FAILED', remember, reason);

        // reconstruire le compteur depuis le journal et bloquer si nécessaire
        try {
            await updateFailedAttempt(email, maxFailed, blockMinutes, remember);
        } catch (e2) {
            console.error('Erreur gestion tentatives login via journal', e2);
        }

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
