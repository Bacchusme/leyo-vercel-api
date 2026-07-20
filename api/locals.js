// api/locals.js
// GET /api/locals - 获取 Locals 列表（头像走前端 /api/image 代理，服务端不下载）
const { queryRecords } = require("../lib/feishu");

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

    return res.status(200).json({
      success: true,
      data: records,
      total: records.length,
    });
  } catch (err) {
    console.error("[/api/locals] 错误:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "服务器内部错误",
    });
  }
};
