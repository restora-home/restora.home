// Общие утилиты для api/contact.js и api/telegram.js.
// Имя начинается с "_" — Vercel не публикует такие файлы как отдельный роут.

// Redis только через REST (Upstash) — без постоянных TCP-соединений,
// что подходит для serverless-функций. Поддерживает и переменные от
// Vercel Marketplace (KV_REST_API_*), и от Upstash напрямую (UPSTASH_REDIS_REST_*).
async function redis(...command) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`Redis: ${response.status} ${await response.text()}`);
  return (await response.json()).result;
}

function redisConfigured() {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
      (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
  );
}

async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!response.ok) throw new Error(`Telegram API: ${response.status} ${await response.text()}`);
  return true;
}

// Отправляет GIF/анимацию по прямой ссылке (Telegram сам её скачивает — файл
// не проходит через нашу функцию). caption поддерживает те же HTML-теги, что и sendMessage.
async function sendTelegramAnimation(chatId, animationUrl, caption) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendAnimation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, animation: animationUrl, caption, parse_mode: "HTML" }),
  });
  if (!response.ok) throw new Error(`Telegram API: ${response.status} ${await response.text()}`);
  return true;
}

// Обязательно перед вставкой пользовательских данных в HTML-сообщение Telegram —
// защита от инъекции тегов при parse_mode: "HTML"
function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Для api/admin-content.js и api/admin-save.js (визуальный редактор на /admin).
const crypto = require("crypto");

// Сравнение постоянной длины буфера — чтобы не давать утечку по времени ответа,
// на каком символе пароль разошёлся с ожидаемым
function verifyAdminPassword(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const provided = req.headers["x-admin-password"];
  if (typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function githubEnv() {
  return {
    token: process.env.GITHUB_TOKEN,
    owner: process.env.GITHUB_OWNER || "restora-home",
    repo: process.env.GITHUB_REPO || "restora.home",
    baseBranch: process.env.GITHUB_BASE_BRANCH || "main",
  };
}

async function githubApi(path, options) {
  options = options || {};
  const { token } = githubEnv();
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "restora-home-admin",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`GitHub API ${options.method || "GET"} ${path}: ${response.status} ${text}`);
  }
  return response.status === 204 ? null : response.json();
}

module.exports = {
  redis,
  redisConfigured,
  sendTelegramMessage,
  sendTelegramAnimation,
  escapeHtml,
  verifyAdminPassword,
  githubEnv,
  githubApi,
};
