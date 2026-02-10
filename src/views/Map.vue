<script setup lang="ts">
import PointFormModal from '@/components/PointFormModal.vue';
import { onMounted, onUnmounted, ref, nextTick } from 'vue';
import { IonPage } from '@ionic/vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getCurrentPosition } from '@/service/geoService';
import { listenCollection, getDocument } from '@/service/fireStoreService';
import { getOptimizedUrl } from '@/service/StorageService';

const map = ref<L.Map | null>(null);
const marker = ref<L.Marker | null>(null);

const fixLeafletIcon = () => {
  const iconRetina = new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href;
  const iconUrl = new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href;
  const shadowUrl = new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: iconRetina,
    iconUrl,
    shadowUrl
  });
};

function escapeHtml(input: string): string {
  if (input == null) return '';
  return String(input)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
}

function formatDate(value: any): string {
  if (!value) return '';

  if (typeof value === 'object' && typeof (value as any).toDate === 'function') {
    return (value as any).toDate().toLocaleString();
  }

  if (typeof value === 'number') {
    return new Date(value).toLocaleString();
  }

  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toLocaleString();
  } catch (err) { console.warn('formatDate parse failed', err); }

  return String(value);
}

const showPointModal = ref(false);
const clickedPos = ref<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });

const remoteMarkers = ref<Map<string, L.Marker>>(new Map());
let unsubscribeSignals: (() => void) | null = null;

// modal details
const showDetails = ref(false);
const selectedSignalement = ref<any>(null);
const selectedEntrepriseName = ref<string | null>(null);
const selectedSignalementTypeName = ref<string | null>(null);
const selectedSignalementTypeIcon = ref<string | null>(null);

async function openDetails(it: any) {
  // fetch fresh signalement doc if possible (to ensure we have all fields)
  let full = it;
  if (it?.id) {
    try {
      const fresh = await getDocument('signalements', String(it.id));
      if (fresh) full = { ...it, ...fresh, id: it.id };
    } catch (e) {
      console.warn('Erreur récupération signalement', e);
    }
  }

  selectedSignalement.value = full;
  selectedEntrepriseName.value = '...';
  selectedSignalementTypeName.value = null;
  selectedSignalementTypeIcon.value = null;

  // entreprise
  const idEntreprise = full?.idEntreprise ?? full?.entrepriseId ?? null;
  if (idEntreprise) {
    try {
      const ent = await getDocument('entreprises', String(idEntreprise));
      selectedEntrepriseName.value = ent ? (ent.nom ?? ent.name ?? String(idEntreprise)) : String(idEntreprise);
    } catch (e) {
      console.warn('Erreur récupération entreprise pour modal', e);
      selectedEntrepriseName.value = String(idEntreprise);
    }
  } else {
    selectedEntrepriseName.value = null;
  }

  // type de signalement
  // idTypeSignalement peut être soit un id (string/number) soit un objet {id, nom, icone}
  const rawType = full?.idTypeSignalement ?? full?.idType ?? null;
  if (rawType) {
    // si c'est un objet déjà stocké (cas du formulaire actuel), utiliser directement
    if (typeof rawType === 'object' && rawType !== null) {
      selectedSignalementTypeName.value = rawType.nom ?? rawType.name ?? rawType.id ?? null;
      selectedSignalementTypeIcon.value = rawType.icone ?? rawType.icon ?? null;
    } else {
      // sinon rawType est un identifiant -> récupérer le document correspondant
      try {
        const t = await getDocument('typeSignalement', String(rawType));
        if (t) {
          selectedSignalementTypeName.value = t.nom ?? t.name ?? null;
          selectedSignalementTypeIcon.value = t.icone ?? t.icon ?? null;
        }
      } catch (e) {
        console.warn('Erreur récupération typeSignalement', e);
      }
    }
  }

  // fermer tout popup Leaflet éventuel
  try { map.value?.closePopup(); } catch (e) { /* ignore */ }
  showDetails.value = true;
}

function closeDetails() {
  showDetails.value = false;
  selectedSignalement.value = null;
  selectedEntrepriseName.value = null;
  selectedSignalementTypeName.value = null;
  selectedSignalementTypeIcon.value = null;
}

function statusColor(status: number | null | undefined) {
  if (status == null || status === 1) return '#e74c3c'; // rouge
  if (status === 2) return '#f39c12'; // orange
  if (status === 3) return '#2ecc71'; // vert
  return '#888';
}
function statusLabel(status: number | null | undefined) {
  if (status == null || status === 1) return 'Nouveau';
  if (status === 2) return 'En cours';
  if (status === 3) return 'Terminé';
  return 'Inconnu';
}

// typescript
function createMarkerIcon(iconSpec?: string, status?: number) {
  if (!iconSpec) return undefined;
  try {
    const trimmed = String(iconSpec).trim();

    // déterminer la couleur selon le statut
    let bg = '#3880ff'; // défaut bleu
    if (status == null || status === 1) bg = '#e74c3c'; // nouveau -> rouge
    else if (status === 2) bg = '#f39c12'; // en cours -> orange
    else if (status === 3) bg = '#2ecc71'; // terminé -> vert

    // URL (image)
    if (/^https?:\/\//.test(trimmed) || /^\//.test(trimmed)) {
      return L.divIcon({
        html: `<div style="width:34px;height:34px;border-radius:20px;background:${escapeHtml(bg)};display:flex;align-items:center;justify-content:center;padding:3px;box-shadow:0 1px 4px rgba(0,0,0,0.25);"><img src="${escapeHtml(trimmed)}" alt="icone" style="width:24px;height:24px;border-radius:12px;display:block;object-fit:contain;"/></div>`,
        className: 'custom-marker-icon',
        iconSize: [34, 34],
        iconAnchor: [17, 34]
      });
    }

    // emoji court
    if (/[^0-9A-Za-z_\-\s]/.test(trimmed) && trimmed.length <= 4) {
      const safe = escapeHtml(trimmed);
      return L.divIcon({
        html: `<div class="emoji-marker" style="background:${escapeHtml(bg)}">${safe}</div>`,
        className: 'custom-marker-emoji',
        iconSize: [30, 30],
        iconAnchor: [15, 30]
      });
    }

    // nom d'IonIcon -> on utilise le SVG depuis unpkg pour éviter les problèmes de web-component non hydraté
    const safeName = encodeURIComponent(trimmed);
    const svgUrl = `https://unpkg.com/ionicons@5.5.2/dist/svg/${safeName}.svg`;
    const alt = escapeHtml(trimmed);
    return L.divIcon({
      html: `<div class="ionicon-marker" style="background:${escapeHtml(bg)};width:34px;height:34px;border-radius:18px;display:flex;align-items:center;justify-content:center;padding:6px;box-shadow:0 1px 4px rgba(0,0,0,0.25);"><img src="${svgUrl}" alt="${alt}" class="ionicon-marker-img" /></div>`,
      className: 'custom-marker-ionicon',
      iconSize: [34, 34],
      iconAnchor: [17, 34]
    });
  } catch (e) {
    console.warn('createMarkerIcon failed', e, iconSpec);
    return undefined;
  }
}

const handleMapClick = (e: L.LeafletMouseEvent) => {
  if (!map.value) return;
  const latlng = e.latlng;

  if (marker.value) {
    // Met à jour la position sans attacher le popup Leaflet historique
    marker.value.setLatLng(latlng);
    try { if ((marker.value as any).unbindPopup) (marker.value as any).unbindPopup(); } catch (e) { /* ignore */ }
    try { if ((marker.value as any).off) (marker.value as any).off('click'); } catch (e) { /* ignore */ }
  } else {
      const newM = L.marker(latlng, { draggable: true });
      (map.value! as any).addLayer(newM);
      // Ne pas binder le popup Leaflet — on utilisera le modal personnalisé
      try { if ((newM as any).unbindPopup) (newM as any).unbindPopup(); } catch (e) { /* ignore */ }
      try { if ((newM as any).off) (newM as any).off('click'); } catch (e) { /* ignore */ }
      marker.value = newM;
      marker.value.on('dragend', (ev) => {
        const m = ev.target as L.Marker;
        const p = m.getLatLng();
        m.bindPopup(`Position: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`).openPopup();
      });
    }

  clickedPos.value = { lat: latlng.lat, lng: latlng.lng };
  showPointModal.value = true;
};

function onPointSaved(payload: any) {
  console.log('Point sauvegardé', payload);

  if (payload?.location && map.value) {
    const loc = payload.location;
    const icon = createMarkerIcon(payload?.idTypeSignalement?.icone, payload?.status ?? null);
    const markerOpts: L.MarkerOptions | undefined = icon ? { icon } : undefined;
    const newMarker = markerOpts ? L.marker([loc.lat, loc.lng], markerOpts) : L.marker([loc.lat, loc.lng]);
    (map.value! as any).addLayer(newMarker);
    // ouvre le modal détaillé au clic sur le marqueur
    try { newMarker.on('click', () => openDetails(payload)); } catch (e) { console.warn('marker click bind failed', e); }
    map.value.setView([loc.lat, loc.lng], 15, { animate: true });
  }
  showPointModal.value = false;
}

const initMap = (lat = 48.8566, lng = 2.3522, zoom = 13) => {
  if (map.value) return;

  const m = L.map('map').setView([lat, lng], zoom);
  map.value = m;

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(m);

  marker.value = L.marker([lat, lng]);
  (m as any).addLayer(marker.value as any);
  // Ne pas créer le popup historique
  try { if ((marker.value as any).unbindPopup) (marker.value as any).unbindPopup(); } catch (e) { /* ignore */ }
  try { if ((marker.value as any).off) (marker.value as any).off('click'); } catch (e) { /* ignore */ }

  m.on('click', handleMapClick);
};

function startSignalmentListener() {
  if (!map.value) return;

  if (unsubscribeSignals) {
    try { unsubscribeSignals(); } catch (e) { console.warn('unsubscribe failed', e); }
    unsubscribeSignals = null;
  }

  unsubscribeSignals = listenCollection('signalements', (items) => {
    if (!map.value) return;

    // fermer tout popup restant lors d'une mise à jour de la collection
    try { map.value.closePopup(); } catch (e) { /* ignore */ }

    const incomingIds = new Set<string>();

    for (const it of items as Array<any & { id: string }>) {
      const id = it.id;
      incomingIds.add(id);

      const loc = it.location;
      if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') continue;

      const idEntreprise = it.idEntreprise ?? it.entrepriseId ?? null;

      // contenu initial (sécurisé)
      // images : nous affichons les images dans le modal détaillé; pas besoin d'assembler un html ici

      const existing = remoteMarkers.value.get(id);
      const icon = createMarkerIcon(it?.idTypeSignalement?.icone ?? it?.typeIcon ?? null, it?.status ?? null);

      if (existing) {
        try {
          existing.setLatLng([loc.lat, loc.lng]);
          // mettre à jour l'icône si le statut ou le type a changé
          try {
            if (icon) existing.setIcon(icon);
          } catch (err) { console.warn('setIcon failed', err); }
          // s'assurer qu'aucun ancien popup Leaflet n'est attaché
          try { if ((existing as any).unbindPopup) (existing as any).unbindPopup(); } catch (e) { /* ignore */ }
          // detach any previous click handlers and attach ours only
          try { if ((existing as any).off) (existing as any).off('click'); } catch (e) { /* ignore */ }
          try { existing.on('click', () => openDetails(it)); } catch (e) { console.warn('rebind click failed', e); }
          // on ne met plus de popup Leaflet ici pour éviter l'ouverture du petit popup
          // contenu popup géré par le modal détaillé (openDetails)
        } catch (err) { console.warn('update marker failed', err); }
      } else {
        const markerOpts: L.MarkerOptions | undefined = icon ? { icon } : undefined;
        const m = markerOpts ? L.marker([loc.lat, loc.lng], markerOpts) : L.marker([loc.lat, loc.lng]);
        // s'assurer qu'aucun popup n'est attaché et binder seulement notre handler
        try { if ((m as any).unbindPopup) (m as any).unbindPopup(); } catch (e) { /* ignore */ }
        try { m.off && m.off('click'); } catch (e) { /* ignore */ }
        try { m.on('click', () => openDetails(it)); } catch (e) { console.warn('marker click bind failed', e); }
        (map.value! as any).addLayer(m as any);
        remoteMarkers.value.set(id, m);
      }

      // récupération asynchrone de l'entreprise pour compléter le popup
      if (idEntreprise) {
        // Optionnel : on peut préfetcher l'entreprise si nécessaire, mais éviter d'assigner
        // une variable non utilisée pour satisfaire ESLint. Pour l'instant on ignore le résultat.
        getDocument('entreprises', String(idEntreprise)).catch((err) => { console.warn('Erreur récupération entreprise', err); });
      }
    }

    // suppression des marqueurs absents
    for (const [id, m] of Array.from(remoteMarkers.value.entries())) {
      if (!incomingIds.has(id)) {
        try { (map.value as any)?.removeLayer(m as any); } catch (err) { console.warn('removeLayer failed', err); }
        remoteMarkers.value.delete(id);
      }
    }
  });
}

onMounted(async () => {
  fixLeafletIcon();
  initMap();

  await nextTick();
  map.value?.invalidateSize();

  const pos = await getCurrentPosition();
  if (pos && map.value) {
    const latlng: L.LatLngExpression = [pos.lat, pos.lng];
    // Met à jour la position sans ouvrir de popup Leaflet
    marker.value?.setLatLng(latlng);
    try { if ((marker.value as any).unbindPopup) (marker.value as any).unbindPopup(); } catch (e) { /* ignore */ }
    try { if ((marker.value as any).off) (marker.value as any).off('click'); } catch (e) { /* ignore */ }
    map.value.setView(latlng, 15, { animate: true });
  }

  startSignalmentListener();
});

onUnmounted(() => {
  if (unsubscribeSignals) {
    try { unsubscribeSignals(); } catch (err) { console.warn('unsubscribe failed', err); }
    unsubscribeSignals = null;
  }
  for (const m of remoteMarkers.value.values()) {
    try { (map.value as any)?.removeLayer(m as any); } catch (e) { console.warn('removeLayer failed during unmount', e); }
  }
  remoteMarkers.value.clear();
});

const locateMe = async () => {
  const pos = await getCurrentPosition();
  if (!pos || !map.value) {
    console.warn('Position introuvable');
    return;
  }

  const latlng: L.LatLngExpression = [pos.lat, pos.lng];

  if (marker.value) {
    marker.value.setLatLng(latlng);
    try { if ((marker.value as any).unbindPopup) (marker.value as any).unbindPopup(); } catch (e) { /* ignore */ }
    try { if ((marker.value as any).off) (marker.value as any).off('click'); } catch (e) { /* ignore */ }
  } else {
    const m2 = L.marker(latlng);
    map.value!.addLayer(m2);
    // Ne pas binder le popup Leaflet — on utilisera le modal personnalisé
    try { if ((m2 as any).unbindPopup) (m2 as any).unbindPopup(); } catch (e) { /* ignore */ }
    try { if ((m2 as any).off) (m2 as any).off('click'); } catch (e) { /* ignore */ }
    marker.value = m2;
  }

  map.value.setView(latlng, 16, { animate: true });

  setTimeout(() => map.value?.invalidateSize(), 300);
};
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Carte</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div id="map" class="map-container"></div>
      <ion-button expand="block" @click="locateMe">Me localiser</ion-button>
    </ion-content>
  </ion-page>
  <PointFormModal
      :is-open="showPointModal"
      :lat="clickedPos.lat"
      :lng="clickedPos.lng"
      @close="showPointModal = false"
      @saved="onPointSaved"
  />

  <!-- Détails modal pour un signalement -->
  <div v-if="showDetails" class="details-overlay" @click.self="closeDetails">
    <div class="details-modal">
      <div class="details-header">
        <h3>{{ selectedSignalement?.title ?? selectedSignalement?.type ?? 'Signalement' }}</h3>
        <button class="close-btn" @click="closeDetails">✕</button>
      </div>
      <div class="details-body">
        <div class="meta-row"><strong>Date mise à jour :</strong> {{ formatDate(selectedSignalement?.dateMiseAJour) }}</div>
        <div class="meta-row"><strong>Date création :</strong> {{ formatDate(selectedSignalement?.dateCreation) }}</div>
        <div class="meta-row"><strong>ID document :</strong> {{ selectedSignalement?.id ?? '—' }}</div>
        <div class="meta-row"><strong>Entreprise :</strong> {{ selectedEntrepriseName ?? '—' }}</div>
        <div class="meta-row"><strong>ID Entreprise :</strong> {{ selectedSignalement?.idEntreprise ?? (selectedSignalement?.entrepriseId ?? '—') }}</div>
        <div class="meta-row"><strong>Type de signalement :</strong>
          <span v-if="selectedSignalementTypeIcon" style="margin-left:8px; vertical-align:middle;">
            <img v-if="selectedSignalementTypeIcon && (selectedSignalementTypeIcon.startsWith && selectedSignalementTypeIcon.startsWith('http'))" :src="selectedSignalementTypeIcon" alt="icone" style="width:20px;height:20px;object-fit:contain;margin-right:6px;" />
            <img v-else-if="selectedSignalementTypeIcon && !selectedSignalementTypeIcon.startsWith('http')" :src="`https://unpkg.com/ionicons@5.5.2/dist/svg/${encodeURIComponent(selectedSignalementTypeIcon)}.svg`" alt="icone" style="width:20px;height:20px;object-fit:contain;margin-right:6px;" />
          </span>
          {{ selectedSignalementTypeName ?? '—' }}
        </div>
        <div class="meta-row"><strong>ID Type (raw):</strong> {{ (selectedSignalement?.idTypeSignalement && typeof selectedSignalement.idTypeSignalement === 'object') ? (selectedSignalement.idTypeSignalement.id ?? '—') : (selectedSignalement?.idTypeSignalement ?? selectedSignalement?.idType ?? '—') }}</div>
        <div class="meta-row"><strong>Budget :</strong> {{ selectedSignalement?.budget != null ? selectedSignalement.budget + ' €' : '—' }}</div>
        <div class="meta-row"><strong>Surface :</strong> {{ selectedSignalement?.surfaceM2 ?? '—' }} m²</div>
        <div class="meta-row"><strong>Niveau :</strong> {{ selectedSignalement?.niveau ?? '—' }}</div>
        <div class="meta-row"><strong>Version :</strong> {{ selectedSignalement?.version ?? '—' }}</div>
        <div class="meta-row"><strong>postgres_id :</strong> {{ selectedSignalement?.postgres_id ?? '—' }}</div>
        <div class="meta-row"><strong>Coordonnées :</strong> {{ selectedSignalement?.location ? (selectedSignalement.location.lat + ', ' + selectedSignalement.location.lng) : '—' }}</div>
        <div class="meta-row" v-if="selectedSignalement?.status != null">
          <strong>Statut :</strong>
          <span class="status-badge" :style="{ background: statusColor(selectedSignalement.status) }">{{ statusLabel(selectedSignalement.status) }}</span>
        </div>
        <div class="desc"><strong>Description :</strong><div class="desc-text">{{ selectedSignalement?.description ?? '—' }}</div></div>

        <div v-if="Array.isArray(selectedSignalement?.images) && selectedSignalement.images.length" class="images-grid">
          <a v-for="(u, idx) in selectedSignalement.images" :key="idx" :href="(typeof u === 'string' ? u : (u.url || u.optimized_url))" target="_blank" rel="noopener noreferrer">
            <img :src="getOptimizedUrl(typeof u === 'string' ? u : (u.url || u.optimized_url || u.thumb_url || ''), { width: 400, height: 300, crop: 'fill' })" :alt="'image-'+idx" class="detail-thumb" />
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-container {
  width: 100%;
  height: 60vh;
  border-radius: 8px;
}

/* icones personnalisées */
.custom-marker-emoji .emoji-marker {
  display:flex; align-items:center; justify-content:center; width:32px; height:32px; background:rgba(255,255,255,0.9); border-radius:16px; box-shadow:0 1px 4px rgba(0,0,0,0.25); font-size:18px;
}
.custom-marker-icon img { border-radius:16px; box-shadow:0 1px 4px rgba(0,0,0,0.25); }

/* css */
.custom-marker-ionicon .ionicon-marker-img {
  width:22px;
  height:22px;
  display:block;
  border-radius:50%;
  padding:6px;
  background:#3880ff;
  box-shadow:0 1px 4px rgba(0,0,0,0.25);
  filter:invert(1); /* si icônes SVG noires, on les inverse pour blanc */
  object-fit:contain;
}

.details-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20000;
}
.details-modal {
  width: 92%;
  max-width: 720px;
  max-height: 85vh;
  overflow: auto;
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.35);
}
.details-header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.close-btn { background:transparent; border:none; font-size:20px; cursor:pointer; }
.details-body { margin-top:12px; display:flex; flex-direction:column; gap:8px; }
.meta-row { font-size:14px; color:#333; }
.desc-text { margin-top:6px; white-space:pre-wrap; }
.images-grid { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
.detail-thumb { width:160px; height:120px; object-fit:cover; border-radius:8px; border:1px solid #eee; }

.status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 14px;
  color: #fff;
  margin-top: 4px;
}
</style>
