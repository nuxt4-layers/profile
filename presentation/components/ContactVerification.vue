<script setup lang="ts">
import type { ProfileOwnView, VerifiableAttribute } from '../../contracts'
import { VERIFICATION_CLAIMS, verificationCodeSchema } from '../../contracts'

/**
 * PUBLIC. Verifies one saved contact detail: sends a one-time code to it
 * through the host, and takes the code back. Shown only for a detail that is
 * saved and not yet verified. Emits `updated` with the new view once
 * verified. Sending needs a recent sign-in, which the server asks for.
 * The code field is not a form of its own: it sits inside the details
 * form, and forms do not nest; Enter in it verifies.
 */
const props = defineProps<{ me: ProfileOwnView, attribute: VerifiableAttribute }>()
const emit = defineEmits<{ updated: [view: ProfileOwnView] }>()

const profile = useProfile()
const action = useProfileAction()
const { t } = action
const sent = ref(false)
const code = ref('')
const problem = ref<string | null>(null)
const notice = ref<string | null>(null)
const id = computed(() => `profile-verify-${props.attribute}`)
const verified = computed(() => props.me.attributes[VERIFICATION_CLAIMS[props.attribute]!] === true)
watch(() => props.me.attributes[props.attribute], () => {
  sent.value = false
  code.value = ''
})

async function send() {
  notice.value = null
  const answer = await action.run(() => profile.sendVerification(props.attribute))
  if (!answer) return
  sent.value = answer.status === 'sent'
  notice.value = t(answer.status === 'sent' ? `profile.verification.sent.${props.attribute}` : 'profile.verification.verified')
}

async function confirm() {
  notice.value = null
  problem.value = verificationCodeSchema.safeParse(code.value.trim()).success ? null : t('profile.reason.invalid-code')
  if (problem.value) return
  const view = await action.run(() => profile.confirmVerification(props.attribute, code.value.trim()))
  if (view) {
    sent.value = false
    code.value = ''
    emit('updated', view)
  }
}
</script>

<template>
  <div :class="profileClasses.stack" class="mt-2">
    <span v-if="verified" :class="profileClasses.badge">{{ t('profile.verification.verified') }}</span>
    <template v-else>
      <ProfileAlert v-if="action.error.value" tone="error">
        <p>{{ action.error.value }}</p>
        <p v-if="action.code.value === 'insufficient-assurance'" class="mt-2"><ProfileSignInLink again /></p>
      </ProfileAlert>
      <ProfileAlert v-if="notice" tone="success" :focus-on-mount="false">{{ notice }}</ProfileAlert>
      <div :class="profileClasses.row">
        <span :class="profileClasses.badge">{{ t('profile.verification.unverified') }}</span>
        <button type="button" :class="profileClasses.secondaryButton" :disabled="action.disabled.value" @click="send">{{ t(sent ? 'profile.verification.resend' : 'profile.verification.send') }}</button>
      </div>
      <div v-if="sent" :class="profileClasses.stack">
        <div>
          <label :for="id" :class="profileClasses.label">{{ t('profile.verification.codeLabel') }}</label>
          <input
            :id="id"
            v-model="code"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            :class="profileClasses.input"
            :aria-invalid="problem ? 'true' : undefined"
            :aria-describedby="problem ? `${id}-problem` : undefined"
            @keydown.enter.prevent="confirm"
          >
          <p v-if="problem" :id="`${id}-problem`" :class="profileClasses.fieldError">{{ problem }}</p>
        </div>
        <div :class="profileClasses.row">
          <button type="button" :class="profileClasses.primaryButton" :disabled="action.disabled.value" @click="confirm">{{ t('profile.verification.confirm') }}</button>
        </div>
      </div>
    </template>
  </div>
</template>
