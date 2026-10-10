// Recreates the disposable e2e database and its runtime role before the playground server starts.
import pg from 'pg'

const database = 'profile_e2e'
const role = 'profile_e2e_runtime'
const admin = new pg.Client({ connectionString: process.env.PROFILE_TEST_DATABASE_URL })
await admin.connect()
await admin.query(`drop database if exists "${database}" with (force)`)
await admin.query(`drop role if exists "${role}"`)
await admin.query(`create role "${role}" login password 'profile-e2e-runtime-password' nosuperuser nobypassrls`)
await admin.query(`create database "${database}"`)
await admin.end()
