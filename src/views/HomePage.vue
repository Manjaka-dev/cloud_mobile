<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar color="primary">
        <ion-title>SignalRoute</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear">
            <ion-icon :icon="notifications" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="main-content">
      <!-- Section Hero -->
      <div class="hero-section">
        <div class="hero-content">
          <ion-icon :icon="car" class="hero-icon" />
          <h1>Signaler un problème</h1>
          <p>Contribuez à améliorer la sécurité routière en signalant les problèmes que vous rencontrez</p>
        </div>
      </div>

      <!-- Actions rapides -->
      <div class="quick-actions">
        <h2>Actions rapides</h2>
        <ion-grid>
          <ion-row>
            <ion-col size="6">
              <ion-card button @click="goToMap" class="action-card">
                <ion-card-content>
                  <ion-icon :icon="map" class="action-icon" />
                  <h3>Nouvelle signalement</h3>
                  <p>Signaler un problème sur la carte</p>
                </ion-card-content>
              </ion-card>
            </ion-col>
            <ion-col size="6">
              <ion-card button @click="goToStats" class="action-card">
                <ion-card-content>
                  <ion-icon :icon="statsChart" class="action-icon" />
                  <h3>Statistiques</h3>
                  <p>Voir les données de signalement</p>
                </ion-card-content>
              </ion-card>
            </ion-col>
          </ion-row>
        </ion-grid>
      </div>

      <!-- Statistiques rapides -->
      <div class="stats-preview">
        <h2>Aperçu des données</h2>
        <ion-grid>
          <ion-row>
            <ion-col size="4">
              <div class="stat-item">
                <div class="stat-number">{{ totalSignalements }}</div>
                <div class="stat-label">Signalements</div>
              </div>
            </ion-col>
            <ion-col size="4">
              <div class="stat-item">
                <div class="stat-number">{{ totalSurface }}</div>
                <div class="stat-label">m² affectés</div>
              </div>
            </ion-col>
            <ion-col size="4">
              <div class="stat-item">
                <div class="stat-number">{{ totalEntreprises }}</div>
                <div class="stat-label">Entreprises</div>
              </div>
            </ion-col>
          </ion-row>
        </ion-grid>
      </div>

      <!-- Types de problèmes fréquents -->
      <div class="problem-types">
        <h2>Types de problèmes fréquents</h2>
        <div class="problem-list">
          <ion-chip color="danger" class="problem-chip">
            <ion-icon :icon="warning" />
            <ion-label>Nids de poule</ion-label>
          </ion-chip>
          <ion-chip color="warning" class="problem-chip">
            <ion-icon :icon="construct" />
            <ion-label>Travaux</ion-label>
          </ion-chip>
          <ion-chip color="medium" class="problem-chip">
            <ion-icon :icon="car" />
            <ion-label>Obstacle</ion-label>
          </ion-chip>
          <ion-chip color="success" class="problem-chip">
            <ion-icon :icon="checkmark" />
            <ion-label>Réparé</ion-label>
          </ion-chip>
        </div>
      </div>

    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { getCollection } from '@/service/fireStoreService';
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonButton,
  IonButtons,
  IonIcon,
  IonCard,
  IonCardContent,
  IonGrid,
  IonRow,
  IonCol,
  IonChip,
  IonLabel
} from '@ionic/vue';
import {
  notifications,
  car,
  map,
  statsChart,
  warning,
  construct,
  checkmark
} from 'ionicons/icons';

const router = useRouter();
const totalSignalements = ref(0);
const totalSurface = ref(0);
const totalEntreprises = ref(0);

const goToMap = () => router.push('/map');
const goToStats = () => router.push('/statistiques');

const loadQuickStats = async () => {
  try {
    const signalements = await getCollection('signalements');
    totalSignalements.value = signalements?.length || 0;

    if (signalements) {
      totalSurface.value = signalements.reduce((acc: number, item: any) =>
        acc + (Number(item.surfaceM2) || 0), 0
      );

      const entreprises = new Set(signalements.map((item: any) => item.idEntreprise).filter(Boolean));
      totalEntreprises.value = entreprises.size;
    }
  } catch (error) {
    console.error('Erreur lors du chargement des stats:', error);
  }
};

onMounted(loadQuickStats);
</script>

<style scoped>
.main-content {
  --background: #f8f9fa;
}

.hero-section {
  background: linear-gradient(135deg, #3880ff 0%, #5260ff 100%);
  color: white;
  padding: 40px 20px;
  text-align: center;
}

.hero-content h1 {
  font-size: 28px;
  font-weight: 600;
  margin: 16px 0 8px 0;
}

.hero-content p {
  font-size: 16px;
  opacity: 0.9;
  margin: 0;
}

.hero-icon {
  font-size: 48px;
  color: rgba(255, 255, 255, 0.9);
}

.quick-actions, .stats-preview, .problem-types {
  padding: 20px;
}

.quick-actions h2, .stats-preview h2, .problem-types h2 {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: #2c3e50;
}

.action-card {
  margin: 0;
  text-align: center;
  --background: white;
  --box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  border-radius: 12px;
}

.action-card ion-card-content {
  padding: 20px 10px;
}

.action-icon {
  font-size: 32px;
  color: #3880ff;
  margin-bottom: 8px;
}

.action-card h3 {
  font-size: 14px;
  font-weight: 600;
  margin: 8px 0 4px 0;
  color: #2c3e50;
}

.action-card p {
  font-size: 12px;
  color: #7d8c9a;
  margin: 0;
}

.stats-preview {
  background: white;
  margin: 0 20px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.stat-item {
  text-align: center;
  padding: 16px 8px;
}

.stat-number {
  font-size: 24px;
  font-weight: 700;
  color: #3880ff;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: #7d8c9a;
}

.problem-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.problem-chip {
  margin: 0;
  font-size: 12px;
}

.problem-chip ion-icon {
  margin-right: 4px;
  font-size: 14px;
}
</style>
