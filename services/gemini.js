const https = require('https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Список моделей по приоритету — если одна недоступна, пробуем следующую
const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-pro',
];

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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
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
    }
  }
  throw lastError || new Error('Все модели Gemini недоступны');
}

module.exports = { askGemini };
