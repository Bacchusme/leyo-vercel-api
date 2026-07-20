// api/locals.js
// GET /api/locals - 获取 Locals 列表（含服务端头像下载转base64）
const { queryRecords, getTenantToken } = require("../lib/feishu");

/**
 * 尝试下载图片URL并转为base64 data URL
 * @param {string} url - 图片URL（预签名URL不需要auth）
 * @param {object} [opts] - 可选配置
 * @param {string} [opts.authToken] - 飞书tenant token（用于需要认证的URL）
 * @returns {string|null} base64 data URL 或 null
 */
async function fetchAsBase64(url, opts = {}) {
  try {
    const headers = {};
    if (opts.authToken) {
      headers["Authorization"] = `Bearer ${opts.authToken}`;
    }
    const resp = await fetch(url, { headers, redirect: "follow" });
    if (!resp.ok) {
      console.log(`[avatar] fetch failed: ${url.substring(0, 80)}... HTTP ${resp.status}`);
      return null;
    }
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      console.log(`[avatar] not an image: ${contentType}`);
      return null;
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length < 100) {
      console.log(`[avatar] too small: ${buffer.length} bytes`);
      return null;
    }
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch (e) {
    console.log(`[avatar] fetch error: ${e.message}`);
    return null;
  }
}

/**
 * 为一条 Local 解析头像为 base64
 */
async function resolveAvatar(record, token) {
  const avatar = record.avatar;
  if (!avatar || !Array.isArray(avatar) || avatar.length === 0) return record;

  const att = avatar[0];
  console.log(`[avatar] Processing: ${record.name}, url=${att.url ? att.url.substring(0, 60) + '...' : 'none'}, token=${att.file_token || 'none'}`);

  // 方案1: 直接fetch飞书返回的URL（预签名URL，不加auth header）
  if (att.url) {
    const base64 = await fetchAsBase64(att.url);
    if (base64) {
      console.log(`[avatar] ✅ ${record.name}: direct URL base64 OK (${(base64.length / 1024).toFixed(0)}KB)`);
      record.avatar_data = base64;
      return record;
    }
  }

  // 方案2: 带auth header再试一次
  if (att.url) {
    const base64 = await fetchAsBase64(att.url, { authToken: token });
    if (base64) {
      console.log(`[avatar] ✅ ${record.name}: auth URL base64 OK (${(base64.length / 1024).toFixed(0)}KB)`);
      record.avatar_data = base64;
      return record;
    }
  }

  // 方案3: batch_get_tmp_download_url
  if (att.file_token) {
    try {
      const tmpResp = await fetch(
        `https://open.feishu.cn/open-apis/drive/v1/medias/batch_get_tmp_download_url?file_tokens=${att.file_token}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const tmpData = await tmpResp.json();
      if (tmpData.code === 0 && tmpData.data?.tmp_download_urls?.length > 0) {
        const tmpUrl = tmpData.data.tmp_download_urls[0].tmp_download_url;
        const base64 = await fetchAsBase64(tmpUrl);
        if (base64) {
          console.log(`[avatar] ✅ ${record.name}: tmp_url base64 OK`);
          record.avatar_data = base64;
          return record;
        }
      } else {
        console.log(`[avatar] batch_get_tmp code=${tmpData.code} msg=${tmpData.msg}`);
      }
    } catch (e) {
      console.log(`[avatar] batch_get_tmp error: ${e.message}`);
    }
  }

  // 方案4: downloadMedia (需要 drive:drive 权限)
  if (att.file_token) {
    try {
      const dlResp = await fetch(
        `https://open.feishu.cn/open-apis/drive/v1/medias/${att.file_token}/download`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (dlResp.ok) {
        const contentType = dlResp.headers.get("content-type") || "image/jpeg";
        const buffer = Buffer.from(await dlResp.arrayBuffer());
        record.avatar_data = `data:${contentType};base64,${buffer.toString("base64")}`;
        console.log(`[avatar] ✅ ${record.name}: downloadMedia OK`);
        return record;
      } else {
        console.log(`[avatar] downloadMedia HTTP ${dlResp.status}`);
      }
    } catch (e) {
      console.log(`[avatar] downloadMedia error: ${e.message}`);
    }
  }

  console.warn(`[avatar] ❌ ${record.name}: ALL methods failed`);
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

    // 服务端下载头像转base64
    const token = await getTenantToken();
    const resolved = await Promise.all(
      records.map((r) => resolveAvatar(r, token))
    );

    // 统计成功数
    const withAvatar = resolved.filter((r) => r.avatar_data).length;
    console.log(`[/api/locals] Avatar resolved: ${withAvatar}/${resolved.length}`);

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
