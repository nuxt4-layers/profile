<script setup lang="ts">
import type { DisclosureSettings, ProfileOwnView } from '../../contracts'
import { DISCLOSURE_AUDIENCES, DISPLAY_NAME_SOURCES, PROFILE_ATTRIBUTES } from '../../contracts'

/**
 * PUBLIC. The person's choices over who sees what: each detail's audience,
 * which name others see, and whether to be anonymous in every group they
 * leave. Saved against the version shown. Emits `updated` with the new
 * view, and `reload` when the record changed elsewhere.
 */
const props = defineProps<{ me: ProfileOwnView }>()
const emit = defineEmits<{ updated: [view: ProfileOwnView], reload: [] }>()

const profile = useProfile()
const action = useProfileAction()
const { t } = action
const notice = ref<string | null>(null)

const copy = (settings: DisclosureSettings): DisclosureSettings => ({ ...settings, audiences: { ...settings.audiences } })
const draft = ref<DisclosureSettings>(copy(props.me.settings))
watch(() => props.me, (me) => { draft.value = copy(me.settings) })

async function save() {
  notice.value = null
  const view = await action.run(() => profile.setDisclosure(props.me.version, draft.value))
  if (view) {
    notice.value = t('profile.disclosure.saved')
    emit('updated', view)
  }
  else if (action.code.value === 'conflict') {
    emit('reload')
  }
}
</script>

<template>
  <section :class="profileClasses.section" aria-labelledby="profile-disclosure-title">
    <h2 id="profile-disclosure-title" :class="profileClasses.sectionTitle">{{ t('profile.disclosure.title') }}</h2>
    <p :class="profileClasses.text">{{ t('profile.disclosure.explained') }}</p>
    <form :class="profileClasses.stack" class="mt-4" @submit.prevent="save">
      <ProfileAlert v-if="action.error.value" tone="error">{{ action.error.value }}</ProfileAlert>
      <ProfileAlert v-if="notice" tone="success" :focus-on-mount="false">{{ notice }}</ProfileAlert>

      <fieldset :class="profileClasses.fieldset">
        <legend :class="profileClasses.legend">{{ t('profile.disclosure.audiencesLegend') }}</legend>
        <div v-for="key in PROFILE_ATTRIBUTES" :key="key">
          <label :for="`profile-audience-${key}`" :class="profileClasses.label">{{ t(`profile.attribute.${key}`) }}</label>
          <select :id="`profile-audience-${key}`" v-model="draft.audiences[key]" :class="profileClasses.select">
            <option v-for="audience in DISCLOSURE_AUDIENCES" :key="audience" :value="audience">{{ t(`profile.audience.${audience}`) }}</option>
          </select>
        </div>
      </fieldset>

      <fieldset :class="profileClasses.fieldset" aria-describedby="profile-display-name-explained">
        <legend :class="profileClasses.legend">{{ t('profile.disclosure.displayNameLegend') }}</legend>
        <p id="profile-display-name-explained" :class="profileClasses.hint">{{ t('profile.disclosure.displayNameExplained') }}</p>
        <label v-for="source in DISPLAY_NAME_SOURCES" :key="source" :class="profileClasses.row">
          <input v-model="draft.displayName" type="radio" name="profile-display-name" :value="source" :class="profileClasses.radio">
          <span :class="profileClasses.text">{{ t(`profile.disclosure.displayNameSource.${source}`) }}</span>
        </label>
      </fieldset>

      <fieldset :class="profileClasses.fieldset">
        <legend :class="profileClasses.legend">{{ t('profile.disclosure.departureLegend') }}</legend>
        <label :class="profileClasses.row">
          <input v-model="draft.anonymiseOnDeparture" type="checkbox" :class="profileClasses.checkbox" aria-describedby="profile-departure-hint">
          <span :class="profileClasses.text">{{ t('profile.disclosure.anonymiseOnDeparture') }}</span>
        </label>
        <p id="profile-departure-hint" :class="profileClasses.hint">{{ t('profile.disclosure.anonymiseOnDepartureHint') }}</p>
      </fieldset>

      <div :class="profileClasses.row">
        <button type="submit" :class="profileClasses.primaryButton" :disabled="action.disabled.value">{{ t('profile.common.save') }}</button>
      </div>
    </form>
  </section>
</template>
