const https = require('https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Актуальные модели по приоритету (v1 API, 2025)
const GEMINI_MODELS = [
  'gemini-2.0-flash-lite',  // быстрая и дешёвая
  'gemini-2.0-flash',       // баланс скорость/качество
  'gemini-1.5-flash',       // fallback
];

// Задержка между попытками (мс)
const RETRY_DELAY_MS = 1000;

/**
 * Send a message to Gemini and get a text reply.
 * @param {string} userMessage
 * @param {string} [systemContext]  - optional system-level context
 * @returns {Promise<string>}
 */
async function askGemini(userMessage, systemContext = '') {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY не задан в переменных окружения');
  }

  const systemInstruction = systemContext || `Ты — EcoBot, AI-ассистент экологического приложения EcoSen.
Ты помогаешь пользователям:
- Понять, как правильно сортировать и сдавать мусор
- Узнать, где находятся пункты приёма вторсырья
- Получить советы по экологичному образу жизни
- Разобраться в вопросах переработки отходов в Казахстане

Отвечай дружелюбно, коротко и по делу. Используй эмодзи уместно.
Всегда отвечай на том же языке, на котором задан вопрос (русский/казахский/английский).`;

  const body = JSON.stringify({
    system_instruction: {
      parts: [{ text: systemInstruction }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userMessage }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  });

  // Пробуем каждую модель по очереди пока одна не ответит успешно
  async function tryModel(model) {
    return new Promise((resolve, reject) => {
      const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              console.warn(`[Gemini] Model ${model} error: ${json.error.message}`);
              return reject(new Error(json.error.message || 'Gemini API error'));
            }
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) return reject(new Error('Пустой ответ от Gemini'));
            resolve(text.trim());
          } catch (e) {
            reject(new Error('Не удалось разобрать ответ Gemini'));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  let lastError;
  for (const model of GEMINI_MODELS) {
    try {
      const result = await tryModel(model);
      return result;
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini] Fallback: ${model} failed → trying next`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  throw lastError || new Error('Все модели Gemini недоступны');
}

/**
 * Multi-turn chat with conversation history.
 * @param {string} userMessage - latest user message
 * @param {string} systemContext - system prompt
 * @param {Array<{role: string, content: string}>} history - previous messages
 */
async function askGeminiChat(userMessage, systemContext = '', history = []) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY не задан в переменных окружения');
  }

  const systemInstruction = systemContext || `Ты — EcoBot, AI-ассистент экологического приложения EcoSen для Казахстана.
Ты помогаешь пользователям разобраться с сортировкой и сдачей мусора.
Отвечай дружелюбно, живо, коротко — как настоящий помощник в чате.
Используй эмодзи уместно. Не пиши длинные списки без необходимости.
Если вопрос не про экологию — мягко верни разговор к теме.
Отвечай на языке вопроса (русский/казахский/английский).`;

  // Формируем историю в формате Gemini
  const contents = [];
  for (const msg of history) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  }
  // Добавляем новое сообщение пользователя
  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: { temperature: 0.85, maxOutputTokens: 512 },
  });

  async function tryModel(model) {
    return new Promise((resolve, reject) => {
      const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
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
      req.write(body);
      req.end();
    });
  }

  let lastError;
  for (const model of GEMINI_MODELS) {
    try {
      return await tryModel(model);
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini] Chat fallback: ${model} failed → trying next`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  throw lastError || new Error('Все модели Gemini недоступны');
}

module.exports = { askGemini, askGeminiChat };
