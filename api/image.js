// api/image.js
// GET /api/image?token=<file_token>&url=<direct_url>
// 服务端代理下载飞书图片，解决浏览器跨域/鉴权问题

const { downloadMedia, getTenantToken } = require("../lib/feishu");

// 备用方案：batch_get_tmp_download_url 获取预签名 URL
async function getSignedUrl(fileToken) {
  const token = await getTenantToken();
  const url = `https://open.feishu.cn/open-apis/drive/v1/medias/batch_get_tmp_download_url?file_tokens=${fileToken}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json();
  if (data.code === 0 && data.data?.tmp_download_urls?.length > 0) {
    return data.data.tmp_download_urls[0].tmp_download_url;
  }
  return null;
}

// 方案3：服务端直接抓取飞书直链（浏览器跨域但服务端不受限）
async function proxyDirectUrl(directUrl) {
  const resp = await fetch(directUrl, { redirect: "follow" });
  if (!resp.ok) throw new Error(`Direct URL HTTP ${resp.status}`);
  const contentType = resp.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await resp.arrayBuffer());
  return { buffer, contentType };
}

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "仅支持 GET 请求" });

  const { token, url: directUrl } = req.query;

  if (!token && !directUrl) {
    return res.status(400).json({ success: false, error: "缺少 token 或 url 参数" });
  }

  // === 方案1：直接下载媒体（drive API） ===
  if (token) {
    try {
      const feishuResp = await downloadMedia(token);
      res.setHeader("Cache-Control", "public, s-maxage=3600, max-age=600");
      const contentType = feishuResp.headers.get("content-type");
      res.setHeader("Content-Type", contentType || "application/octet-stream");
      const buffer = await feishuResp.arrayBuffer();
      return res.status(200).send(Buffer.from(buffer));
    } catch (err) {
      console.error("[/api/image] 方案1 downloadMedia 失败:", err.message);
    }
  }

  // === 方案2：batch_get_tmp_download_url → 302 重定向 ===
  if (token) {
    try {
      const signedUrl = await getSignedUrl(token);
      if (signedUrl) {
        console.log("[/api/image] 方案2 使用预签名URL重定向");
        return res.redirect(302, signedUrl);
      }
    } catch (err) {
      console.error("[/api/image] 方案2 batch_get_tmp 失败:", err.message);
    }
  }

  // === 方案3：服务端代理飞书直链 ===
  if (directUrl) {
    try {
      const { buffer, contentType } = await proxyDirectUrl(directUrl);
      res.setHeader("Cache-Control", "public, s-maxage=3600, max-age=600");
      res.setHeader("Content-Type", contentType);
      console.log("[/api/image] 方案3 代理直链成功");
      return res.status(200).send(buffer);
    } catch (err) {
      console.error("[/api/image] 方案3 proxyDirectUrl 失败:", err.message);
    }
  }

  return res.status(500).json({ success: false, error: "所有下载方案均失败" });
};
