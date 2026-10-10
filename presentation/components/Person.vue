<script setup lang="ts">
import { PROFILE_ATTRIBUTES, STEP_UP_ATTRIBUTES, UUID_V7_PATTERN, VERIFICATION_CLAIMS } from '../../contracts'

/**
 * PUBLIC. Another person's profile, as the signed-in viewer may see it now:
 * their display name and the details they disclose to the viewer. With a
 * group, a leaver is shown under that group's departure data policy. An
 * unknown person and one hidden from the viewer read alike.
 */
const props = withDefaults(defineProps<{ subjectId: string, groupId?: string | null }>(), { groupId: null })
const profile = useProfile()
const { t, nameOf } = useProfileText()

const valid = computed(() => UUID_V7_PATTERN.test(props.subjectId) && (props.groupId === null || UUID_V7_PATTERN.test(props.groupId)))
const { data: person, error } = await useAsyncData(
  () => `profile-person-${props.subjectId}-${props.groupId ?? '-'}`,
  () => (valid.value ? profile.person(props.subjectId, props.groupId ?? undefined) : Promise.resolve(null)),
)
const failure = computed(() => (error.value ? profileErrorOf(error.value)?.code ?? 'unavailable' : null))
const shown = computed(() => PROFILE_ATTRIBUTES.filter(key => person.value?.attributes[key] !== undefined))
const hidden = computed(() => !valid.value || (person.value !== null && person.value !== undefined && person.value.displayName.kind === 'hidden' && shown.value.length === 0))
const title = computed(() => (person.value && !hidden.value ? nameOf(person.value.displayName) : t('profile.person.title')))
const contact = computed(() => shown.value.some(key => STEP_UP_ATTRIBUTES.includes(key)))
</script>

<template>
  <div :class="profileClasses.stack">
    <h1 id="profile-page-title" :class="profileClasses.title">{{ title }}</h1>
    <ProfileUnavailable v-if="failure && failure !== 'forbidden'" :code="failure" />
    <ProfileAlert v-else-if="failure || hidden" tone="info" :focus-on-mount="false">
      <p>{{ t('profile.person.notAvailable') }}</p>
    </ProfileAlert>
    <section v-else-if="person" aria-labelledby="profile-person-details">
      <h2 id="profile-person-details" :class="profileClasses.sectionTitle">{{ t('profile.person.detailsTitle') }}</h2>
      <p v-if="shown.length === 0" :class="profileClasses.muted">{{ t('profile.person.noDetails') }}</p>
      <dl v-else :class="profileClasses.definitions">
        <template v-for="key in shown" :key="key">
          <dt :class="profileClasses.term">{{ t(`profile.attribute.${key}`) }}</dt>
          <dd :class="profileClasses.definition">
            {{ person.attributes[key] }}
            <span v-if="VERIFICATION_CLAIMS[key] && person.attributes[VERIFICATION_CLAIMS[key]!] === true" :class="profileClasses.badge" class="ml-2">{{ t('profile.verification.verified') }}</span>
          </dd>
        </template>
      </dl>
      <p v-if="contact" :class="profileClasses.muted" class="mt-3">{{ t('profile.person.contactNotice') }}</p>
    </section>
  </div>
</template>
