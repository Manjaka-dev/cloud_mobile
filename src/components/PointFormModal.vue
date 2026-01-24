<script setup lang="ts">
import {onMounted, ref, watch} from 'vue';
import {addDocument, getCollection} from '@/service/fireStoreService';
import {getToken} from '@/service/authService';

const props = defineProps<{
  isOpen: boolean;
  lat: number | null;
  lng: number | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void ;
  (e: 'saved', playload: any): void;
}>();

const show = ref(false);
watch(() => props.isOpen, (v) => (show.value= v));

const budget = ref<number | null>(null);
const description = ref('');
const surfaceM2 = ref<number | null>(null);
const selectedEntreprise = ref < string | number | null>(null);
const entreprises = ref<Array<any>>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const lastErrorObj = ref<any>(null);
const retryCount = ref(0);
const MAX_RETRIES = 2; // nombre max de tentatives automatiques pour erreurs transitoires

async function loadEntreprises() {
  error.value = null;

  const token = await getToken();
  if (!token)
  {
    error.value = 'Vous devez être connecté pour récupérer la liste des entreprises.';
    entreprises.value = [];
    return;
  }

  try {
    const items = await getCollection('entreprises');
    entreprises.value = items.map(i => ({
      docId: i.id,
      nom: (i as any).nom,
      postgres_id: (i as any).postgres_id ?? i.id
    }));
  } catch (e: any) {
    console.error('Erreur récupération des entreprises', e);
    const msg = String(e?.message || e);
    if (msg.includes('permission') || msg.includes('insufficient') || msg.includes('permission-denied')) {
      error.value = 'Accès refusé : vérifiez vos règles Firestore et que vous êtes connecté.';
    } else {
      error.value = 'Erreur lors de la récupération des entreprises.';
    }
    entreprises.value = [];
  }
}

onMounted(loadEntreprises);

watch(() => show.value, (v) => {
  if (v) loadEntreprises();
});

function close () {
  reset();
  emit('close');
}

function reset() {
  budget.value = null;
  description.value = '';
  surfaceM2.value = null;
  selectedEntreprise.value = null;
  error.value = null;
  lastErrorObj.value = null;
  retryCount.value = 0;
  show.value = false;
}

function isTransientError(err: any) {
  if (!err) return false;
  const code = String(err.code || '').toLowerCase();
  const msg = String(err.message || '').toLowerCase();
  // erreurs non transitoires : permission, invalid-argument, failed-precondition
  if (code.includes('permission') || msg.includes('permission-denied') || code.includes('auth') || code.includes('invalid')) return false;
  // considérer comme transitoire les erreurs réseau / service unavailable / internal
  if (code.includes('unavailable') || code.includes('internal') || code.includes('deadline') || msg.includes('network')) return true;
  // par défaut : ne pas retry
  return false;
}

async function attemptAdd(payload: any, retriesLeft: number): Promise<any> {
  try {
    return await addDocument('signalements', payload);
  } catch (err: any) {
    lastErrorObj.value = err;
    // classification des erreurs
    const msg = String(err?.message || err);
    if (String(err?.code || '').toLowerCase().includes('permission') || msg.toLowerCase().includes('permission-denied')) {
      // permission denied -> pas de retry
      throw { retryable: false, reason: 'permission-denied', original: err };
    }

    if (isTransientError(err) && retriesLeft > 0) {
      // attente courte avant retry (exponential backoff simple)
      const backoffMs = (MAX_RETRIES - retriesLeft + 1) * 500; // 500ms, 1000ms, ...
      await new Promise(res => setTimeout(res, backoffMs));
      return attemptAdd(payload, retriesLeft - 1);
    }

    // non retryable or out of retries
    throw { retryable: false, reason: err?.code || 'unknown', original: err };
  }
}

async function save() {
  error.value = null;
  lastErrorObj.value = null;

  if (budget.value == null || surfaceM2.value == null || !description.value || !selectedEntreprise.value || props.lat == null || props.lng == null ) {
    error.value = 'Remplissez tout les champs obligatoires';
    return;
  }

  const token = await getToken();
  if (!token) {
    error.value = 'Vous devez être connecté pour enregistrer un point.';
    return;
  }

  loading.value = true;

  try {
    const now =  new Date().toISOString();
    const playload = {
      budget: Number(budget.value),
      dateCreation: now,
      dateMiseAJour: now,
      description: description.value,
      postgres_id: '', // vide pour le moment
      idEntreprise: Number(selectedEntreprise.value),
      surfaceM2: Number(surfaceM2.value),
      version: 1,
      location: { lat: props.lat, lng: props.lng }
    };

    retryCount.value = 0;
    const docRef = await attemptAdd(playload, MAX_RETRIES);

    // succès
    const result = { id: docRef.id, ...playload };
    emit('saved', result);
    reset();
  } catch (e: any) {
    console.error('Erreur enregistrement signalement', e);
    // si erreur provenant d'attemptAdd contient original
    const original = e?.original ?? e;
    lastErrorObj.value = original;

    // Déterminer message utilisateur
    if (e?.reason === 'permission-denied' || String(original?.message || '').toLowerCase().includes('permission')) {
      error.value = 'Accès refusé : vous n\'avez pas les droits d\'écriture sur Firestore.';
    } else if (isTransientError(original)) {
      error.value = 'Erreur réseau ou service temporaire. Vous pouvez réessayer.';
    } else {
      // message générique avec info console
      error.value = String(original?.message || 'Erreur lors de l\'enregistrement');
    }
  } finally {
    loading.value = false;
  }
}

async function retrySave() {
  // tente à nouveau en conservant les mêmes valeurs
  if (loading.value) return;
  retryCount.value += 1;
  await save();
}

</script>

<template>
  <div v-if="show" class="pfm-overlay" @click.self="close">
    <div class="pfm-modal">
      <h3>Enregistrer le point</h3>

      <div class="pfm-row">
        <label>Budget</label>
        <input type="number" v-model.number="budget" min="0" />
      </div>

      <div class="pfm-row">
        <label>Surface (m²)</label>
        <input type="number" v-model.number="surfaceM2" min="0" />
      </div>

      <div class="pfm-row">
        <label>Entreprise</label>
        <select v-model="selectedEntreprise">
          <option value="" disabled>Choisir une entreprise</option>
          <option v-for="e in entreprises" :key="e.docId" :value="e.postgres_id">{{ e.nom }}</option>
        </select>
      </div>

      <div class="pfm-row">
        <label>Description</label>
        <textarea v-model="description" rows="3"></textarea>
      </div>

      <div class="pfm-actions">
        <button @click="close" :disabled="loading">Annuler</button>
        <button v-if="!error" @click="save" :disabled="loading">{{ loading ? 'Enregistrement...' : 'Enregistrer' }}</button>
        <div v-else style="display:flex; gap:8px;">
          <button @click="close" :disabled="loading">Annuler</button>
          <button @click="retrySave" :disabled="loading">Réessayer</button>
        </div>
      </div>

      <p v-if="error" class="pfm-error">{{ error }}</p>
      <p v-if="lastErrorObj" style="font-size:12px; color:#666; margin-top:8px;">Détails : {{ lastErrorObj?.message || lastErrorObj?.code || '' }}</p>
    </div>
  </div>
</template>

<style scoped>
.pfm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}
.pfm-modal {
  background: #fff;
  padding: 16px;
  border-radius: 8px;
  width: 320px;
  max-width: calc(100% - 32px);
  box-shadow: 0 6px 20px rgba(0,0,0,0.2);
}
.pfm-row { margin-bottom: 10px; display:flex; flex-direction:column; }
.pfm-row label { font-size: 13px; margin-bottom:4px; }
.pfm-row input, .pfm-row select, .pfm-row textarea { padding:8px; border:1px solid #ddd; border-radius:4px; font-size:14px; }
.pfm-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:8px; }
.pfm-actions button { padding:8px 12px; border-radius:4px; border: none; cursor:pointer; }
.pfm-actions button:first-child { background:#eee; }
.pfm-actions button:last-child { background:#2d8cff; color:#fff; }
.pfm-error { color: #c00; margin-top:8px; font-size:13px; }
</style>