// Отдаёт редактору GrapesJS (/admin) содержимое одной из разрешённых страниц:
// только фрагмент между метками ADMIN:EDITABLE (см. index.html/uslugi/*.html) —
// остальное (head, скрипты, разметка модалки/анимаций) редактор никогда не видит и не трогает.
const { verifyAdminPassword, githubEnv, githubApi } = require("./_lib");

const ALLOWED_PATHS = [
  "index.html",
  "uslugi/fasady-montazh.html",
  "uslugi/otdelka-elektromontazh.html",
  "uslugi/vosstanovlenie-domov.html",
];

const START_MARKER = "<!-- ADMIN:EDITABLE:START -->";
const END_MARKER = "<!-- ADMIN:EDITABLE:END -->";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!verifyAdminPassword(req)) return res.status(401).json({ error: "Неверный пароль" });
  if (!process.env.GITHUB_TOKEN) return res.status(500).json({ error: "GITHUB_TOKEN не настроен" });

  const filePath = String(req.query.path || "");
  if (!ALLOWED_PATHS.includes(filePath)) return res.status(400).json({ error: "Файл не из списка разрешённых" });

  try {
    const { owner, repo, baseBranch } = githubEnv();
    const file = await githubApi(`/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(baseBranch)}`);
    const full = Buffer.from(file.content, "base64").toString("utf8");

    const startIdx = full.indexOf(START_MARKER);
    const endIdx = full.indexOf(END_MARKER);
    if (startIdx === -1 || endIdx === -1) {
      return res.status(500).json({ error: "В файле нет меток редактируемой области" });
    }
    const html = full.slice(startIdx + START_MARKER.length, endIdx).trim();

    const sharedStyleMatch = full.match(/<style>([\s\S]*?)<\/style>/);
    const adminStyleMatch = full.match(/<style id="admin-generated">([\s\S]*?)<\/style>/);

    return res.status(200).json({
      html,
      sharedCss: sharedStyleMatch ? sharedStyleMatch[1] : "",
      adminCss: adminStyleMatch ? adminStyleMatch[1].trim() : "",
    });
  } catch (err) {
    console.error("admin-content error:", err);
    return res.status(500).json({ error: "Не получилось загрузить файл из GitHub" });
  }
};
