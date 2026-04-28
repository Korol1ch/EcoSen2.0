const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// ─── SCHEMA ──────────────────────────────────────────────────────────────────
const INIT_SQL = `
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

  CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    telegram_id   VARCHAR(100),
    points        INTEGER DEFAULT 0,
    scans         INTEGER DEFAULT 0,
    trust_score   FLOAT DEFAULT 1.0,
    is_verified   BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
  );

  -- Stores pending verification codes (TTL-style: codes expire after 15min)
  CREATE TABLE IF NOT EXISTS email_verifications (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email      VARCHAR(255) NOT NULL,
    name       VARCHAR(100) NOT NULL,
    pass_hash  VARCHAR(255) NOT NULL,
    code       VARCHAR(6) NOT NULL,
    attempts   INTEGER DEFAULT 0,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_email_verif_email ON email_verifications(email);

  CREATE TABLE IF NOT EXISTS stations (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL,
    lat         FLOAT NOT NULL,
    lng         FLOAT NOT NULL,
    city        VARCHAR(100) DEFAULT 'Актау',
    is_active   BOOLEAN DEFAULT TRUE,
    material_rates JSONB DEFAULT '{"plastic":10,"glass":15,"paper":5,"metal":20}',
    created_at  TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    station_id  UUID REFERENCES stations(id) ON DELETE SET NULL,
    material    VARCHAR(50) NOT NULL,
    weight_kg   FLOAT,
    points      INTEGER NOT NULL,
    icon        VARCHAR(10),
    source      VARCHAR(20) DEFAULT 'ai_scan',
    status      VARCHAR(20) DEFAULT 'confirmed',
    created_at  TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS anomaly_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    type        VARCHAR(50),
    description TEXT,
    severity    VARCHAR(20) DEFAULT 'low',
    created_at  TIMESTAMP DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

  INSERT INTO stations (name, lat, lng, city) VALUES
    ('Пункт приема пластика (14 мкр)', 43.6454, 51.1693, 'Актау'),
    ('Эко-станция (11 мкр)',           43.6354, 51.1593, 'Актау'),
    ('Сбор картона и стекла (8 мкр)',  43.6554, 51.1493, 'Актау')
  ON CONFLICT DO NOTHING;
`;

async function initDB() {
  try {
    await pool.query(INIT_SQL);
    console.log('✅ Database initialized successfully');
  } catch (err) {
    console.error('❌ Database init error:', err.message);
  }
}

module.exports = { pool, initDB };
