<script setup lang="ts">
import SyncPanel from '@/components/SyncPanel.vue'
import DisclaimerModal from '@/components/DisclaimerModal.vue'
import ThemeDock from '@/components/ThemeDock.vue'
</script>

<template>
  <div class="layout" dir="rtl">
    <header class="hero">
      <div>
        <p class="hero-eyebrow">Clock</p>
        <h1>מעקב זמן עבודה לפרויקטים</h1>
        <p class="hero-sub">
          ניהול שעות, הערות ודוחות חודשיים. הנתונים נשמרים מקומית או ב-Google Drive לפי בחירתך.
        </p>
      </div>
      <div class="header-controls no-print">
        <nav class="main-nav">
          <RouterLink to="/">מעקב יומי</RouterLink>
          <RouterLink to="/projects">פרויקטים</RouterLink>
          <RouterLink to="/history">היסטוריה חודשית</RouterLink>
        </nav>

        <SyncPanel />

        <ThemeDock />
      </div>
    </header>

    <main>
      <RouterView />
    </main>

    <DisclaimerModal />

    <footer class="app-footer">
      <p>נבנה על ידי אפרים קרויזר</p>
      <p>
        Icons by: 
        <a href="https://fontawesome.com/" target="_blank" rel="noreferrer">Font Awesome</a>
      </p>
    </footer>
  </div>
</template>
