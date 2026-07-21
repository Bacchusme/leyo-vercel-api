// lib/feishu.js
// 飞书 Bitable API 封装：Token 管理 + CRUD 操作 + 文件上传/下载

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const BITABLE_APP_TOKEN = process.env.BITABLE_APP_TOKEN;

const TABLE_IDS = {
  locals: process.env.TABLE_ID_LOCALS,
  sessions: process.env.TABLE_ID_SESSIONS,
  sayhi: process.env.TABLE_ID_SAYHI,
};

// ========== Token 缓存 ==========
let tokenCache = {
  token: null,
  expiresAt: 0,
};

async function getTenantToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt - now > 5 * 60 * 1000) {
    return tokenCache.token;
  }

  const resp = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: FEISHU_APP_ID,
        app_secret: FEISHU_APP_SECRET,
      }),
    }
  );

  const data = await resp.json();
  if (data.code !== 0) {
    throw new Error(`飞书 Token 获取失败: ${data.msg}`);
  }

  tokenCache = {
    token: data.tenant_access_token,
    expiresAt: now + data.expire * 1000,
  };

  return tokenCache.token;
}

// ========== 字段格式化 ==========

function formatFieldValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value;
  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    if (value.length === 0) return null;

    // 附件字段：元素有 url 和 file_token
    if (value[0] && (value[0].url || value[0].file_token) && !value[0].text) {
      return value
        .filter((item) => item.url || item.file_token)
        .map((item) => ({
          url: item.url || null,
          file_token: item.file_token || null,
          name: item.name || null,
        }));
    }

    // 单选/多选：元素有 text 属性
    if (value[0] && typeof value[0].text === "string") {
      const texts = value.map((item) => item.text).filter(Boolean);
      return texts.length === 1 ? texts[0] : texts;
    }

    return value;
  }

  if (typeof value === "object") {
    if (value.timestamp) return value.timestamp;
    return value;
  }

  return value;
}

function formatRecord(record) {
  const fields = record.fields || {};
  const formatted = {};

  for (const [key, value] of Object.entries(fields)) {
    formatted[key] = formatFieldValue(value);
  }

  return {
    record_id: record.record_id,
    ...formatted,
  };
}

// ========== CRUD 操作 ==========

async function queryRecords(tableKey, filter) {
  const tableId = TABLE_IDS[tableKey];
  if (!tableId) {
    throw new Error(`未知的表: ${tableKey}`);
  }

  const token = await getTenantToken();
  let allRecords = [];
  let pageToken = null;

  do {
    const params = new URLSearchParams({
      page_size: "500",
    });

    if (pageToken) {
      params.set("page_token", pageToken);
    }

    if (filter) {
      params.set("filter", filter);
    }

    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${tableId}/records?${params.toString()}`;

    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const data = await resp.json();
    if (data.code !== 0) {
      throw new Error(`飞书记录查询失败: [${data.code}] ${data.msg}`);
    }

    const items = data.data?.items || [];
    allRecords = allRecords.concat(items);

    pageToken = data.data?.has_more ? data.data?.page_token : null;
  } while (pageToken);

  return allRecords.map(formatRecord);
}

async function getRecordById(tableKey, recordId) {
  const tableId = TABLE_IDS[tableKey];
  if (!tableId) {
    throw new Error(`未知的表: ${tableKey}`);
  }

  const token = await getTenantToken();
  const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${tableId}/records/${recordId}`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await resp.json();
  if (data.code !== 0) {
    throw new Error(`飞书记录查询失败: [${data.code}] ${data.msg}`);
  }

  const record = data.data?.record;
  if (!record) {
    throw new Error("记录不存在");
  }

  return formatRecord(record);
}

async function createRecord(tableKey, fields) {
  const tableId = TABLE_IDS[tableKey];
  if (!tableId) {
    throw new Error(`未知的表: ${tableKey}`);
  }

  const token = await getTenantToken();
  const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${tableId}/records`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  const data = await resp.json();
  if (data.code !== 0) {
    throw new Error(`飞书记录创建失败: [${data.code}] ${data.msg}`);
  }

  return formatRecord(data.data?.record);
}

// ========== 文件上传 ==========

async function uploadMedia(fileBuffer, fileName, fileSize) {
  const token = await getTenantToken();

  const boundary = "------LeyoFormBoundary" + Date.now().toString(36);
  const CRLF = "\r\n";

  const parts = [];

  parts.push(
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="file_name"${CRLF}${CRLF}${fileName}${CRLF}`
  );

  parts.push(
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="parent_type"${CRLF}${CRLF}bitable_file${CRLF}`
  );

  parts.push(
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="parent_node"${CRLF}${CRLF}${BITABLE_APP_TOKEN}${CRLF}`
  );

  parts.push(
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="size"${CRLF}${CRLF}${fileSize}${CRLF}`
  );

  const fileHeader =
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"${CRLF}` +
    `Content-Type: application/octet-stream${CRLF}${CRLF}`;

  const endBoundary = `${CRLF}--${boundary}--${CRLF}`;

  const textParts = Buffer.from(parts.join(""), "utf-8");
  const fileHeaderBuf = Buffer.from(fileHeader, "utf-8");
  const endBuf = Buffer.from(endBoundary, "utf-8");

  const body = Buffer.concat([textParts, fileHeaderBuf, fileBuffer, endBuf]);

  const url = "https://open.feishu.cn/open-apis/drive/v1/medias/upload_all";

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: body,
  });

  const data = await resp.json();
  if (data.code !== 0) {
    throw new Error(`飞书文件上传失败: [${data.code}] ${data.msg}`);
  }

  const fileToken = data.data?.file_token;
  if (!fileToken) {
    throw new Error("飞书文件上传返回无 file_token");
  }

  return fileToken;
}

// ========== 文件下载 ==========

/**
 * 从飞书下载媒体文件
 * 使用 Drive API: GET /drive/v1/medias/:file_token/download
 * 
 * @param {string} fileToken - 文件 token
 * @param {string|object} [extra] - 可选，多维表格附件需要传 extra 参数
 *   可以是 JSON 字符串如 '{"bitablePerm":{"tableId":"xxx","rev":21}}'
 *   也可以是对象，会自动 JSON.stringify + encodeURIComponent
 * @returns {Promise<Response>}
 */
async function downloadMedia(fileToken, extra) {
  const token = await getTenantToken();

  let url = `https://open.feishu.cn/open-apis/drive/v1/medias/${fileToken}/download`;
  if (extra) {
    const extraStr = typeof extra === "string" ? extra : JSON.stringify(extra);
    url += `?extra=${encodeURIComponent(extraStr)}`;
  }

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`飞书媒体下载失败: HTTP ${resp.status} - ${text}`);
  }

  return resp;
}

module.exports = {
  getTenantToken,
  formatFieldValue,
  formatRecord,
  queryRecords,
  getRecordById,
  createRecord,
  uploadMedia,
  downloadMedia,
  TABLE_IDS,
};
