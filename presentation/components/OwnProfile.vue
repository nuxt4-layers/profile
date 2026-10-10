<script setup lang="ts">
import type { ProfileOwnView } from '../../contracts'

/**
 * PUBLIC. The signed-in person's own profile: their details, who may see
 * them, and a download of their data. Nobody can change these for another
 * person. There is no erasure here: it follows the closure of the account.
 */
const profile = useProfile()
const { t } = useProfileText()

const { data: me, error, refresh } = await useAsyncData('profile-me', () => profile.me())
const failure = computed(() => (error.value ? profileErrorOf(error.value)?.code ?? 'unavailable' : null))

function updated(view: ProfileOwnView) {
  me.value = view
}
</script>

<template>
  <div :class="profileClasses.stack">
    <ProfileUnavailable v-if="failure" :code="failure" />
    <template v-else-if="me">
      <p :class="profileClasses.text">{{ t('profile.own.intro') }}</p>
      <ProfileDetails :me="me" @updated="updated" @reload="refresh()" />
      <ProfileDisclosure :me="me" @updated="updated" @reload="refresh()" />
      <ProfileDataExport />
    </template>
  </div>
</template>
