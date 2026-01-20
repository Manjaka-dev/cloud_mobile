<script setup lang="ts">
import { ref } from "vue";
import { getToken, createServerSession } from "@/service/authService";
import { toastController } from '@ionic/vue';
import { useRouter, useRoute } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonItem,
  IonInput,
  IonButton,
  IonCheckbox,
  IonLabel
} from '@ionic/vue';

const router = useRouter();
const route = useRoute();
const email = ref("");
const password = ref("");
const remember = ref(true);
const loading = ref(false);

const doLogin = async () => {
  if (!email.value || !/\S+@\S+\.\S+/.test(email.value)) {
    const t = await toastController.create({ message: 'Email invalide', duration: 2000, color: 'danger' });
    await t.present();
    return;
  }
  if (!password.value) {
    const t = await toastController.create({ message: 'Mot de passe requis', duration: 2000, color: 'danger' });
    await t.present();
    return;
  }

  loading.value = true;
  try {
    const token = await getToken();
    if (token) {
      // tente de créer la session serveur (cookie HTTP-only)
      await createServerSession(token, !!remember.value);
    }

    const successToast = await toastController.create({ message: 'Connexion réussie', duration: 1500, color: 'success' });
    await successToast.present();

    const redirect = (route.query.redirect as string) || '/map';
    await router.push(redirect);
  } catch (err: any) {
    console.error("Erreur login", err);
    const t = await toastController.create({ message: err?.message || 'Erreur de connexion', duration: 2500, color: 'danger' });
    await t.present();
  } finally {
    loading.value = false;
  }
};

const goRegister = () => router.push('/register');
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Connexion</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="login-container">
        <h1>Se connecter</h1>

        <ion-item>
          <ion-input
              v-model="email"
              label="Email"
              label-placement="floating"
              type="email"
              placeholder="Entrez votre email"
              fill="outline"
          />
        </ion-item>

        <ion-item>
          <ion-input
              v-model="password"
              label="Mot de passe"
              label-placement="floating"
              type="password"
              placeholder="Entrez votre mot de passe"
              fill="outline"
          />
        </ion-item>

        <ion-item lines="none">
          <ion-checkbox v-model="remember" slot="start" />
          <ion-label>Se souvenir de moi</ion-label>
        </ion-item>

        <ion-button
            expand="block"
            :disabled="loading"
            @click="doLogin"
            class="login-button"
        >
          <span v-if="!loading">Se connecter</span>
          <span v-else>Connexion...</span>
        </ion-button>

        <div class="register-link">
          <p>Pas encore de compte ?
            <ion-button fill="clear" @click="goRegister">S'inscrire</ion-button>
          </p>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.login-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 100%;
  padding: 20px;
}

h1 {
  text-align: center;
  margin-bottom: 30px;
  color: var(--ion-color-primary);
}

ion-item {
  margin-bottom: 15px;
  width: 100%;
  max-width: 350px;
}

.login-button {
  margin-top: 20px;
  width: 100%;
  max-width: 350px;
  height: 50px;
}

.register-link {
  text-align: center;
  margin-top: 20px;
}

.register-link p {
  margin: 0;
  color: var(--ion-color-medium);
}

.register-link ion-button {
  --color: var(--ion-color-primary);
}
</style>