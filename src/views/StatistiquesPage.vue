<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getCollection } from '@/service/fireStoreService';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonCard,
  IonCardContent,
  IonGrid,
  IonRow,
  IonCol,
  IonButton,
  IonSpinner,
  IonIcon,
  IonProgressBar
} from '@ionic/vue';
import { statsChart, business, resize, refresh } from 'ionicons/icons';

type Signalement = {
  surfaceM2?: number | string;
  idEntreprise?: number | string;
  dateMiseAJour?: string;
  description?: string;
};

const items = ref<Signalement[]>([]);
const loading = ref(false);

const loadStats = async () => {
  loading.value = true;
  try {
    const res = await getCollection<Signalement>('signalements');
    items.value = res ?? [];
  } finally {
    loading.value = false;
  }
};

const count = computed(() => items.value.length);
const totalSurface = computed(() =>
    items.value.reduce((acc, s) => acc + (Number(s.surfaceM2) || 0), 0)
);
const averageSurface = computed(() =>
    count.value ? Math.round((totalSurface.value / count.value) * 100) / 100 : 0
);
const companies = computed(() => {
  const set = new Set(items.value.map(s => String(s.idEntreprise)).filter(Boolean));
  return set.size;
});

// Statistiques par mois (exemple)
const recentSignalements = computed(() => {
  const now = new Date();
  const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

  return items.value.filter(item => {
    if (item.dateMiseAJour) {
      const itemDate = new Date(item.dateMiseAJour);
      return itemDate >= oneMonthAgo;
    }
    return false;
  }).length;
});

onMounted(loadStats);
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>
          <ion-icon :icon="statsChart" style="margin-right: 8px;" />
          Statistiques
        </ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="stats-content">
      <ion-progress-bar v-if="loading" type="indeterminate" />

      <!-- En-tête avec résumé -->
      <div class="stats-header">
        <h2>Aperçu général</h2>
        <p>Données des signalements routiers</p>
      </div>

      <ion-grid class="stats-grid">
        <!-- Ligne principale -->
        <ion-row>
          <ion-col size="12" size-sm="6">
            <ion-card class="stat-card primary-card">
              <ion-card-content>
                <div class="card-header">
                  <ion-icon :icon="statsChart" class="card-icon primary-icon" />
                  <div class="stat-value primary-value">{{ count }}</div>
                </div>
                <div class="stat-label">Total signalements</div>
                <div class="stat-sublabel">+{{ recentSignalements }} ce mois</div>
              </ion-card-content>
            </ion-card>
          </ion-col>

          <ion-col size="12" size-sm="6">
            <ion-card class="stat-card success-card">
              <ion-card-content>
                <div class="card-header">
                  <ion-icon :icon="resize" class="card-icon success-icon" />
                  <div class="stat-value success-value">{{ totalSurface.toLocaleString() }}</div>
                </div>
                <div class="stat-label">Surface totale (m²)</div>
                <div class="stat-sublabel">{{ averageSurface }} m² en moyenne</div>
              </ion-card-content>
            </ion-card>
          </ion-col>
        </ion-row>

        <!-- Ligne secondaire -->
        <ion-row>
          <ion-col size="12" size-sm="6">
            <ion-card class="stat-card warning-card">
              <ion-card-content>
                <div class="card-header">
                  <ion-icon :icon="business" class="card-icon warning-icon" />
                  <div class="stat-value warning-value">{{ companies }}</div>
                </div>
                <div class="stat-label">Entreprises impliquées</div>
                <div class="stat-sublabel">Différentes organisations</div>
              </ion-card-content>
            </ion-card>
          </ion-col>

          <ion-col size="12" size-sm="6">
            <ion-card class="stat-card info-card">
              <ion-card-content>
                <div class="card-header">
                  <ion-icon :icon="statsChart" class="card-icon info-icon" />
                  <div class="stat-value info-value">{{ averageSurface }}</div>
                </div>
                <div class="stat-label">Surface moyenne (m²)</div>
                <div class="stat-sublabel">Par signalement</div>
              </ion-card-content>
            </ion-card>
          </ion-col>
        </ion-row>

        <!-- Ligne d'action -->
        <ion-row>
          <ion-col size="12">
            <ion-button
              expand="block"
              @click="loadStats"
              :disabled="loading"
              class="refresh-button"
              fill="outline"
            >
              <ion-icon :icon="refresh" slot="start" />
              <span v-if="!loading">Actualiser les données</span>
              <ion-spinner v-else name="crescent" />
            </ion-button>
          </ion-col>
        </ion-row>
      </ion-grid>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.stats-content {
  --background: #f8f9fa;
}

.stats-header {
  padding: 24px 20px 16px 20px;
  text-align: center;
  background: white;
  margin-bottom: 20px;
}

.stats-header h2 {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 4px 0;
  color: #2c3e50;
}

.stats-header p {
  font-size: 14px;
  color: #7d8c9a;
  margin: 0;
}

.stats-grid {
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 10px;
}

.stat-card {
  margin-bottom: 16px;
  border-radius: 16px;
  --box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  border: none;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.card-icon {
  font-size: 28px;
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  line-height: 1;
}

.stat-label {
  font-size: 15px;
  font-weight: 500;
  color: #2c3e50;
  margin-bottom: 4px;
}

.stat-sublabel {
  font-size: 12px;
  opacity: 0.7;
}

/* Couleurs des cartes */
.primary-card {
  --background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.primary-icon, .primary-value {
  color: rgba(255, 255, 255, 0.9);
}

.success-card {
  --background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
  color: white;
}

.success-icon, .success-value {
  color: rgba(255, 255, 255, 0.9);
}

.warning-card {
  --background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
}

.warning-icon, .warning-value {
  color: rgba(255, 255, 255, 0.9);
}

.info-card {
  --background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  color: white;
}

.info-icon, .info-value {
  color: rgba(255, 255, 255, 0.9);
}

.refresh-button {
  margin-top: 20px;
  --border-radius: 12px;
  --padding-top: 16px;
  --padding-bottom: 16px;
}
</style>
