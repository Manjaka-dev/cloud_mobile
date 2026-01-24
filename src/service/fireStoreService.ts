import { db } from '@/firebase';
import {
    collection,
    getDocs,
    doc,
    getDoc,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc
} from 'firebase/firestore';

export async function getCollection<T = any>(collectionName: string): Promise<Array<T & { id: string}>> {
    const colref = collection(db, collectionName);
    const snap = await getDocs(colref);
    return snap.docs.map(d => ({id: d.id, ...(d.data() as T)}));
}

export async function getDocument<T = any>(collectionName: string, id: string): Promise<(T & { id: string }) | null> {
    const docRef = doc(db, collectionName, id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as T) };
}

export function listenCollection<T = any>(collectionName: string, callback: (items: Array<T & { id: string }>) => void) {
    const colRef = collection(db, collectionName);
    return onSnapshot(colRef, snap => {
        const items = snap.docs.map(d => ({ id: d.id, ...(d.data() as T) }));
        callback(items);
    });
}

export async function addDocument(collectionName: string, data: any) {
    const colRef = collection(db, collectionName);
    return addDoc(colRef, data);
}

export async function updateDocument(collectionName: string, id: string, data: Partial<any>) {
    const docRef = doc(db, collectionName, id);
    return updateDoc(docRef, data);
}

export async function deleteDocument(collectionName: string, id: string) {
    const docRef = doc(db, collectionName, id);
    return deleteDoc(docRef);
}