// api/sessions.js
// GET /api/sessions - 获取 Sessions 列表

const { queryRecords } = require("../lib/feishu");

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
    const { local_name, city } = req.query;

    // 构建飞书筛选条件：is_active = true
    let filter = "CurrentValue.[is_active] = true";

    if (local_name) {
      filter += ` AND CurrentValue.[local_name] = "${local_name}"`;
    }

    if (city) {
      filter += ` AND CurrentValue.[city] = "${city}"`;
    }

    const records = await queryRecords("sessions", filter);

    return res.status(200).json({
      success: true,
      data: records,
      total: records.length,
    });
  } catch (err) {
    console.error("[/api/sessions] 错误:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "服务器内部错误",
    });
  }
};
