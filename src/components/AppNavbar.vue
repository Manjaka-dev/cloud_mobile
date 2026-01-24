<script setup lang="ts">
import { IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/vue';
import { home, map, statsChart, logOut } from 'ionicons/icons';
import { signOut } from '@/service/authService';
import { useRouter } from 'vue-router';

const router = useRouter();

const handleLogout = async () => {
  try {
    await signOut();
    router.push('/login');
  } catch (error) {
    console.error('Erreur lors de la déconnexion:', error);
  }
};
</script>

<template>
  <ion-tab-bar slot="bottom" class="custom-tab-bar">
    <ion-tab-button tab="home" href="/home" class="tab-button">
      <ion-icon :icon="home" />
      <ion-label>Accueil</ion-label>
    </ion-tab-button>

    <ion-tab-button tab="map" href="/map" class="tab-button">
      <ion-icon :icon="map" />
      <ion-label>Carte</ion-label>
    </ion-tab-button>

    <ion-tab-button tab="stats" href="/statistiques" class="tab-button">
      <ion-icon :icon="statsChart" />
      <ion-label>Stats</ion-label>
    </ion-tab-button>

    <ion-tab-button @click="handleLogout" class="tab-button logout-btn">
      <ion-icon :icon="logOut" />
      <ion-label>Sortir</ion-label>
    </ion-tab-button>
  </ion-tab-bar>
</template>

<style scoped>
.custom-tab-bar {
  --background: #ffffff;
  --border-top: 1px solid #e0e0e0;
  height: 65px;
}

.tab-button {
  --color: #666666;
  --color-selected: #3880ff;
  flex-direction: column;
  padding: 8px 4px 4px 4px;
}

.tab-button ion-icon {
  font-size: 22px;
  margin-bottom: 2px;
}

.tab-button ion-label {
  font-size: 11px;
  font-weight: 500;
  margin-top: 0;
}

.logout-btn {
  --color: #ff4444;
  --color-selected: #ff4444;
}

.logout-btn:hover {
  --background: rgba(255, 68, 68, 0.1);
}
</style>