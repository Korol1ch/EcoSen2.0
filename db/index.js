const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const INIT_SQL = `
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

  CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    telegram_id   VARCHAR(100),
    points        INTEGER DEFAULT 0,
    scans         INTEGER DEFAULT 0,
    trust_score   FLOAT DEFAULT 1.0,
    co2_saved_kg  FLOAT DEFAULT 0,
    is_verified   BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS email_verifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           VARCHAR(100) NOT NULL,
    lat            FLOAT NOT NULL,
    lng            FLOAT NOT NULL,
    city           VARCHAR(100) DEFAULT 'Актау',
    is_active      BOOLEAN DEFAULT TRUE,
    material_rates JSONB DEFAULT '{"plastic":10,"glass":15,"paper":5,"metal":20}',
    created_at     TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS operators (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    station_id    UUID REFERENCES stations(id) ON DELETE SET NULL,
    role          VARCHAR(20) DEFAULT 'operator' CHECK (role IN ('operator','admin')),
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_operators_station ON operators(station_id);

  CREATE TABLE IF NOT EXISTS transactions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    station_id  UUID REFERENCES stations(id) ON DELETE SET NULL,
    operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
    material    VARCHAR(50) NOT NULL,
    weight_kg   FLOAT,
    points      INTEGER NOT NULL,
    co2_saved   FLOAT DEFAULT 0,
    icon        VARCHAR(10),
    source      VARCHAR(20) DEFAULT 'ai_scan' CHECK (source IN ('ai_scan','station','manual')),
    status      VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('confirmed','pending','rejected')),
    created_at  TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_station_id ON transactions(station_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

  CREATE TABLE IF NOT EXISTS anomaly_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    station_id  UUID REFERENCES stations(id) ON DELETE SET NULL,
    operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
    type        VARCHAR(50),
    description TEXT,
    severity    VARCHAR(20) DEFAULT 'low' CHECK (severity IN ('low','medium','high')),
    resolved    BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          VARCHAR(50) UNIQUE NOT NULL,
    name          VARCHAR(100) NOT NULL,
    description   TEXT,
    icon          VARCHAR(10) DEFAULT '🏆',
    condition     JSONB NOT NULL,
    points_reward INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS user_achievements (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID REFERENCES users(id) ON DELETE CASCADE,
    achievement_id UUID REFERENCES achievements(id) ON DELETE CASCADE,
    earned_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
  );
  CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);

  CREATE TABLE IF NOT EXISTS notifications (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id  UUID REFERENCES users(id) ON DELETE CASCADE,
    type     VARCHAR(50) NOT NULL,
    title    VARCHAR(200) NOT NULL,
    body     TEXT,
    is_read  BOOLEAN DEFAULT FALSE,
    sent_at  TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

  CREATE TABLE IF NOT EXISTS stations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           VARCHAR(100) NOT NULL,
    lat            FLOAT NOT NULL,
    lng            FLOAT NOT NULL,
    city           VARCHAR(100) DEFAULT 'Актау',
    is_active      BOOLEAN DEFAULT TRUE,
    material_rates JSONB DEFAULT '{"plastic":10,"glass":15,"paper":5,"metal":20}',
    created_at     TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS operators (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    station_id    UUID REFERENCES stations(id) ON DELETE SET NULL,
    role          VARCHAR(20) DEFAULT 'operator' CHECK (role IN ('operator','admin')),
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_operators_station ON operators(station_id);

  CREATE TABLE IF NOT EXISTS transactions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    station_id  UUID REFERENCES stations(id) ON DELETE SET NULL,
    operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
    material    VARCHAR(50) NOT NULL,
    weight_kg   FLOAT,
    points      INTEGER NOT NULL,
    co2_saved   FLOAT DEFAULT 0,
    icon        VARCHAR(10),
    source      VARCHAR(20) DEFAULT 'ai_scan' CHECK (source IN ('ai_scan','station','manual')),
    status      VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('confirmed','pending','rejected')),
    created_at  TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_station_id ON transactions(station_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

  CREATE TABLE IF NOT EXISTS anomaly_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    station_id  UUID REFERENCES stations(id) ON DELETE SET NULL,
    operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
    type        VARCHAR(50),
    description TEXT,
    severity    VARCHAR(20) DEFAULT 'low' CHECK (severity IN ('low','medium','high')),
    resolved    BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          VARCHAR(50) UNIQUE NOT NULL,
    name          VARCHAR(100) NOT NULL,
    description   TEXT,
    icon          VARCHAR(10) DEFAULT '🏆',
    condition     JSONB NOT NULL,
    points_reward INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS user_achievements (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID REFERENCES users(id) ON DELETE CASCADE,
    achievement_id UUID REFERENCES achievements(id) ON DELETE CASCADE,
    earned_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
  );
  CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);

  CREATE TABLE IF NOT EXISTS notifications (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id  UUID REFERENCES users(id) ON DELETE CASCADE,
    type     VARCHAR(50) NOT NULL,
    title    VARCHAR(200) NOT NULL,
    body     TEXT,
    is_read  BOOLEAN DEFAULT FALSE,
    sent_at  TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

  INSERT INTO stations (name, lat, lng, city) VALUES
    ('Пункт приема пластика (14 мкр)', 43.6454, 51.1693, 'Актау'),
    ('Эко-станция (11 мкр)',           43.6354, 51.1593, 'Актау'),
    ('Сбор картона и стекла (8 мкр)',  43.6554, 51.1493, 'Актау')
  ON CONFLICT DO NOTHING;

  INSERT INTO achievements (code, name, description, icon, condition, points_reward) VALUES
    ('first_scan',    'Первый шаг',        'Сдайте мусор первый раз',              '🌱', '{"type":"scans","threshold":1}',     10),
    ('scan_10',       'Эко-новичок',       'Сдайте мусор 10 раз',                  '♻️', '{"type":"scans","threshold":10}',    25),
    ('scan_50',       'Эко-активист',      'Сдайте мусор 50 раз',                  '🌿', '{"type":"scans","threshold":50}',    100),
    ('scan_100',      'Эко-герой',         'Сдайте мусор 100 раз',                 '🦸', '{"type":"scans","threshold":100}',   250),
    ('points_100',    'Сотня баллов',      'Наберите 100 баллов',                  '💯', '{"type":"points","threshold":100}',  0),
    ('points_1000',   'Тысяча баллов',     'Наберите 1000 баллов',                 '🎯', '{"type":"points","threshold":1000}', 50),
    ('co2_10',        'Чистый воздух',     'Сэкономьте 10 кг CO₂',                 '💨', '{"type":"co2","threshold":10}',      30),
    ('co2_100',       'Климат-боец',       'Сэкономьте 100 кг CO₂',                '🌍', '{"type":"co2","threshold":100}',     100),
    ('station_visit', 'Пункт приёма',      'Сдайте мусор на реальной станции',      '🏭', '{"type":"station_drop","threshold":1}', 15),
    ('streak_7',      'Неделя без мусора', 'Сдавайте мусор 7 дней подряд',          '🔥', '{"type":"streak_days","threshold":7}',  50)
  ON CONFLICT (code) DO NOTHING;
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
