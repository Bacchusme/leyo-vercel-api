// api/sessions/[id].js
// GET /api/sessions/[id] - 获取单个 Session 详情

const { getRecordById } = require("../../lib/feishu");

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
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "缺少 Session ID 参数",
      });
    }

    const record = await getRecordById("sessions", id);

    return res.status(200).json({
      success: true,
      data: record,
    });
  } catch (err) {
    console.error("[/api/sessions/[id]] 错误:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "服务器内部错误",
    });
  }
};
