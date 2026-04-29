const express = require('express');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ── Waste advice database ─────────────────────────────────────────────────────
// Extended static knowledge + dynamic Claude API call for unknown/complex queries
const WASTE_ADVICE = {
  plastic: {
    icon: '🧴',
    name: 'Пластик',
    co2_rate: '1.5 кг CO₂ на 1 кг',
    recyclable: true,
    preparation: [
      'Промойте контейнер от остатков еды',
      'Снимите крышки и этикетки если возможно',
      'Сожмите бутылки для экономии места',
      'Сортируйте по маркировке: ПЭТ (1), ПНВД (2), ПВХ (3), ПВНП (4), ПП (5)',
    ],
    where: 'Пункты приёма пластика, жёлтые баки для вторсырья',
    not_recyclable: ['Загрязнённый пластик', 'Многослойная упаковка (тетрапак)', 'Пластиковые пакеты (в большинстве пунктов)'],
    eco_fact: 'Переработка 1 кг пластика экономит 1.5 кг CO₂ и 2 литра нефти',
  },
  glass: {
    icon: '🫙',
    name: 'Стекло',
    co2_rate: '0.3 кг CO₂ на 1 кг',
    recyclable: true,
    preparation: [
      'Промойте тару от остатков',
      'Удалите металлические крышки (сдайте отдельно)',
      'Не смешивайте с керамикой и хрусталём',
    ],
    where: 'Зелёные баки для стекла, пункты приёма',
    not_recyclable: ['Зеркала', 'Оконное стекло', 'Жаропрочное стекло (Pyrex)', 'Хрусталь', 'Лампочки'],
    eco_fact: 'Стекло можно перерабатывать бесконечное количество раз без потери качества',
  },
  paper: {
    icon: '📄',
    name: 'Бумага',
    co2_rate: '0.9 кг CO₂ на 1 кг',
    recyclable: true,
    preparation: [
      'Удалите скрепки и скотч',
      'Не мочите бумагу',
      'Сложите и перевяжите стопки',
      'Отделите газеты от картона',
    ],
    where: 'Синие баки для бумаги, пункты приёма макулатуры',
    not_recyclable: ['Мокрая бумага', 'Бумага с пищевыми загрязнениями', 'Термобумага (чеки)', 'Ламинированная бумага'],
    eco_fact: 'Из 1 тонны макулатуры получают 800 кг новой бумаги, экономя 17 деревьев',
  },
  cardboard: {
    icon: '📦',
    name: 'Картон',
    co2_rate: '0.7 кг CO₂ на 1 кг',
    recyclable: true,
    preparation: [
      'Разберите коробки и сложите плоско',
      'Удалите скотч, скрепки, упаковочную плёнку',
      'Уберите остатки пищи из пицца-боксов',
    ],
    where: 'Пункты приёма макулатуры и картона',
    not_recyclable: ['Пицца-боксы с жирными пятнами', 'Тетрапак (многослойный)', 'Ламинированный картон'],
    eco_fact: 'Переработка картона требует на 75% меньше энергии, чем производство нового',
  },
  metal: {
    icon: '🥫',
    name: 'Металл',
    co2_rate: '2.0 кг CO₂ на 1 кг',
    recyclable: true,
    preparation: [
      'Промойте банки от остатков еды',
      'Сожмите алюминиевые банки',
      'Отделите чёрный металл от цветного',
      'Снимите крышки с жестяных банок',
    ],
    where: 'Пункты приёма металлолома, красные баки для металла',
    not_recyclable: ['Аэрозольные баллоны (сдавайте отдельно)', 'Краска/химикаты в металлических ёмкостях'],
    eco_fact: 'Алюминий можно перерабатывать бесконечно. Переработка экономит 95% энергии vs производство',
  },
  aluminum: {
    icon: '🥤',
    name: 'Алюминий',
    co2_rate: '9.0 кг CO₂ на 1 кг',
    recyclable: true,
    preparation: [
      'Промойте банки',
      'Сожмите для экономии места',
      'Соберите фольгу отдельно',
    ],
    where: 'Пункты приёма алюминия, вендинговые аппараты-переработчики',
    not_recyclable: ['Алюминий с лаковым покрытием (некоторые виды)'],
    eco_fact: 'Алюминиевая банка возвращается на полку в виде новой банки всего за 60 дней',
  },
  electronics: {
    icon: '💻',
    name: 'Электроника',
    co2_rate: 'высокий',
    recyclable: true,
    preparation: [
      'Удалите личные данные с устройств',
      'Извлеките батарейки (сдайте отдельно)',
      'Не разбирайте устройства самостоятельно',
    ],
    where: 'Специализированные пункты приёма электроники, магазины (Kaspi, DNS)',
    not_recyclable: [],
    eco_fact: 'Один смартфон содержит до 60 различных металлов, многие из которых редкоземельные',
  },
  battery: {
    icon: '🔋',
    name: 'Батарейки',
    co2_rate: 'критически опасны для почвы',
    recyclable: true,
    preparation: [
      'Не выбрасывайте в обычный мусор!',
      'Соберите в контейнер или пакет',
      'Не перегревайте и не прокалывайте',
    ],
    where: 'Специальные красные боксы в супермаркетах, торговых центрах, пунктах приёма',
    not_recyclable: [],
    eco_fact: '1 батарейка загрязняет 20 м² почвы и 200 литров воды токсичными веществами',
  },
  organic: {
    icon: '🍎',
    name: 'Органические отходы',
    co2_rate: 'Метан при гниении на полигоне',
    recyclable: true,
    preparation: [
      'Отделите от неорганического мусора',
      'Используйте компостер если есть',
      'Не смешивайте с мясом и рыбой в домашнем компосте',
    ],
    where: 'Компостеры, специализированные пункты органических отходов',
    not_recyclable: ['Мясо и рыба (для домашнего компоста)'],
    eco_fact: 'Компостирование уменьшает выброс метана и создаёт ценное удобрение',
  },
  textile: {
    icon: '👕',
    name: 'Текстиль и одежда',
    co2_rate: '~5 кг CO₂ за сохранённую единицу',
    recyclable: true,
    preparation: [
      'Чистые вещи — в пункты сдачи одежды',
      'Грязный/рваный текстиль — в специальные баки',
      'Упакуйте в пакет',
    ],
    where: 'Баки H&M, пункты "Одежда в дар", фонды помощи',
    not_recyclable: ['Сильно загрязнённый текстиль'],
    eco_fact: 'Производство 1 кг хлопка требует 10 000 литров воды. Повторное использование = огромная экономия',
  },
};

// ── GET /api/ai/advice/:material ──────────────────────────────────────────────
// Called after your ML model identifies waste type. Returns recycling advice.
router.get('/advice/:material', authMiddleware, async (req, res) => {
  try {
    const key = req.query.material_key || req.params.material.toLowerCase().trim();
    const advice = WASTE_ADVICE[key];

    if (advice) {
      return res.json({
        found: true,
        material: key,
        ...advice,
      });
    }

    // Unknown material — return generic advice + flag for future addition
    return res.json({
      found: false,
      material: key,
      icon: '♻️',
      name: key,
      recyclable: null,
      preparation: ['Уточните тип материала у оператора пункта приёма'],
      where: 'Обратитесь в ближайший пункт приёма для уточнения',
      not_recyclable: [],
      eco_fact: 'Сортировка отходов — первый шаг к чистой планете',
      note: 'Материал не найден в базе. Пожалуйста, уточните тип.',
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /api/ai/advice ───────────────────────────────────────────────────────
// Called with your ML model's result: { material, confidence, label }
// Returns advice + points preview based on weight
router.post('/advice', authMiddleware, async (req, res) => {
  try {
    const { material, confidence, weight_kg, station_id } = req.body;
    if (!material) return res.status(400).json({ error: 'material обязателен' });

    const key = material.toLowerCase().trim();
    const advice = WASTE_ADVICE[key] || null;

    // Points preview
    let points_preview = null;
    if (weight_kg && station_id) {
      const stRes = await require('../db').pool.query(
        'SELECT material_rates FROM stations WHERE id=$1', [station_id]
      );
      if (stRes.rows.length) {
        const rates = stRes.rows[0].material_rates;
        const rate = rates[key] ?? 5;
        points_preview = Math.round(weight_kg * rate);
      }
    }

    res.json({
      material: key,
      confidence: confidence || null,
      advice: advice || {
        icon: '♻️',
        name: material,
        preparation: ['Уточните у оператора пункта приёма'],
        where: 'Ближайший пункт приёма',
        eco_fact: 'Каждый кг переработанного мусора помогает планете',
      },
      points_preview,
      co2_preview: weight_kg ? require('../services/achievements').calcCO2(key, weight_kg) : null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── GET /api/ai/materials ─────────────────────────────────────────────────────
// List all known materials (for ML model label mapping)
router.get('/materials', (req, res) => {
  const list = Object.entries(WASTE_ADVICE).map(([key, v]) => ({
    key,
    name: v.name,
    icon: v.icon,
    recyclable: v.recyclable,
    co2_rate: v.co2_rate,
  }));
  res.json(list);
});

module.exports = router;


// ── POST /api/ai/waste-advice ─────────────────────────────────────────────────
// ML модуль определил тип мусора → Gemini даёт персональные инструкции
// Body: { material: string, confidence: number, lang?: 'ru'|'kk'|'en' }
// Returns: { instructions: string, steps: string[], eco_tip: string, urgency: string }
router.post('/waste-advice', authMiddleware, async (req, res) => {
  try {
    const { material, confidence, lang = 'ru' } = req.body;
    if (!material) return res.status(400).json({ error: 'material обязателен' });

    const key = material.toLowerCase().trim();
    const staticData = WASTE_ADVICE[key] || null;

    // Формируем контекст из статичных данных для более точного ответа
    const staticContext = staticData ? `
Известная информация о материале:
- Куда сдавать: ${staticData.where}
- Нельзя сдавать: ${staticData.not_recyclable?.join(', ') || 'нет ограничений'}
- CO2 эффект: ${staticData.co2_rate}
- Подготовка (базовая): ${staticData.preparation?.join('; ')}
` : '';

    const langInstruction = lang === 'kk'
      ? 'Отвечай на казахском языке.'
      : lang === 'en'
      ? 'Answer in English.'
      : 'Отвечай на русском языке.';

    const confidenceNote = confidence >= 0.8
      ? 'Модель определила тип с высокой уверенностью.'
      : confidence >= 0.5
      ? 'Модель определила тип со средней уверенностью.'
      : 'Модель определила тип с низкой уверенностью, возможна ошибка.';

    const prompt = `Ты — EcoBot, помощник по переработке мусора в Казахстане.
${langInstruction}

Пользователь сфотографировал мусор. ML-модель определила тип: "${material}" (${(confidence * 100).toFixed(0)}% уверенность).
${confidenceNote}
${staticContext}

Дай КОНКРЕТНЫЕ пошаговые инструкции что делать с этим мусором прямо сейчас.
Будь практичным и кратким. Учитывай реалии Казахстана.

Ответь СТРОГО в JSON (без markdown, без комментариев):
{
  "instructions": "Одно предложение — главное действие",
  "steps": ["шаг 1", "шаг 2", "шаг 3"],
  "eco_tip": "Один интересный экофакт об этом материале",
  "urgency": "now" | "soon" | "special"
}

urgency: "now" = можно выбросить в обычный бак, "soon" = нужен специальный пункт, "special" = опасный материал требует особого обращения.`;

    // Пробуем Gemini, при ошибке — graceful fallback на статичные данные
    let raw = null;
    try {
      raw = await askGemini(prompt);
    } catch (geminiErr) {
      console.warn('[AI /waste-advice] Gemini unavailable, using static fallback:', geminiErr.message);
    }

    if (!raw) {
      // Gemini недоступен — возвращаем статичный ответ (не 502!)
      return res.json({
        material: key,
        instructions: staticData ? `Сдайте в: ${staticData.where}` : 'Сдайте в ближайший пункт приёма вторсырья.',
        steps: staticData?.preparation || ['Уточните тип материала', 'Найдите ближайший пункт приёма'],
        eco_tip: staticData?.eco_fact || 'Каждый сданный килограмм снижает нагрузку на полигоны.',
        urgency: (key === 'battery' || key === 'electronics') ? 'special' : 'soon',
        where: staticData?.where || null,
        icon: staticData?.icon || '♻️',
        fallback: true,
      });
    }

    const clean = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      console.warn('[AI /waste-advice] JSON parse failed, using static fallback');
      return res.json({
        material: key,
        instructions: staticData ? `Сдайте в: ${staticData.where}` : raw.trim(),
        steps: staticData?.preparation || [],
        eco_tip: staticData?.eco_fact || '',
        urgency: 'soon',
        where: staticData?.where || null,
        icon: staticData?.icon || '♻️',
        fallback: true,
      });
    }

    res.json({
      material: key,
      ...parsed,
      where: staticData?.where || null,
      icon: staticData?.icon || '♻️',
    });

  } catch (err) {
    console.error('[AI /waste-advice] error:', err.message);
    if (err.message.includes('GEMINI_API_KEY')) {
      return res.status(503).json({ error: 'AI-ассистент не настроен' });
    }
    res.status(502).json({ error: 'Ошибка AI. Попробуйте позже.' });
  }
});

// ── POST /api/ai/chat ─────────────────────────────────────────────────────────
// Чат с EcoBot (Gemini). Body: { message: string, context?: string, history?: [{role, content}] }
// Требует авторизации.
const { askGemini, askGeminiChat } = require('../services/gemini');

router.post('/chat', authMiddleware, async (req, res) => {
  try {
    const { message, context, history = [] } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Поле message обязательно' });
    }
    if (message.length > 1000) {
      return res.status(400).json({ error: 'Сообщение слишком длинное (макс. 1000 символов)' });
    }

    const reply = await askGeminiChat(message.trim(), context || '', history);
    res.json({ reply });
  } catch (err) {
    console.error('[AI /chat] Gemini error:', err.message);
    if (err.message.includes('GEMINI_API_KEY')) {
      return res.status(503).json({ error: 'AI-ассистент не настроен' });
    }
    res.status(502).json({ error: 'Ошибка AI-ассистента. Попробуйте позже.' });
  }
});

// ── POST /api/ai/analyze ──────────────────────────────────────────────────────
// Gemini анализирует тип мусора по описанию.
// Body: { description: string }  → { material, advice, eco_tip }
router.post('/analyze', authMiddleware, async (req, res) => {
  try {
    const { description } = req.body;
    if (!description || typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ error: 'Поле description обязательно' });
    }

    const prompt = `Пользователь описывает предмет для утилизации: "${description.trim()}"

Определи тип материала (plastic/glass/paper/cardboard/metal/aluminum/electronics/battery/organic/textile/other).
Дай краткий совет по утилизации (2-3 предложения) и один интересный экологический факт.

Ответь строго в JSON формате:
{
  "material": "<ключ материала>",
  "material_name": "<название на русском>",
  "recyclable": true/false,
  "advice": "<совет по утилизации>",
  "eco_tip": "<экологический факт>"
}`;

    const raw = await askGemini(prompt);
    // Strip possible markdown fences
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Enrich with static data if available
    const staticData = WASTE_ADVICE[parsed.material] || null;

    res.json({
      ...parsed,
      where: staticData?.where || null,
      preparation: staticData?.preparation || [],
    });
  } catch (err) {
    console.error('[AI /analyze] error:', err.message);
    res.status(502).json({ error: 'Ошибка анализа. Попробуйте позже.' });
  }
});
