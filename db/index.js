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
    username      VARCHAR(50) UNIQUE,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    telegram_id   VARCHAR(100),
    points        INTEGER DEFAULT 0,
    scans         INTEGER DEFAULT 0,
    trust_score   FLOAT DEFAULT 1.0,
    co2_saved_kg  FLOAT DEFAULT 0,
    is_admin      BOOLEAN DEFAULT FALSE,
    is_verified   BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
  );

  -- Material rates: points per kg for each waste type
  CREATE TABLE IF NOT EXISTS material_rates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material    VARCHAR(50) UNIQUE NOT NULL,
    name_ru     VARCHAR(100) NOT NULL,
    name_kk     VARCHAR(100) NOT NULL,
    icon        VARCHAR(10) DEFAULT '♻️',
    points_per_kg FLOAT NOT NULL,
    co2_per_kg  FLOAT NOT NULL DEFAULT 0,
    description_ru TEXT,
    updated_at  TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS email_verifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email      VARCHAR(255) NOT NULL,
    name       VARCHAR(100) NOT NULL,
    username   VARCHAR(50),
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

  -- Seed material rates (points per kg, based on recycling market research)
  INSERT INTO material_rates (material, name_ru, name_kk, icon, points_per_kg, co2_per_kg, description_ru) VALUES
    ('plastic',    'Пластик',    'Пластик',   '♻️',  50,  1.5, 'PET, HDPE, PP бутылки и ёмкости. Промойте перед сдачей.'),
    ('glass',      'Стекло',     'Шыны',      '🫙',  30,  0.3, 'Стеклянные бутылки и банки. Снимайте крышки.'),
    ('paper',      'Бумага',     'Қағаз',     '📰',  20,  0.9, 'Газеты, журналы, офисная бумага. Не принимается мокрая.'),
    ('cardboard',  'Картон',     'Картон',    '📦',  25,  1.1, 'Коробки, упаковка. Сложите плоско.'),
    ('metal',      'Металл',     'Металл',    '🔩',  80,  2.0, 'Алюминиевые банки, жестяные консервы, металлолом.'),
    ('aluminum',   'Алюминий',   'Алюминий',  '🥤', 120,  9.0, 'Алюминиевые банки от напитков. Самый ценный материал.'),
    ('electronics','Электроника','Электроника','💻', 150,  5.0, 'Телефоны, ноутбуки, бытовая техника.'),
    ('batteries',  'Батарейки',  'Батарейка', '🔋', 100,  3.0, 'Пальчиковые, аккумуляторы. Сдавайте отдельно.'),
    ('textile',    'Текстиль',   'Тоқыма',    '👕',  15,  3.6, 'Одежда, ткани в хорошем состоянии.'),
    ('organic',    'Органика',   'Органика',  '🍃',  10,  0.5, 'Пищевые отходы, листья, растения.')
  ON CONFLICT (material) DO NOTHING;

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

// Migration: add columns that may be missing in existing databases
const MIGRATE_SQL = `
  ALTER TABLE transactions ADD COLUMN IF NOT EXISTS co2_saved FLOAT DEFAULT 0;
  ALTER TABLE transactions ADD COLUMN IF NOT EXISTS icon VARCHAR(10);
  ALTER TABLE users      ADD COLUMN IF NOT EXISTS co2_saved_kg FLOAT DEFAULT 0;
  ALTER TABLE users      ADD COLUMN IF NOT EXISTS username VARCHAR(50);
  ALTER TABLE users      ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
  ALTER TABLE email_verifications ADD COLUMN IF NOT EXISTS username VARCHAR(50);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;

  CREATE TABLE IF NOT EXISTS material_rates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material    VARCHAR(50) UNIQUE NOT NULL,
    name_ru     VARCHAR(100) NOT NULL,
    name_kk     VARCHAR(100) NOT NULL,
    icon        VARCHAR(10) DEFAULT '♻️',
    points_per_kg FLOAT NOT NULL,
    co2_per_kg  FLOAT NOT NULL DEFAULT 0,
    description_ru TEXT,
    updated_at  TIMESTAMP DEFAULT NOW()
  );

  INSERT INTO material_rates (material, name_ru, name_kk, icon, points_per_kg, co2_per_kg, description_ru) VALUES
    ('plastic',    'Пластик',    'Пластик',   '♻️',  50,  1.5, 'PET, HDPE, PP бутылки и ёмкости. Промойте перед сдачей.'),
    ('glass',      'Стекло',     'Шыны',      '🫙',  30,  0.3, 'Стеклянные бутылки и банки. Снимайте крышки.'),
    ('paper',      'Бумага',     'Қағаз',     '📰',  20,  0.9, 'Газеты, журналы, офисная бумага. Не принимается мокрая.'),
    ('cardboard',  'Картон',     'Картон',    '📦',  25,  1.1, 'Коробки, упаковка. Сложите плоско.'),
    ('metal',      'Металл',     'Металл',    '🔩',  80,  2.0, 'Алюминиевые банки, жестяные консервы, металлолом.'),
    ('aluminum',   'Алюминий',   'Алюминий',  '🥤', 120,  9.0, 'Алюминиевые банки от напитков. Самый ценный материал.'),
    ('electronics','Электроника','Электроника','💻', 150,  5.0, 'Телефоны, ноутбуки, бытовая техника.'),
    ('batteries',  'Батарейки',  'Батарейка', '🔋', 100,  3.0, 'Пальчиковые, аккумуляторы. Сдавайте отдельно.'),
    ('textile',    'Текстиль',   'Тоқыма',    '👕',  15,  3.6, 'Одежда, ткани в хорошем состоянии.'),
    ('organic',    'Органика',   'Органика',  '🍃',  10,  0.5, 'Пищевые отходы, листья, растения.')
  ON CONFLICT (material) DO NOTHING;

  -- Ensure admin account exists for ismagulshakarim0909@gmail.com
  UPDATE users SET is_admin = TRUE WHERE email = 'ismagulshakarim0909@gmail.com';
`;

async function initDB() {
  try {
    await pool.query(INIT_SQL);
    console.log('✅ Database initialized successfully');
    await pool.query(MIGRATE_SQL);
    console.log('✅ Migrations applied successfully');
  } catch (err) {
    console.error('❌ Database init error:', err.message);
  }
}

module.exports = { pool, initDB };
