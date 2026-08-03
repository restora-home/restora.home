// Принимает HTML/CSS, собранные GrapesJS на /admin, и коммитит их в GitHub:
// создаёт отдельную ветку от актуального main, подменяет там только фрагмент
// между метками ADMIN:EDITABLE (head/скрипты/структура модалки и анимаций не
// трогаются) и открывает Pull Request — на сайт правки попадают только после
// ручного мержа, ничего не публикуется напрямую.
const { verifyAdminPassword, githubEnv, githubApi } = require("./_lib");

const ALLOWED_PATHS = [
  "index.html",
  "uslugi/fasady-montazh.html",
  "uslugi/otdelka-elektromontazh.html",
  "uslugi/vosstanovlenie-domov.html",
];

const START_MARKER = "<!-- ADMIN:EDITABLE:START -->";
const END_MARKER = "<!-- ADMIN:EDITABLE:END -->";
const ADMIN_STYLE_RE = /\n?<style id="admin-generated">[\s\S]*?<\/style>\n?/;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!verifyAdminPassword(req)) return res.status(401).json({ error: "Неверный пароль" });
  if (!process.env.GITHUB_TOKEN) return res.status(500).json({ error: "GITHUB_TOKEN не настроен" });

  const body = req.body || {};
  const filePath = String(body.path || "");
  const html = String(body.html || "").trim();
  const css = String(body.css || "").trim();

  if (!ALLOWED_PATHS.includes(filePath)) return res.status(400).json({ error: "Файл не из списка разрешённых" });
  if (!html) return res.status(400).json({ error: "Пустое содержимое страницы" });

  try {
    const { owner, repo, baseBranch } = githubEnv();

    const file = await githubApi(`/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(baseBranch)}`);
    const full = Buffer.from(file.content, "base64").toString("utf8");

    const startIdx = full.indexOf(START_MARKER);
    const endIdx = full.indexOf(END_MARKER);
    if (startIdx === -1 || endIdx === -1) {
      return res.status(500).json({ error: "В файле нет меток редактируемой области" });
    }

    let updated = full.slice(0, startIdx + START_MARKER.length) + "\n" + html + "\n" + full.slice(endIdx);

    updated = updated.replace(ADMIN_STYLE_RE, "\n");
    if (css) {
      updated = updated.replace("</head>", `<style id="admin-generated">\n${css}\n</style>\n</head>`);
    }

    const baseRef = await githubApi(`/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`);
    const baseSha = baseRef.object.sha;

    const branchName = `admin/${filePath.replace(/[/.]/g, "-")}-${Date.now()}`;
    await githubApi(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
    });

    await githubApi(`/repos/${owner}/${repo}/contents/${filePath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Правки через /admin: ${filePath}`,
        content: Buffer.from(updated, "utf8").toString("base64"),
        sha: file.sha,
        branch: branchName,
      }),
    });

    const pr = await githubApi(`/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Правки через /admin: ${filePath}`,
        head: branchName,
        base: baseBranch,
        body: "Автоматический Pull Request из визуального редактора GrapesJS (/admin). Проверь превью перед мержем.",
      }),
    });

    return res.status(200).json({ ok: true, prUrl: pr.html_url });
  } catch (err) {
    console.error("admin-save error:", err);
    return res.status(500).json({ error: "Не получилось сохранить: " + err.message });
  }
};
