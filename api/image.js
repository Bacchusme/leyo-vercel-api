// api/image.js
// GET /api/image?token=<file_token> - 代理下载飞书媒体文件
// 解决飞书图片 URL 需要鉴权、浏览器无法直接访问的问题

const { downloadMedia } = require("../lib/feishu");

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
    console.error("[/api/image] 下载飞书媒体失败:", err.message);
    return res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
};
