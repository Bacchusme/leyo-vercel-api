// api/say-hi.js
// POST /api/say-hi - 提交 Say Hi 请求

const { createRecord } = require("../lib/feishu");

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "仅支持 POST 请求" });
  }

  try {
    const {
      guest_name,
      guest_nationality,
      guest_email,
      guest_wechat,
      guest_photo_url,
      guest_photo_token,
      guest_tags,
      local_name,
      session_title,
      message,
    } = req.body || {};

    // 校验必填字段
    const missing = [];
    if (!guest_name) missing.push("guest_name");
    if (!guest_email) missing.push("guest_email");
    if (!local_name) missing.push("local_name");

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `缺少必填字段: ${missing.join(", ")}`,
      });
    }

    // 校验邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(guest_email)) {
      return res.status(400).json({
        success: false,
        error: "邮箱格式不正确",
      });
    }

    // 构建写入飞书的字段（字段名与飞书 SayHi 表列名一致）
    const fields = {
      guest_name: guest_name,
      guest_email: guest_email,
      local_name: local_name,
      status: "new",
    };

    // 可选字段
    if (guest_nationality) fields.guest_nationality = guest_nationality;
    if (guest_wechat) fields.guest_wechat = guest_wechat;
    if (guest_photo_url) fields.guest_photo_url = guest_photo_url;
    if (guest_tags) fields.guest_tags = guest_tags;
    if (session_title) fields.session_title = session_title;
    if (message) fields.message = message;

    // 照片附件：如果有 guest_photo_token，写入 guest_photo 附件字段
    if (guest_photo_token) {
      fields.guest_photo = [{ file_token: guest_photo_token }];
    }

    const record = await createRecord("sayhi", fields);

    return res.status(201).json({
      success: true,
      data: record,
      message: "Say Hi 请求已提交，我们会尽快联系你！",
    });
  } catch (err) {
    console.error("[/api/say-hi] 错误:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "服务器内部错误",
    });
  }
};
