<script setup lang="ts">
import { ref } from "vue";
import { login } from "@/service/authService";
import { toastController } from '@ionic/vue';
import { useRouter } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonItem,
  IonInput,
  IonButton
} from '@ionic/vue';

const router = useRouter();
const email = ref("");
const password = ref("");

const doLogin = async () => {
  if (!email.value || !/\S+@\S+\.\S+/.test(email.value)) {
    const toast = await toastController.create({
      message: 'Email invalide',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
    return;
  }
  if (!password.value) {
    const toast = await toastController.create({
      message: 'Mot de passe requis',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
    return;
  }

  try {
    const user = await login(email.value, password.value);
    console.log("Connecté :", user);
    const toast = await toastController.create({
      message: 'Connexion réussie',
      duration: 2000,
      color: 'success'
    });
    await toast.present();
    await router.push('/home');
  } catch (err: any) {
    console.error("Erreur login", err);
    const toast = await toastController.create({
      message: err.message || 'Erreur de connexion',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  }
};
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

        <ion-button
          expand="block"
          @click="doLogin"
          class="login-button"
        >
          Se connecter
        </ion-button>

        <div class="register-link">
          <p>Pas encore de compte ?
            <ion-button fill="clear" @click="() => router.push('/register')">S'inscrire</ion-button>
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