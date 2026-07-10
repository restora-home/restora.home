// Webhook Telegram-бота: любой человек находит бота и вводит пароль,
// после чего его chat_id добавляется в Redis-set "authorized_chats".
// Заявки с сайта (api/contact.js) рассылаются всем id из этого сета.
const { redis, redisConfigured, sendTelegramMessage } = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Секрет подтверждает, что запрос реально пришёл от Telegram (задаётся при setWebhook)
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const message = req.body?.message;
  const chatId = message?.chat?.id;
  const text = String(message?.text ?? "").trim();

  // Всегда отвечаем 200, иначе Telegram будет бесконечно ретраить доставку
  if (!chatId || !text) return res.status(200).json({ ok: true });

  try {
    await handleMessage(chatId, text);
  } catch (err) {
    console.error("Telegram webhook error:", err);
  }
  return res.status(200).json({ ok: true });
};

async function handleMessage(chatId, text) {
  if (!redisConfigured()) {
    return sendTelegramMessage(chatId, "⚠️ Хранилище не подключено. Обратитесь к администратору сайта.");
  }

  const password = process.env.BOT_PASSWORD;
  const isOwner = String(chatId) === String(process.env.TELEGRAM_CHAT_ID || "");
  const isAuthorized = isOwner || (await redis("SISMEMBER", "authorized_chats", String(chatId))) === 1;

  if (!isAuthorized) {
    if (text === "/start") {
      return sendTelegramMessage(chatId, "🏠 Restora Home\n\nВведите пароль, чтобы получать заявки с сайта в этот чат.");
    }
    if (!password) return sendTelegramMessage(chatId, "⚠️ Пароль доступа не настроен администратором.");
    if (text === password) {
      await redis("SADD", "authorized_chats", String(chatId));
      return sendTelegramMessage(chatId, "✅ Готово! Заявки с сайта будут приходить в этот чат.\n\nОтключить рассылку: /logout");
    }
    return sendTelegramMessage(chatId, "❌ Неверный пароль. Попробуйте ещё раз.");
  }

  if (text === "/logout") {
    await redis("SREM", "authorized_chats", String(chatId));
    return sendTelegramMessage(chatId, "🔒 Рассылка отключена. Введите пароль ещё раз, чтобы вернуться.");
  }

  return sendTelegramMessage(chatId, "✅ Вы получаете заявки с сайта Restora Home.\nОтключить: /logout");
}
