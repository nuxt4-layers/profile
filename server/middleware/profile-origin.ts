import { defineEventHandler } from 'h3'
import { useRuntimeConfig } from '#imports'
import { originRejected, profileHttpError } from '../internal/http'

/** CSRF defence for `/api/profile/*` (docs/contracts.md §12): state-changing requests must come from the configured origin. */
export default defineEventHandler((event) => {
  if (originRejected(event, useRuntimeConfig().profile?.baseUrl)) throw profileHttpError('forbidden')
})
