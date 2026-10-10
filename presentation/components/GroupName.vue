<script setup lang="ts">
/**
 * PUBLIC. A group's name on the person's own pages. Group names are
 * Identity's: Profile holds none, so this reads "A group you left". A host
 * that composes Identity backs it with a component of the same name that
 * shows the name from Identity's own view of the person (`formerGroupNames`
 * from `GET /api/identity/me`), so neither layer imports the other.
 */
defineProps<{ groupId: string }>()
const { t } = useProfileText()
</script>

<template>
  <span :data-group-id="groupId">{{ t('profile.group.unnamed') }}</span>
</template>
