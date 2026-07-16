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
    const { local_name, session_title, traveler_name, traveler_email, preferred_date, message } =
      req.body || {};

    // 校验必填字段
    const missing = [];
    if (!local_name) missing.push("local_name");
    if (!session_title) missing.push("session_title");
    if (!traveler_name) missing.push("traveler_name");
    if (!traveler_email) missing.push("traveler_email");

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `缺少必填字段: ${missing.join(", ")}`,
      });
    }

    // 校验邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(traveler_email)) {
      return res.status(400).json({
        success: false,
        error: "邮箱格式不正确",
      });
    }

    // 构建写入字段
    const fields = {
      local_name: local_name,
      session_title: session_title,
      traveler_name: traveler_name,
      traveler_email: traveler_email,
      status: "new",
    };

    if (preferred_date) {
      fields.preferred_date = preferred_date;
    }

    if (message) {
      fields.message = message;
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
