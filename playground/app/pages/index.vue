<script setup lang="ts">
/**
 * Playground page: names the people given in `?people=` (comma-separated
 * identifiers) through ProfilePersonName, as a host's member list would,
 * with `?groupId=` as the group in view.
 */
useHead({ title: 'Profile playground', htmlAttrs: { lang: 'en-GB' } })
const route = useRoute()
const people = computed(() => String(route.query.people ?? '').split(',').filter(Boolean))
const groupId = computed(() => (typeof route.query.groupId === 'string' ? route.query.groupId : null))
</script>

<template>
  <div :class="profileClasses.page">
    <main :class="profileClasses.card" aria-labelledby="playground-title">
      <h1 id="playground-title" :class="profileClasses.title">Profile playground</h1>
      <p :class="profileClasses.text">Composition harness for the profile layer.</p>
      <ul :class="profileClasses.list" class="mt-4">
        <li v-for="person in people" :key="person" :class="profileClasses.listItem">
          <ProfilePersonName :identity-id="person" :group-id="groupId" link />
        </li>
      </ul>
    </main>
  </div>
</template>
