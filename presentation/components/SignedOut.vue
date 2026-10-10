<script setup lang="ts">
/** PUBLIC. Shown when nobody is signed in: a link to the host's sign-in page that returns here. */
const { t } = useProfileText()
</script>

<template>
  <ProfileAlert tone="info" :focus-on-mount="false">
    <p>{{ t('profile.common.signInRequired') }}</p>
    <p class="mt-2">
      <ProfileSignInLink />
    </p>
  </ProfileAlert>
</template>
