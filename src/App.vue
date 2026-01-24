<template>
  <ion-app>
    <ion-router-outlet v-if="hideNavbar" />
    <ion-tabs v-else>
      <ion-router-outlet />
      <AppNavbar />
    </ion-tabs>
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet, IonTabs } from '@ionic/vue';
import AppNavbar from "@/components/AppNavbar.vue";
import { useRoute } from "vue-router";
import { computed } from "vue";

const route = useRoute();

const hideNavbar = computed(() => route.name === 'Login' || route.path === '/login');
</script>
