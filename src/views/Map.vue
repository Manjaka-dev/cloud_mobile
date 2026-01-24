<script setup lang="ts">
import PointFormModal from "@/components/PointFormModal.vue";
import { onMounted, ref, nextTick } from 'vue';
import { IonPage } from '@ionic/vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getCurrentPosition } from '@/service/geoService';

const map = ref<L.Map | null>(null);
const marker = ref<L.Marker | null>(null);

const fixLeafletIcon = () => {
  const iconRetina = new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href;
  const iconUrl = new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href;
  const shadowUrl = new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: iconRetina,
    iconUrl,
    shadowUrl
  });
};

const showPointModal = ref(false);
const clickedPos = ref<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });


const handleMapClick = (e: L.LeafletMouseEvent) => {
  if (!map.value) return;
  const latlng = e.latlng;

  // Optionnel : placer / déplacer un marqueur visuel immédiat
  if (marker.value) {
    marker.value.setLatLng(latlng).bindPopup(`Position: ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`).openPopup();
  } else {
    marker.value = L.marker(latlng, { draggable: true }).addTo(map.value).bindPopup(`Position: ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`).openPopup();
    marker.value.on('dragend', (ev) => {
      const m = ev.target as L.Marker;
      const p = m.getLatLng();
      m.bindPopup(`Position: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`).openPopup();
    });
  }

  // ouvrir le formulaire modal en transmettant la position
  clickedPos.value = { lat: latlng.lat, lng: latlng.lng };
  showPointModal.value = true;
};

function onPointSaved(payload: any) {
  // payload contient id et les champs sauvegardés, dont payload.location
  console.log('Point sauvegardé', payload);

  if (payload?.location && map.value) {
    const loc = payload.location;
    // ajouter un marqueur final (ou mettre à jour celui existant)
    L.marker([loc.lat, loc.lng]).addTo(map.value).bindPopup(payload.description ?? 'Point').openPopup();
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

  marker.value = L.marker([lat, lng]).addTo(map.value).bindPopup('Position par défaut');

  m.on('click', handleMapClick);
};

onMounted(async () => {
  fixLeafletIcon();
  initMap(); // initialise avec Paris par défaut

  // attendre le rendu du DOM puis invalider la taille pour éviter décalage
  await nextTick();
  map.value?.invalidateSize();

  const pos = await getCurrentPosition();
  if (pos && map.value) {
    const latlng: L.LatLngExpression = [pos.lat, pos.lng];
    marker.value?.setLatLng(latlng).bindPopup('Vous êtes ici').openPopup();
    // centrer la carte sur la position (zoom 15)
    map.value.setView(latlng, 15, { animate: true });
  }
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
    marker.value = L.marker(latlng).addTo(map.value).bindPopup('Vous êtes ici').openPopup();
  }

  // Centrer strictement le marqueur au centre de la carte
  map.value.setView(latlng, 16, { animate: true });

  // Si le conteneur a changé de taille, forcer le recalcul pour éviter décalage
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
</style>