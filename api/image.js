// api/image.js
// GET /api/image?token=<file_token> - 代理下载飞书媒体文件
// 解决飞书图片 URL 需要鉴权、浏览器无法直接访问的问题

const { downloadMedia, getTenantToken } = require("../lib/feishu");

// 备用方案：直接用飞书 Drive API 获取预签名 URL
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

  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ 
      success: false, 
      error: "缺少 token 参数。用法: /api/image?token=<file_token>" 
    });
  }

  // 方案1：直接下载媒体
  try {
    const feishuResp = await downloadMedia(token);

    // 设置缓存（Vercel CDN 缓存 1 小时，浏览器缓存 10 分钟）
    res.setHeader("Cache-Control", "public, s-maxage=3600, max-age=600");

    // 转发 Content-Type（飞书返回的图片类型）
    const contentType = feishuResp.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    } else {
      res.setHeader("Content-Type", "application/octet-stream");
    }

    // 转发 Content-Length（如果有）
    const contentLength = feishuResp.headers.get("content-length");
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    // 获取图片二进制数据
    const buffer = await feishuResp.arrayBuffer();
    return res.status(200).send(Buffer.from(buffer));

  } catch (err) {
    console.error("[/api/image] 方案1失败:", err.message);
    
    // 方案2：尝试获取预签名 URL
    try {
      const signedUrl = await getSignedUrl(token);
      if (signedUrl) {
        console.log("[/api/image] 使用预签名URL重定向");
        return res.redirect(302, signedUrl);
      }
    } catch (err2) {
      console.error("[/api/image] 方案2也失败:", err2.message);
    }

    return res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
};
