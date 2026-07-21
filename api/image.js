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

async function downloadViaSignedUrl(fileToken) {
  const token = await getTenantToken();
  const url = `https://open.feishu.cn/open-apis/drive/v1/medias/batch_get_tmp_download_url?file_tokens=${fileToken}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`batch_get_tmp HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.code !== 0) throw new Error(`batch_get_tmp code ${data.code}: ${data.msg}`);
  if (!data.data?.tmp_download_urls?.length) throw new Error("无临时下载URL");

  const tmpUrl = data.data.tmp_download_urls[0].tmp_download_url;
  const imgResp = await fetch(tmpUrl, { redirect: "follow" });
  if (!imgResp.ok) throw new Error(`临时URL下载 HTTP ${imgResp.status}`);
  const contentType = imgResp.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await imgResp.arrayBuffer());
  return { buffer, contentType };
}

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

  const errors = [];

  if (token) {
    try {
      const feishuResp = await withTimeout(downloadMedia(token), 8000);
      res.setHeader("Cache-Control", "public, s-maxage=86400, max-age=3600");
      const contentType = feishuResp.headers.get("content-type");
      res.setHeader("Content-Type", contentType || "application/octet-stream");
      const buffer = await feishuResp.arrayBuffer();
      console.log("[/api/image] 方案1 成功, size:", buffer.byteLength);
      return res.status(200).send(Buffer.from(buffer));
    } catch (err) {
      errors.push("方案1: " + err.message);
      console.error("[/api/image] 方案1 失败:", err.message);
    }
  }

  if (token) {
    try {
      const { buffer, contentType } = await withTimeout(downloadViaSignedUrl(token), 8000);
      res.setHeader("Cache-Control", "public, s-maxage=86400, max-age=3600");
      res.setHeader("Content-Type", contentType);
      console.log("[/api/image] 方案2 成功, size:", buffer.length);
      return res.status(200).send(buffer);
    } catch (err) {
      errors.push("方案2: " + err.message);
      console.error("[/api/image] 方案2 失败:", err.message);
    }
  }

  if (directUrl) {
    try {
      const { buffer, contentType } = await withTimeout(proxyDirectUrl(directUrl), 8000);
      res.setHeader("Cache-Control", "public, s-maxage=86400, max-age=3600");
      res.setHeader("Content-Type", contentType);
      console.log("[/api/image] 方案3 成功, size:", buffer.length);
      return res.status(200).send(buffer);
    } catch (err) {
      errors.push("方案3: " + err.message);
      console.error("[/api/image] 方案3 失败:", err.message);
    }
  }

  console.error("[/api/image] 全部失败:", errors.join(" | "));
  return res.status(500).json({ success: false, error: "所有下载方案均失败", details: errors });
};
