const https = require('https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Модели по приоритету (v1beta supports 2.0 models)
const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
];

const RETRY_DELAY_MS = 800;

const DEFAULT_SYSTEM = `Ты — EcoBot, AI-ассистент экологического приложения EcoSen (Казахстан).
Помогаешь пользователям правильно сортировать и сдавать мусор, находить пункты приёма вторсырья.
Отвечай дружелюбно, коротко и по делу. Используй эмодзи уместно.
Отвечай на языке вопроса (русский / казахский / английский).`;

const CHAT_SYSTEM = `Ты — EcoBot, живой AI-помощник приложения EcoSen (Казахстан).
Помогаешь разобраться с сортировкой и переработкой мусора.
Отвечай коротко, живо, как друг — не как справочник. Используй эмодзи.
Если вопрос не про экологию — мягко верни к теме.
Отвечай на языке вопроса (русский / казахский / английский).`;

/**
 * Вспомогательная функция: отправить запрос к одной модели.
 * system передаётся как первое сообщение user + model (workaround для v1 без system_instruction).
 */
function callGemini(model, contents, generationConfig) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify({ contents, generationConfig });
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message || 'Gemini API error'));
          const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) return reject(new Error('Пустой ответ от Gemini'));
          resolve(text.trim());
        } catch (e) { reject(new Error('Не удалось разобрать ответ Gemini')); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

/** Попробовать все модели по очереди */
async function tryModels(contents, generationConfig) {
  let lastError;
  for (const model of GEMINI_MODELS) {
    try {
      return await callGemini(model, contents, generationConfig);
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini] Fallback: ${model} failed → trying next`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  throw lastError || new Error('Все модели Gemini недоступны');
}

/**
 * Одиночный запрос (без истории).
 * Системный контекст встраивается через fake-диалог (workaround v1).
 */
async function askGemini(userMessage, systemContext = '') {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY не задан');
  const system = systemContext || DEFAULT_SYSTEM;

  // v1 не поддерживает system_instruction — эмулируем через первый обмен
  const contents = [
    { role: 'user',  parts: [{ text: system }] },
    { role: 'model', parts: [{ text: 'Понял, буду следовать этим инструкциям.' }] },
    { role: 'user',  parts: [{ text: userMessage }] },
  ];

  return tryModels(contents, { temperature: 0.7, maxOutputTokens: 1024 });
}

/**
 * Многоходовой чат с историей.
 */
async function askGeminiChat(userMessage, systemContext = '', history = []) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY не задан');
  const system = systemContext || CHAT_SYSTEM;

  const contents = [
    { role: 'user',  parts: [{ text: system }] },
    { role: 'model', parts: [{ text: 'Отлично, я готов помогать! 🌿' }] },
  ];

  for (const msg of history) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  }

  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  return tryModels(contents, { temperature: 0.85, maxOutputTokens: 512 });
}

module.exports = { askGemini, askGeminiChat };
