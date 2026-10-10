<script setup lang="ts">
/** PUBLIC. A link to the host's sign-in page that returns here: to sign in, or to sign in again for a recent sign-in. */
const props = withDefaults(defineProps<{ again?: boolean }>(), { again: false })
const { t } = useProfileText()
const routes = useProfileRoutes()
const route = useRoute()
const href = computed(() => `${routes.signIn()}?redirect=${encodeURIComponent(route.fullPath)}`)
const label = computed(() => t(props.again ? 'profile.common.signInAgain' : 'profile.common.signIn'))
</script>

<template>
  <a :href="href" :class="profileClasses.actionLink">{{ label }}</a>
</template>
