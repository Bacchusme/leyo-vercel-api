// api/locals.js
// GET /api/locals - 获取 Locals 列表（头像通过 batch_get_tmp_download_url 获取临时公开链接）
const { queryRecords, getTenantToken } = require("../lib/feishu");

/**
 * 通过 batch_get_tmp_download_url 获取文件的临时公开下载链接
 * 该链接无需认证，浏览器可直接访问，有效期约 1 小时
 */
async function getTmpDownloadUrl(fileToken, token) {
  try {
    const url = `https://open.feishu.cn/open-apis/drive/v1/medias/batch_get_tmp_download_url?file_tokens=${fileToken}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await resp.json();
    if (data.code === 0 && data.data?.tmp_download_urls?.length > 0) {
      return data.data.tmp_download_urls[0].tmp_download_url;
    }
    console.log(`[avatar] batch_get_tmp code=${data.code} msg=${data.msg}`);
    return null;
  } catch (e) {
    console.log(`[avatar] batch_get_tmp error: ${e.message}`);
    return null;
  }
}

/**
 * 为一条 Local 解析头像临时链接
 */
async function resolveAvatarUrl(record, token) {
  const avatar = record.avatar;
  if (!avatar || !Array.isArray(avatar) || avatar.length === 0) return record;

  const att = avatar[0];

  // 优先用 file_token 获取临时下载链接
  if (att.file_token) {
    const tmpUrl = await getTmpDownloadUrl(att.file_token, token);
    if (tmpUrl) {
      record.avatar_url = tmpUrl;
      console.log(`[avatar] ✅ ${record.name}: tmp_url OK`);
      return record;
    }
  }

  // 兜底：直接用飞书返回的 url 字段
  if (att.url) {
    record.avatar_url = att.url;
    console.log(`[avatar] ⚠️ ${record.name}: fallback to direct url`);
    return record;
  }

  console.warn(`[avatar] ❌ ${record.name}: no url available`);
  return record;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "仅支持 GET 请求" });

  try {
    const { city } = req.query;
    let filter = null;
    if (city) {
      filter = `CurrentValue.[city] = "${city}"`;
    }

    const records = await queryRecords("locals", filter);
    console.log(`[/api/locals] Got ${records.length} records`);

    // 获取头像临时下载链接（纯 API 调用，不下载文件，很快）
    const token = await getTenantToken();
    const resolved = await Promise.all(
      records.map((r) => resolveAvatarUrl(r, token))
    );

    const withAvatar = resolved.filter((r) => r.avatar_url).length;
    console.log(`[/api/locals] Avatar URLs resolved: ${withAvatar}/${resolved.length}`);

    return res.status(200).json({
      success: true,
      data: resolved,
      total: resolved.length,
    });
  } catch (err) {
    console.error("[/api/locals] 错误:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "服务器内部错误",
    });
  }
};
