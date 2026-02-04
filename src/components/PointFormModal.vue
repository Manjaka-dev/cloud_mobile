<script setup lang="ts">
import {onMounted, ref, watch} from 'vue';
import {addDocument, getCollection} from '@/service/fireStoreService';
import {getToken} from '@/service/authService';
import { IonIcon } from '@ionic/vue';
import { uploadWithProgress, resizeImageFile } from '@/service/StorageService';

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

// ---- new: types de signalement ----
type TypeSignal = { id: string; nom: string; icone?: string; iconObj?: any };
const types = ref<TypeSignal[]>([]);
const selectedType = ref<TypeSignal | null>(null);

let iconsModule: any = null; // chargé dynamiquement quand nécessaire

// helpers dynamiques
function isUrl(v?: string) {
  if (!v) return false;
  return /^(https?:)?\/\//i.test(v) || /^\//.test(v);
}

function isEmoji(v?: string) {
  if (!v) return false;
  const s = String(v).trim();
  if (s.length === 0 || s.length > 4) return false;
  return /[^0-9A-Za-z_\-\s]/.test(s);
}

async function loadTypes() {
  try {
    const items = await getCollection('typeSignalement');
    // tenter de charger dynamiquement ionicons/icons (uniquement si besoin)
    const needIcons = (items || []).some((t: any) => !!t?.icone && !isUrl(t.icone) && !isEmoji(t.icone));
    if (needIcons) {
      try {
        iconsModule = await import('ionicons/icons');
      } catch (e) {
        console.warn('Impossible de charger dynamiquement ionicons/icons', e);
        iconsModule = null;
      }
    }

    types.value = (items || []).map((t: any) => {
      const ic: string | undefined = t.icone;
      const ts: TypeSignal = { id: t.id, nom: t.nom ?? t.name ?? t.id, icone: ic };
      if (iconsModule && ic && !isUrl(ic) && !isEmoji(ic)) {
        // trouver l'export correspondant (clé exactement égale)
        const key = String(ic).trim();
        ts.iconObj = (iconsModule as any)[key] ?? (iconsModule as any)[key.replace(/[-_ ]+(.)/g, (_, c) => c.toUpperCase())];
      }
      return ts;
    });
  } catch (e) {
    console.error('Erreur récupération types de signalement', e);
    types.value = [];
  }
}

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

onMounted(() => {
  loadTypes();
  loadEntreprises();
});

watch(() => show.value, (v) => {
  if (v) {
    loadEntreprises();
    loadTypes();
  }
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
  selectedType.value = null;
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

const MAX_IMAGES = 5;
const MAX_FILE_MB = 8; // taille cible avant compression
const images = ref<Array<{ file?: File; url?: string; resizedBlob?: Blob; progress: number; status: 'idle' | 'uploading' | 'done' | 'error'; error?: string }>>([]);
const imagesUploading = ref(false);

function handleFileInput(e: Event) {
  const inp = e.target as HTMLInputElement;
  if (!inp.files) return;
  for (const f of Array.from(inp.files)) {
    if (images.value.length >= MAX_IMAGES) break;
    const url = URL.createObjectURL(f);
    images.value.push({ file: f, url, progress: 0, status: 'idle' });
  }
}

async function doUploadImages(): Promise<string[]> {
  const uploaded: string[] = [];
  imagesUploading.value = true;
  for (const it of images.value) {
    if (it.status === 'done' && it.url && !it.file) { // already url
      uploaded.push(it.url);
      continue;
    }
    if (!it.file) continue;
    it.status = 'uploading';
    it.progress = 0;
    try {
      // compress/resize if large
      let blobToUpload: Blob = it.file as File;
      try {
        if ((it.file as File).size > MAX_FILE_MB * 1024 * 1024) {
          blobToUpload = await resizeImageFile(it.file as File, 1024, 0.75);
        }
      } catch (e) {
        console.warn('resize failed, uploading original', e);
        blobToUpload = it.file as File;
      }

      const url = await uploadWithProgress(blobToUpload, (pct) => { it.progress = pct; });
      it.status = 'done';
      it.url = url;
      it.resizedBlob = blobToUpload;
      it.progress = 100;
      uploaded.push(url);
    } catch (err: any) {
      console.error('Upload image failed', err);
      it.status = 'error';
      it.error = String(err?.message || err);
      it.progress = 0;
    }
  }
  imagesUploading.value = false;
  return uploaded;
}

function removeImageAt(idx: number) {
  const it = images.value[idx];
  if (it?.url && it.file) URL.revokeObjectURL(it.url);
  images.value.splice(idx, 1);
}

async function save() {
  error.value = null;
  lastErrorObj.value = null;

  if (budget.value == null || surfaceM2.value == null || !description.value || !selectedEntreprise.value || props.lat == null || props.lng == null || !selectedType.value) {
    error.value = 'Remplissez tout les champs obligatoires (y compris le type de signalement)';
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
    // upload images first (if any)
    let uploadedImages: string[] = [];
    if (images.value.length > 0) {
      const urls = await doUploadImages();
      // if any failed, abort
      const failed = images.value.some(i => i.status === 'error');
      if (failed) throw { code: 'image_upload_failed', message: 'Impossible d\'uploader certaines images' };
      uploadedImages = urls;
    }
    const playload = {
      budget: Number(budget.value),
      dateCreation: now,
      dateMiseAJour: now,
      description: description.value,
      postgres_id: '', // vide pour le moment
      idEntreprise: Number(selectedEntreprise.value),
      surfaceM2: Number(surfaceM2.value),
      version: 1,
      location: { lat: props.lat, lng: props.lng },
      images: uploadedImages,
      // idTypeSignalement enregistré comme objet contenant id, nom et icone
      idTypeSignalement: {
        id: selectedType.value!.id,
        nom: selectedType.value!.nom,
        icone: selectedType.value!.icone ?? null
      }
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

      <!-- nouvelle selection types -->
      <div class="pfm-row">
        <label>Type de signalement</label>
        <div class="type-list">
          <button
            v-for="t in types"
            :key="t.id"
            :class="['type-btn', { selected: selectedType && selectedType.id === t.id }]"
            @click.prevent="selectedType = t"
            type="button"
          >
            <span class="type-icone">
              <!-- Affichage dynamique de l'icône -->
              <template v-if="isUrl(t.icone)">
                <img :src="t.icone" alt="" style="width:24px; height:24px; object-fit:contain;" />
              </template>
              <template v-else-if="isEmoji(t.icone)">
                {{ t.icone }}
              </template>
              <template v-else>
                <IonIcon v-if="t.iconObj" :icon="t.iconObj" />
                <span v-else>{{ t.icone || '🔷' }}</span>
              </template>
            </span>
            <span class="type-nom">{{ t.nom }}</span>
          </button>
        </div>
      </div>

      <div class="pfm-row">
        <label>Description</label>
        <textarea v-model="description" rows="3"></textarea>
      </div>

      <!-- nouvelle section pour les images -->
      <div class="pfm-row">
        <label>Images (max {{ MAX_IMAGES }})</label>
        <div class="image-controls">
          <input id="fileInput" type="file" accept="image/*" capture="environment" multiple @change="handleFileInput" style="display:none;" />
          <button class="btn-select" @click.prevent="$el.querySelector('#fileInput')?.click()">Choisir / Prendre une photo</button>
          <small class="muted">Touchez une vignette pour supprimer</small>
        </div>

        <div class="image-preview" v-if="images.length > 0">
          <div class="image-item" v-for="(img, idx) in images" :key="idx">
            <button class="remove-btn" @click.prevent="removeImageAt(idx)">✕</button>
            <img v-if="img.url" :src="img.url" alt="preview" class="preview-img" />
            <div v-if="img.status === 'uploading'" class="progress-wrap">
              <div class="progress-bar" :style="{ width: img.progress + '%' }"></div>
              <div class="progress-text">{{ img.progress }}%</div>
            </div>
            <div v-if="img.status === 'error'" class="img-error">Erreur</div>
            <div v-if="img.status === 'done'" class="img-done">OK</div>
          </div>
        </div>
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

/* types list */
.type-list { display:flex; gap:8px; flex-wrap:wrap; }
.type-btn { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:8px; border:1px solid #ddd; background:#fff; cursor:pointer; }
.type-btn.selected { background:#2d8cff; color:#fff; border-color: #2d8cff; }
.type-icone { font-size:18px; }
.type-nom { font-size:13px; }

/* image preview */
.image-controls { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.btn-select { display:inline-block; padding:10px 12px; border-radius:8px; background:#2d8cff; color:#fff; border:none; font-weight:600; }
.image-preview { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
.image-item { position:relative; width:84px; height:84px; border-radius:8px; overflow:hidden; border:1px solid #ddd; background:#f9f9f9; display:flex; align-items:center; justify-content:center; }
.image-item img.preview-img { width:100%; height:100%; object-fit:cover; }
.remove-btn { position:absolute; top:4px; right:4px; background:rgba(0,0,0,0.6); color:#fff; border:none; border-radius:12px; width:24px; height:24px; display:flex; align-items:center; justify-content:center; }
.progress-wrap { position:absolute; bottom:0; left:0; right:0; height:18px; background:rgba(255,255,255,0.9); display:flex; align-items:center; }
.progress-bar { height:100%; background:#2d8cff; transition: width 0.2s ease; }
.progress-text { position:absolute; width:100%; text-align:center; font-size:12px; color:#000; }
.img-error { position:absolute; bottom:4px; left:4px; font-size:12px; color:#c00; }
.img-done { position:absolute; bottom:4px; left:4px; font-size:12px; color:#2ecc71; }
</style>



