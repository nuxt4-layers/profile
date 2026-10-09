import type { PostgresPoolLike } from '../../contracts'

/**
 * PRIVATE. Versioned, append-only migrations for Profile's schema
 * (ADR-0002). `{{schema}}` is replaced with the validated, quoted schema
 * identifier. Never edit a released migration; add a new one.
 *
 * Every attribute value is stored encrypted with the person's own key
 * (docs/contracts.md §6); disclosure settings, identifiers and codes are
 * stored in the clear. Nothing here names a person in plaintext.
 */
export const PROFILE_MIGRATIONS: readonly { id: string, sql: string }[] = [
  {
    id: '0001_records_keys_departures_outbox',
    sql: `
-- Each person's data key, only ever stored wrapped by the host's key port.
create table {{schema}}."subject_key" (
  "identity_id" text primary key,
  "key_version" text not null check (length("key_version") between 1 and 200),
  "wrapped_key" text not null,
  "created_at" timestamptz not null default now(),
  "rewrapped_at" timestamptz
);
create index "subject_key_version_idx" on {{schema}}."subject_key" ("key_version");

-- The record: attributes encrypted as one value; disclosure settings in the clear.
create table {{schema}}."record" (
  "identity_id" text primary key references {{schema}}."subject_key" ("identity_id") on delete cascade,
  "ciphertext" bytea not null,
  "disclosure" jsonb not null,
  "version" integer not null default 1,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

-- How a leaver is shown in a group: their name at departure (encrypted with
-- their key), their pseudonym, or nothing once they chose anonymity.
create table {{schema}}."departure" (
  "group_id" text not null,
  "identity_id" text not null,
  "ended_at" timestamptz not null,
  "name_ciphertext" bytea,
  "pseudonym" integer check ("pseudonym" > 0),
  "anonymised" boolean not null default false,
  primary key ("group_id", "identity_id"),
  unique ("group_id", "pseudonym"),
  check (not "anonymised" or ("name_ciphertext" is null and "pseudonym" is null))
);
create index "departure_identity_idx" on {{schema}}."departure" ("identity_id");

create table {{schema}}."pseudonym_counter" (
  "group_id" text primary key,
  "last" integer not null
);

-- Identities whose record was erased: no record is ever created for them again.
create table {{schema}}."erased" (
  "identity_id" text primary key,
  "reason_code" text not null,
  "erased_at" timestamptz not null default now()
);

-- Identity events already applied (consumers are idempotent by event id).
create table {{schema}}."processed_event" (
  "event_id" text primary key,
  "processed_at" timestamptz not null default now()
);

-- Transactional outbox: written in the same transaction as the change.
create table {{schema}}."outbox" (
  "sequence" bigserial primary key,
  "event" jsonb not null,
  "created_at" timestamptz not null default now(),
  "published_at" timestamptz
);
create index "outbox_unpublished_idx" on {{schema}}."outbox" ("sequence") where "published_at" is null;
`,
  },
]

const SCHEMA_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/
const ROLE_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/

export function quoteSchema(schema: string): string {
  if (!SCHEMA_PATTERN.test(schema)) throw new TypeError(`Invalid profile schema name '${schema}'.`)
  return `"${schema}"`
}

export interface PoolClientLike {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>
  release(): void
}

/**
 * Applies pending migrations inside one transaction, serialised across
 * instances with a transaction-scoped advisory lock. With `runtimeRole`, the
 * schema's owner grants that role usage of the schema and data access to its
 * tables, and nothing else (ADR-0006 §5). Returns the ids applied.
 */
export async function runProfileMigrations(pool: PostgresPoolLike, schema: string, runtimeRole?: string): Promise<string[]> {
  const quoted = quoteSchema(schema)
  if (runtimeRole !== undefined && !ROLE_PATTERN.test(runtimeRole)) throw new TypeError(`Invalid runtime role name '${runtimeRole}'.`)
  const client = await pool.connect() as PoolClientLike
  const applied: string[] = []
  try {
    await client.query('begin')
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`profile-migrations:${schema}`])
    const existing = await client.query('select 1 from pg_namespace where nspname = $1', [schema])
    if (existing.rows.length === 0) await client.query(`create schema ${quoted}`)
    await client.query(`create table if not exists ${quoted}."schema_migration" ("id" text primary key, "applied_at" timestamptz not null default now())`)
    const { rows } = await client.query(`select "id" from ${quoted}."schema_migration"`)
    const done = new Set(rows.map(row => row.id))
    for (const migration of PROFILE_MIGRATIONS) {
      if (done.has(migration.id)) continue
      await client.query(migration.sql.replaceAll('{{schema}}', quoted))
      await client.query(`insert into ${quoted}."schema_migration" ("id") values ($1)`, [migration.id])
      applied.push(migration.id)
    }
    if (runtimeRole) {
      const role = `"${runtimeRole}"`
      await client.query(`grant usage on schema ${quoted} to ${role}`)
      await client.query(`grant select, insert, update, delete on ${quoted}."subject_key", ${quoted}."record", ${quoted}."departure", ${quoted}."pseudonym_counter", ${quoted}."processed_event", ${quoted}."outbox" to ${role}`)
      await client.query(`grant select, insert on ${quoted}."erased" to ${role}`)
      await client.query(`grant usage on sequence ${quoted}."outbox_sequence_seq" to ${role}`)
    }
    await client.query('commit')
    return applied
  }
  catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }
  finally {
    client.release()
  }
}
