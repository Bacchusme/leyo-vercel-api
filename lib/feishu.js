// api/image.js
// GET /api/image?token=<file_token>&url=<direct_url>
// 服务端代理下载飞书图片，解决浏览器跨域/鉴权问题
// 核心原则：所有方案均服务端下载后返回二进制，绝不 302 重定向到飞书域名

const { downloadMedia, getTenantToken } = require("../lib/feishu");

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
    ),
  ]);
}

// 从飞书附件 URL 中提取 extra 参数（多维表格附件下载必需）
function extractExtraFromUrl(directUrl) {
  if (!directUrl) return null;
  try {
    const u = new URL(directUrl);
    const extra = u.searchParams.get("extra");
    return extra || null;
  } catch {
    return null;
  }
}

// 方案3：服务端直接代理飞书直链（URL自带extra鉴权参数）
async function proxyDirectUrl(directUrl) {
  const resp = await fetch(directUrl, { redirect: "follow" });
  if (!resp.ok) throw new Error(`Direct URL HTTP ${resp.status}`);
  const contentType = resp.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await resp.arrayBuffer());
  return { buffer, contentType };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "仅支持 GET 请求" });

  const { token, url: directUrl } = req.query;
  if (!token && !directUrl) {
    return res.status(400).json({ success: false, error: "缺少 token 或 url 参数" });
  }

  // 从直链 URL 中提取 extra 参数（多维表格附件必需）
  const extra = extractExtraFromUrl(directUrl);
  const errors = [];

  // === 方案1：Drive API 下载（带 extra 参数 + 超时保护） ===
  if (token) {
    try {
      const feishuResp = await withTimeout(downloadMedia(token, extra), 8000);
      res.setHeader("Cache-Control", "public, s-maxage=86400, max-age=3600");
      const contentType = feishuResp.headers.get("content-type");
      res.setHeader("Content-Type", contentType || "application/octet-stream");
      const buffer = await feishuResp.arrayBuffer();
      console.log("[/api/image] 方案1 成功, size:", buffer.byteLength, "extra:", !!extra);
      return res.status(200).send(Buffer.from(buffer));
    } catch (err) {
      errors.push("方案1: " + err.message);
      console.error("[/api/image] 方案1 失败:", err.message);
    }
  }

  // === 方案2：服务端代理飞书直链（URL自带extra鉴权参数） ===
  if (directUrl) {
    try {
      const { buffer, contentType } = await withTimeout(proxyDirectUrl(directUrl), 8000);
      res.setHeader("Cache-Control", "public, s-maxage=86400, max-age=3600");
      res.setHeader("Content-Type", contentType);
      console.log("[/api/image] 方案2 成功, size:", buffer.length);
      return res.status(200).send(buffer);
    } catch (err) {
      errors.push("方案2: " + err.message);
      console.error("[/api/image] 方案2 失败:", err.message);
    }
  }

  // 全部失败
  console.error("[/api/image] 全部失败:", errors.join(" | "));
  return res.status(500).json({
    success: false,
    error: "所有下载方案均失败",
    details: errors,
  });
};
