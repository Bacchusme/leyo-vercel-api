// api/locals.js
// GET /api/locals - 获取 Locals 列表（含服务端头像下载）
const { queryRecords, getTenantToken } = require("../lib/feishu");

/**
 * 服务端下载飞书图片，转为 base64 data URL
 * 浏览器无法直接加载飞书URL（跨域/鉴权），但Vercel服务端可以
 */
async function fetchAvatarAsBase64(url, token) {
  try {
    const headers = {};
    // 如果是飞书API URL，带上认证
    if (url.includes("open.feishu.cn")) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const resp = await fetch(url, { headers, redirect: "follow" });
    if (!resp.ok) return null;

    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await resp.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch (e) {
    console.error("[avatar-base64] Failed:", e.message);
    return null;
  }
}

/**
 * 为每条 Local 记录解析头像，优先转成 base64
 */
async function resolveAvatar(record, token) {
  const avatar = record.avatar;
  if (!avatar) return record;

  // 附件格式: [{url, file_token, name}]
  if (Array.isArray(avatar) && avatar.length > 0) {
    const att = avatar[0];

    // 方案1: 服务端下载飞书直链，转base64
    if (att.url) {
      const base64 = await fetchAvatarAsBase64(att.url, token);
      if (base64) {
        record.avatar_data = base64;
        return record;
      }
    }

    // 方案2: 用 batch_get_tmp_download_url 获取临时URL再下载
    if (att.file_token) {
      try {
        const signedUrl = `https://open.feishu.cn/open-apis/drive/v1/medias/batch_get_tmp_download_url?file_tokens=${att.file_token}`;
        const resp = await fetch(signedUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await resp.json();
        if (data.code === 0 && data.data?.tmp_download_urls?.length > 0) {
          const tmpUrl = data.data.tmp_download_urls[0].tmp_download_url;
          const base64 = await fetchAvatarAsBase64(tmpUrl, null);
          if (base64) {
            record.avatar_data = base64;
            return record;
          }
        }
      } catch (e) {
        console.error("[avatar-base64] batch_get_tmp failed:", e.message);
      }
    }

    // 方案3: 都失败，保留原始数据让前端走代理兜底
    console.warn("[avatar-base64] All methods failed for", record.name);
  }

  return record;
}

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "GET") {
    return res.status(405).json({ error: "仅支持 GET 请求" });
  }

  try {
    const { city } = req.query;

    // 构建筛选条件
    let filter = null;
    if (city) {
      filter = `CurrentValue.[city] = "${city}"`;
    }

    const records = await queryRecords("locals", filter);

    // 服务端下载头像，转为base64
    const token = await getTenantToken();
    const resolved = await Promise.all(
      records.map((r) => resolveAvatar(r, token))
    );

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
