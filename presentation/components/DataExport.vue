<script setup lang="ts">
/**
 * PUBLIC. Downloads Profile's part of the person's data, as JSON. The
 * server asks for a recent sign-in; when it does, this offers one. The data
 * never leaves the browser except as the person's own file.
 */
const profile = useProfile()
const routes = useProfileRoutes()
const action = useProfileAction()
const { t } = action
const notice = ref<string | null>(null)

async function download() {
  notice.value = null
  const data = await action.run(() => profile.exportData())
  if (data === null) return
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = t('profile.export.fileName')
  anchor.click()
  URL.revokeObjectURL(url)
  notice.value = t('profile.export.ready')
}
</script>

<template>
  <section :class="profileClasses.section" aria-labelledby="profile-export-title">
    <h2 id="profile-export-title" :class="profileClasses.sectionTitle">{{ t('profile.export.title') }}</h2>
    <div :class="profileClasses.stack">
      <p :class="profileClasses.text">{{ t('profile.export.explained') }}</p>
      <ProfileAlert v-if="action.error.value" tone="error">
        <p>{{ action.error.value }}</p>
        <p v-if="action.code.value === 'insufficient-assurance'" class="mt-2"><ProfileSignInLink again /></p>
      </ProfileAlert>
      <ProfileAlert v-if="notice" tone="success" :focus-on-mount="false">{{ notice }}</ProfileAlert>
      <div :class="profileClasses.row">
        <button type="button" :class="profileClasses.secondaryButton" :disabled="action.disabled.value" @click="download">{{ t('profile.export.download') }}</button>
      </div>
      <p v-if="routes.requests()" :class="profileClasses.text">
        {{ t('profile.export.requestsExplained') }}
        <NuxtLink :to="routes.requests()!" :class="profileClasses.link">{{ t('profile.export.requestsLink') }}</NuxtLink>
      </p>
    </div>
  </section>
</template>
