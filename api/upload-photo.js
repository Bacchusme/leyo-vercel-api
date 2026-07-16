// api/upload-photo.js
// POST /api/upload-photo - 上传照片到飞书，返回 file_token

const { uploadMedia } = require("../lib/feishu");

const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB

module.exports = async function handler(req, res) {
  // CORS headers（与 say-hi.js 一致）
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
    const { file_name, file_size, file_base64 } = req.body || {};

    // 校验必填字段
    if (!file_name) {
      return res.status(400).json({ success: false, error: "缺少 file_name" });
    }
    if (!file_size && file_size !== 0) {
      return res.status(400).json({ success: false, error: "缺少 file_size" });
    }
    if (!file_base64) {
      return res.status(400).json({ success: false, error: "缺少 file_base64" });
    }

    // 校验文件大小
    if (file_size > MAX_FILE_SIZE) {
      return res.status(400).json({
        success: false,
        error: `文件过大，最大允许 ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB`,
      });
    }

    // 将 base64 解码为 Buffer
    let fileBuffer;
    try {
      fileBuffer = Buffer.from(file_base64, "base64");
    } catch (e) {
      return res.status(400).json({ success: false, error: "base64 解码失败" });
    }

    // 校验解码后的实际大小
    if (fileBuffer.length !== file_size) {
      // 以实际 buffer 长度为准进行大小校验
      if (fileBuffer.length > MAX_FILE_SIZE) {
        return res.status(400).json({
          success: false,
          error: `文件过大，最大允许 ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB`,
        });
      }
    }

    // 上传到飞书
    const file_token = await uploadMedia(fileBuffer, file_name, fileBuffer.length);

    return res.status(200).json({
      success: true,
      file_token: file_token,
    });
  } catch (err) {
    console.error("[/api/upload-photo] 错误:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "上传失败",
    });
  }
};
