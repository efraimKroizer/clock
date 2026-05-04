<script setup lang="ts">
import { ref } from 'vue'

const DISCLAIMER_KEY = 'clock-disclaimer-accepted'

const visible = ref(!localStorage.getItem(DISCLAIMER_KEY))

function acceptDisclaimer() {
  localStorage.setItem(DISCLAIMER_KEY, '1')
  visible.value = false
}
</script>

<template>
  <div v-if="visible" class="modal-backdrop">
    <section class="modal-panel disclaimer-panel" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
      <p class="hero-eyebrow">שימו לב</p>
      <h3 id="disclaimer-title">הצהרת שימוש</h3>
      <p>
        כלי זה פותח לשימוש אישי בלבד כעזר לניהול שעות עבודה.
        הוא מסופק כמו שהוא (<strong>as-is</strong>), ללא כל אחריות מכל סוג שהוא.
      </p>
      <p>
        אין להסתמך עליו לצורך חישובים רשמיים, חוקיים או כספיים,
        ואין לבוא בכל טענה למפתח בגין שגיאות, אובדן נתונים, או כל נזק אחר.
      </p>
      <p>השימוש בכלי מהווה הסכמה לתנאים אלו.</p>
      <div class="row" style="justify-content: flex-end">
        <button class="primary" @click="acceptDisclaimer">קראתי והבנתי</button>
      </div>
    </section>
  </div>
</template>
