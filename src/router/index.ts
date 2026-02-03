import { createRouter, createWebHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';
import { onAuthStateChanged } from 'firebase/auth';
import HomePage from '../views/HomePage.vue';
import Login from '../views/Login.vue';
import Map from '../views/Map.vue';
import { auth } from '@/firebase';
import StatistiquesPage from "@/views/StatistiquesPage.vue";
import BlockedView from "@/views/BlockedView.vue";

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    redirect: '/home'
  },
  {
    path: '/home',
    name: 'Home',
    component: HomePage,
    meta: { requiresAuth: true }
  },
  {
    path:'/login',
    name: 'Login',
    component: Login,
    meta: { guest: true }
  },
  {
    path:'/map',
    name: 'Map',
    component: Map,
    meta: { requiresAuth: true }
  },
  {
    path:'/statistiques',
    name: 'Statistiques',
    component: StatistiquesPage,
    meta: { requiresAuth: true }
  },
  {
    path:'/blocked',
    name:'blocked',
    component: BlockedView
  }

]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

const getCurrentUser = (timeoutMs = 5000): Promise<any> => {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          unsubscribe();
          resolve(user);
        },
        (error) => {
          unsubscribe();
          reject(error);
        }
    );

    // safety timeout: resolve null if firebase doesn't respond in time
    if (timeoutMs > 0) {
      setTimeout(() => {
        try { unsubscribe(); } catch (e) {
          // ignore unsubscribe errors
        }
        resolve(null);
      }, timeoutMs);
    }
  });
};

router.beforeEach(async (to) => {
  const user = await getCurrentUser().catch(() => null);

  // If route requires auth and there's no user, redirect to login
  if (to.meta?.requiresAuth && !user) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  // If route is for guests (login) and user exists, redirect to home
  if (to.meta?.guest && user) {
    return { path: '/home' };
  }

  // laisser passer
  return true;
});

export default router
