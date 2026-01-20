<script setup lang="ts">
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

const initMap = (lat = 48.8566, lng = 2.3522, zoom = 13) => {
  if (map.value) return;
  map.value = L.map('map').setView([lat, lng], zoom);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map.value);

  marker.value = L.marker([lat, lng]).addTo(map.value).bindPopup('Position par défaut');
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
</template>

<style scoped>
.map-container {
  width: 100%;
  height: 60vh;
  border-radius: 8px;
}
</style>