// `src/views/BlockedView.vue`
<template>
  <div class="blocked-page">
    <header class="hero">
      <!-- Image bannière suggérée : illustration d'interdiction / bloqueur / panneau routier -->
      <img v-if="bannerSrc" :src="bannerSrc" alt="Bannière blocage" class="hero-img" />
      <h1>Accès bloqué</h1>
    </header>

    <main>
      <p v-if="blockedUntil">
        Votre compte est bloqué jusqu'à&nbsp;: <strong>{{ formattedUntil }}</strong>.
      </p>
      <p v-else>
        Votre compte est actuellement bloqué suite à plusieurs tentatives de connexion.
      </p>

      <p v-if="remainingMinutes > 0">
        Temps restant&nbsp;: <strong>{{ remainingMinutes }} minute(s)</strong>
      </p>
      <p v-else>
        Le blocage est terminé, vous pouvez réessayer de vous connecter.
      </p>

      <!-- Emplacement pour image explicative (ex: icône horloge, notice) -->
      <div class="image-placeholder">
        <img v-if="infoSrc" :src="infoSrc" alt="Info" />
      </div>

      <div class="actions">
        <button @click="goLogin">Revenir à la page de connexion</button>
      </div>

      <section class="help">
        <h2>Que montrer ici&nbsp;?</h2>
        <ul>
          <li>Bannière : illustration « Accès bloqué » ou panneau routier rouge.</li>
          <li>Icone : horloge pour indiquer la durée restante.</li>
          <li>Image secondaire : explication pas-à-pas pour débloquer (contact support, lien d'aide).</li>
        </ul>
      </section>
    </main>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

// on attend `blockedUntil` en ISO string dans query (ex: ?blockedUntil=2026-02-03T12:34:00.000Z)
const blockedUntil = (route.query.blockedUntil as string) || null;

const parsedUntil = computed(() => {
  if (!blockedUntil) return null;
  const d = new Date(blockedUntil);
  return isNaN(d.getTime()) ? null : d;
});

const remainingMinutes = computed(() => {
  if (!parsedUntil.value) return 0;
  const diff = parsedUntil.value.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 60000));
});

const formattedUntil = computed(() => {
  if (!parsedUntil.value) return 'inconnu';
  return parsedUntil.value.toLocaleString();
});

function goLogin() {
  router.push({ name: 'login' });
}

/* Images suggérées - remplacer par vos assets réels */
const bannerSrc = '/assets/images/blocked-banner.png'; // image bannière (ex: panneau stop)
const infoSrc = '/assets/images/clock-icon.png'; // icône horloge
</script>

<style scoped>
.blocked-page { max-width: 800px; margin: 2rem auto; padding: 1rem; text-align: center; }
.hero-img { max-width: 100%; height: auto; margin-bottom: 1rem; }
.image-placeholder img { width: 120px; height: auto; margin: 1rem auto; display: block; }
.actions { margin-top: 1.5rem; }
button { padding: 0.5rem 1rem; }
</style>

--------------------------------------------------------------------------------
