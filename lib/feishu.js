// lib/feishu.js
// 飞书 Bitable API 封装：Token 管理 + CRUD 操作

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

/**
 * 获取 tenant_access_token（带内存缓存）
 */
async function getTenantToken() {
  const now = Date.now();
  // 提前 5 分钟刷新
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

/**
 * 将飞书 Bitable 返回的字段值格式化为简洁格式
 * - 单选/文本字段: [{ text: "value" }] => "value"
 * - 多选字段: [{ text: "a" }, { text: "b" }] => ["a", "b"]
 * - 布尔字段: 直接返回 true/false
 * - 数字字段: 直接返回数字
 * - 附件字段: 提取 url 数组
 * - 纯字符串/数字: 直接返回
 */
function formatFieldValue(value) {
  if (value === null || value === undefined) return null;

  // 布尔值
  if (typeof value === "boolean") return value;

  // 数字
  if (typeof value === "number") return value;

  // 纯字符串
  if (typeof value === "string") return value;

  // 数组（单选、多选、附件等）
  if (Array.isArray(value)) {
    // 空数组
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
      // 如果只有一个元素，直接返回文本；多个元素返回数组
      const texts = value.map((item) => item.text).filter(Boolean);
      return texts.length === 1 ? texts[0] : texts;
    }

    // 其他数组直接返回
    return value;
  }

  // 对象（如日期等）
  if (typeof value === "object") {
    // 日期时间戳
    if (value.timestamp) return value.timestamp;
    return value;
  }

  return value;
}

/**
 * 格式化整条记录的 fields
 */
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

/**
 * 查询记录（自动分页，获取全部）
 */
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

/**
 * 通过 record_id 获取单条记录
 */
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

/**
 * 新增记录
 */
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

module.exports = {
  getTenantToken,
  formatFieldValue,
  formatRecord,
  queryRecords,
  getRecordById,
  createRecord,
  TABLE_IDS,
};
