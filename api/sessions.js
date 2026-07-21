// api/sessions.js
// GET /api/sessions - 获取 Sessions 列表（图片通过 batch_get_tmp_download_url 获取临时公开链接）
const { queryRecords, getTenantToken } = require("../lib/feishu");

/**
 * 批量获取文件的临时公开下载链接
 * @param {string[]} fileTokens - file_token 数组
 * @param {string} token - 飞书 tenant_access_token
 * @returns {Object} { file_token: tmp_url } 映射
 */
async function batchGetTmpUrls(fileTokens, token) {
  if (!fileTokens || fileTokens.length === 0) return {};
  try {
    // batch API 支持多个 token，用逗号分隔
    const url = `https://open.feishu.cn/open-apis/drive/v1/medias/batch_get_tmp_download_url?file_tokens=${fileTokens.join(",")}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await resp.json();
    if (data.code === 0 && data.data?.tmp_download_urls) {
      const map = {};
      data.data.tmp_download_urls.forEach((item) => {
        if (item.file_token && item.tmp_download_url) {
          map[item.file_token] = item.tmp_download_url;
        }
      });
      return map;
    }
    console.log(`[sessions] batch_get_tmp code=${data.code} msg=${data.msg}`);
    return {};
  } catch (e) {
    console.log(`[sessions] batch_get_tmp error: ${e.message}`);
    return {};
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "仅支持 GET 请求" });

  try {
    const { local_name, city } = req.query;

    let filter = null;
    if (local_name) {
      filter = `CurrentValue.[local_name] = "${local_name}"`;
    }
    if (city) {
      if (filter) {
        filter += ` AND CurrentValue.[city] = "${city}"`;
      } else {
        filter = `CurrentValue.[city] = "${city}"`;
      }
    }

    const records = await queryRecords("sessions", filter);
    console.log(`[/api/sessions] Got ${records.length} records`);

    // 收集所有 gallery 图片的 file_token
    const allTokens = [];
    records.forEach((r) => {
      const gallary = Array.isArray(r.gallary) ? r.gallary : [];
      gallary.forEach((g) => {
        if (g.file_token && !allTokens.includes(g.file_token)) {
          allTokens.push(g.file_token);
        }
      });
    });

    // 批量获取临时下载链接（一次 API 调用搞定所有图片）
    const token = await getTenantToken();
    const urlMap = await batchGetTmpUrls(allTokens, token);
    console.log(`[/api/sessions] Resolved ${Object.keys(urlMap).length}/${allTokens.length} image URLs`);

    // 给每条记录添加 gallery_urls 字段（临时公开链接数组）
    const data = records.map((r) => {
      const gallary = Array.isArray(r.gallary) ? r.gallary : [];
      r.gallery_urls = gallary.map((g) => {
        if (g.file_token && urlMap[g.file_token]) {
          return urlMap[g.file_token];
        }
        return g.url || "";
      }).filter(Boolean);
      return r;
    });

    return res.status(200).json({
      success: true,
      data: data,
      total: data.length,
    });
  } catch (err) {
    console.error("[/api/sessions] 错误:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "服务器内部错误",
    });
  }
};
