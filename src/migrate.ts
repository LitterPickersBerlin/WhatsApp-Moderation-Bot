import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'

async function migrate(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  const { rows } = await pool.query<{ filename: string }>(
    `SELECT filename FROM schema_migrations ORDER BY filename`,
  )
  const applied = new Set(rows.map(r => r.filename))

  const migrationsDir = path.join(__dirname, '..', 'migrations')
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql') || f.endsWith('.ts'))
    .sort()

  let count = 0
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`⏭️  Already applied: ${file}`)
      continue
    }

    console.log(`⏳ Applying: ${file}`)

    if (file.endsWith('.sql')) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
      await pool.query(sql)
    } else {
      const mod = require(path.join(migrationsDir, file))
      await mod.run(pool)
    }

    await pool.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [file])
    console.log(`✅ Applied: ${file}`)
    count++
  }

  if (count === 0) console.log('✅ All migrations already applied')

  await pool.end()
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err)
  process.exit(1)
})
