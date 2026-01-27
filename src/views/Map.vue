<script setup lang="ts">
import PointFormModal from '@/components/PointFormModal.vue';
import { onMounted, onUnmounted, ref, nextTick } from 'vue';
import { IonPage } from '@ionic/vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getCurrentPosition } from '@/service/geoService';
import { listenCollection, getDocument } from '@/service/fireStoreService';

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

// typescript
function createMarkerIcon(iconSpec?: string) {
  if (!iconSpec) return undefined;
  try {
    const trimmed = String(iconSpec).trim();
    // URL (image)
    if (/^https?:\/\//.test(trimmed) || /^\//.test(trimmed)) {
      return L.divIcon({
        html: `<img src="${escapeHtml(trimmed)}" alt="icone" style="width:28px;height:28px;display:block;border-radius:16px;box-shadow:0 1px 4px rgba(0,0,0,0.25);" />`,
        className: 'custom-marker-icon',
        iconSize: [28, 28],
        iconAnchor: [14, 28]
      });
    }

    // emoji court
    if (/[^0-9A-Za-z_\-\s]/.test(trimmed) && trimmed.length <= 4) {
      const safe = escapeHtml(trimmed);
      return L.divIcon({
        html: `<div class="emoji-marker">${safe}</div>`,
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
      html: `<div class="ionicon-marker"><img src="${svgUrl}" alt="${alt}" class="ionicon-marker-img" /></div>`,
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
    marker.value.setLatLng(latlng).bindPopup(`Position: ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`).openPopup();
  } else {
      const newM = L.marker(latlng, { draggable: true });
      (map.value! as any).addLayer(newM);
      newM.bindPopup(`Position: ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`).openPopup();
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
    const icon = createMarkerIcon(payload?.idTypeSignalement?.icone);
    const markerOpts: L.MarkerOptions | undefined = icon ? { icon } : undefined;
    const newMarker = markerOpts ? L.marker([loc.lat, loc.lng], markerOpts) : L.marker([loc.lat, loc.lng]);
    (map.value! as any).addLayer(newMarker);
    newMarker.bindPopup(payload.description ?? 'Point').openPopup();
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
  marker.value.bindPopup('Position par défaut');

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

    const incomingIds = new Set<string>();

    for (const it of items as Array<any & { id: string }>) {
      const id = it.id;
      incomingIds.add(id);

      const loc = it.location;
      if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') continue;

      const title = it.title ?? it.type ?? 'Signalement';
      const dateStr = formatDate(it.dateMiseAJour ?? it.updatedAt ?? it.updatedAt);
      const desc = it.description ?? '';
      const surface = it.surfaceM2 != null ? String(it.surfaceM2) : '';
      const idEntreprise = it.idEntreprise ?? it.entrepriseId ?? null;

      // contenu initial (sécurisé)
      const popupContentBase = `<div>
      <strong>${escapeHtml(title)}</strong><br/>
      <small>${escapeHtml(dateStr)}</small><br/>
      <div>${escapeHtml(desc)}</div>
      ${surface ? `<div>Surface : ${escapeHtml(surface)} m²</div>` : ''}
      <div id="enterprise-${escapeHtml(id)}">Entreprise : ${escapeHtml(String(idEntreprise ?? '…'))}</div>
    </div>`;

      const existing = remoteMarkers.value.get(id);
      if (existing) {
        try {
          existing.setLatLng([loc.lat, loc.lng]);
          try { existing.setPopupContent(popupContentBase); } catch (err) { console.warn('setPopupContent failed', err); }
        } catch (err) { console.warn('update marker failed', err); }
      } else {
        const icon = createMarkerIcon(it?.idTypeSignalement?.icone ?? it?.typeIcon ?? null);
        const markerOpts: L.MarkerOptions | undefined = icon ? { icon } : undefined;
        const m = markerOpts ? L.marker([loc.lat, loc.lng], markerOpts) : L.marker([loc.lat, loc.lng]);
        m.bindPopup(popupContentBase);
        m.on('click', () => m.openPopup());
        (map.value! as any).addLayer(m as any);
        remoteMarkers.value.set(id, m);
      }

      // récupération asynchrone de l'entreprise pour compléter le popup
      if (idEntreprise) {
        // fetch without blocking the loop
        getDocument('entreprises', String(idEntreprise)).then((ent) => {
          const entLabel = ent ? (ent.nom ?? ent.name ?? ent.id ?? String(idEntreprise)) : String(idEntreprise);
          const updated = remoteMarkers.value.get(id);
          if (!updated) return;
          const updatedContent = `<div>
          <strong>${escapeHtml(title)}</strong><br/>
          <small>${escapeHtml(dateStr)}</small><br/>
          <div>${escapeHtml(desc)}</div>
          ${surface ? `<div>Surface : ${escapeHtml(surface)} m²</div>` : ''}
          <div>Entreprise : ${escapeHtml(entLabel)}</div>
        </div>`;
          try { updated.setPopupContent(updatedContent); } catch (err) { console.warn('setPopupContent updated failed', err); }
        }).catch((err) => {
          console.warn('Erreur récupération entreprise', err);
        });
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
    marker.value?.setLatLng(latlng).bindPopup('Vous êtes ici').openPopup();
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
    marker.value.setLatLng(latlng).bindPopup('Vous êtes ici').openPopup();
  } else {
    const m2 = L.marker(latlng);
    map.value!.addLayer(m2);
    m2.bindPopup('Vous êtes ici').openPopup();
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

</style>
