/**
 * AI service — Groq API (FREE)
 * Drop-in replacement for the previous Gemini service.
 * Exports the same functions: askGemini, askGeminiChat
 *
 * Set GROQ_API_KEY in your environment variables.
 * Get a FREE key at: https://console.groq.com
 * Free tier: 14,400 requests/day, no credit card needed!
 */

const https = require('https');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.1-8b-instant'; // Fast, free, great for chat

const DEFAULT_SYSTEM = `Ты — EcoBot, AI-ассистент экологического приложения EcoSen (Казахстан).
Помогаешь пользователям правильно сортировать и сдавать мусор, находить пункты приёма вторсырья.
Отвечай дружелюбно, коротко и по делу. Используй эмодзи уместно.
Отвечай на языке вопроса (русский / казахский / английский).`;

const CHAT_SYSTEM = `Ты — EcoBot, живой AI-помощник приложения EcoSen (Казахстан).
Помогаешь разобраться с сортировкой и переработкой мусора.
Отвечай коротко, живо, как друг — не как справочник. Используй эмодзи.
Если вопрос не про экологию — мягко верни к теме.
Отвечай на языке вопроса (русский / казахский / английский).`;

function callGroq(system, messages, maxTokens = 1024) {
  return new Promise((resolve, reject) => {
    if (!GROQ_API_KEY) {
      return reject(new Error('GROQ_API_KEY не задан'));
    }

    const bodyStr = JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        ...messages,
      ],
    });

    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message || 'Groq API error'));
          const text = json?.choices?.[0]?.message?.content;
          if (!text) return reject(new Error('Пустой ответ от Groq'));
          resolve(text.trim());
        } catch (e) {
          reject(new Error('Не удалось разобрать ответ Groq'));
        }
      });
    });

    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function askGemini(userMessage, systemContext = '') {
  const system = systemContext || DEFAULT_SYSTEM;
  const messages = [{ role: 'user', content: userMessage }];
  return callGroq(system, messages, 1024);
}

async function askGeminiChat(userMessage, systemContext = '', history = []) {
  const system = systemContext || CHAT_SYSTEM;

  const messages = [];
  for (const msg of history) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  messages.push({ role: 'user', content: userMessage });

  return callGroq(system, messages, 512);
}

module.exports = { askGemini, askGeminiChat };
