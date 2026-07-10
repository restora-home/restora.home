// Приём заявок с сайта: пересылает email (Resend) и Telegram (все авторизованные чаты) параллельно.
// Заявка считается доставленной, если сработал хотя бы один канал.
const { Resend } = require("resend");
const { redis, redisConfigured, sendTelegramMessage, escapeHtml } = require("./_lib");

const TO_EMAIL = process.env.TO_EMAIL || "";
const FROM_EMAIL = process.env.FROM_EMAIL || "Restora Home <onboarding@resend.dev>";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body || {};
  const name = String(body.name || "").trim().slice(0, 100);
  const phone = String(body.phone || "").trim().slice(0, 40);
  const message = String(body.message || "").trim().slice(0, 1000);
  const topic = String(body.topic || "Заявка с сайта").trim().slice(0, 200);

  if (!name) return res.status(400).json({ error: "Укажите имя" });
  const phoneDigits = phone.replace(/\D/g, "");
  if (phoneDigits.length < 10) return res.status(400).json({ error: "Проверьте номер телефона" });

  const lead = { name, phone, message, topic, date: new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) };

  const [emailResult, telegramResult] = await Promise.allSettled([sendEmail(lead), notifyTelegram(lead)]);

  if (emailResult.status === "rejected") console.error("Email send failed:", emailResult.reason);
  if (telegramResult.status === "rejected") console.error("Telegram notify failed:", telegramResult.reason);

  const delivered = emailResult.status === "fulfilled" || (telegramResult.status === "fulfilled" && telegramResult.value);
  if (!delivered) return res.status(500).json({ error: "Не получилось отправить заявку, попробуйте позже" });
  return res.status(200).json({ ok: true });
};

async function notifyTelegram(lead) {
  const text =
    `🔔 <b>Новая заявка</b> — ${escapeHtml(lead.topic)}\n` +
    `👤 ${escapeHtml(lead.name)}\n` +
    `📞 ${escapeHtml(lead.phone)}` +
    (lead.message ? `\n💬 ${escapeHtml(lead.message)}` : "") +
    `\n🕐 ${escapeHtml(lead.date)}`;

  const chatIds = new Set();
  if (process.env.TELEGRAM_CHAT_ID) chatIds.add(String(process.env.TELEGRAM_CHAT_ID));
  if (redisConfigured()) {
    const authorized = (await redis("SMEMBERS", "authorized_chats")) || [];
    authorized.forEach((id) => chatIds.add(String(id)));
  }
  if (chatIds.size === 0) return false;

  const results = await Promise.allSettled([...chatIds].map((id) => sendTelegramMessage(id, text)));
  return results.some((r) => r.status === "fulfilled" && r.value);
}

async function sendEmail(lead) {
  if (!process.env.RESEND_API_KEY || !TO_EMAIL) throw new Error("Resend не настроен");
  const resend = new Resend(process.env.RESEND_API_KEY);
  // Resend SDK не бросает исключение при ошибке API — она приходит как
  // { data: null, error: {...} } в успешно резолвленном промисе, поэтому
  // проверяем result.error вручную и бросаем сами, иначе Promise.allSettled
  // считает отправку успешной, даже если письмо не ушло
  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to: TO_EMAIL,
    subject: `Новая заявка — ${lead.name} (${lead.topic})`,
    html:
      `<h2>Новая заявка с сайта</h2>` +
      `<p><b>Тема:</b> ${escapeHtml(lead.topic)}</p>` +
      `<p><b>Имя:</b> ${escapeHtml(lead.name)}</p>` +
      `<p><b>Телефон:</b> ${escapeHtml(lead.phone)}</p>` +
      (lead.message ? `<p><b>Комментарий:</b> ${escapeHtml(lead.message)}</p>` : "") +
      `<p><b>Дата:</b> ${escapeHtml(lead.date)}</p>`,
  });
  if (result.error) throw new Error(result.error.message || "Resend error");
  return result;
}
