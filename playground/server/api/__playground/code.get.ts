import { createError, defineEventHandler } from 'h3'
import { playground } from '../../plugins/composition'

/** Test mode only: the last verification code the stand-in notifier was given, as a person would read it from their inbox. */
export default defineEventHandler(() => {
  if (process.env.PROFILE_PLAYGROUND_TEST !== '1') throw createError({ statusCode: 404 })
  return { code: playground.lastCode }
})
