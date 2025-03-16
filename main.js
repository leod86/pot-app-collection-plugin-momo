// 解析响应数据
async function parseResponse(response) {
  const text = await response.text();
  if (!text) throw new Error("响应为空，无法解析 JSON");
  return JSON.parse(text);
}

// 查询云词本列表（token 放在 Header 中）
async function queryNotepads(auth_token) {
  const url = "https://open.maimemo.com/open/api/v1/notepads?limit=5&offset=0";
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Authorization": "Bearer " + auth_token
    }
  });
  if (response.status !== 200)
    throw new Error(`查询云词本失败, HTTP 状态码: ${response.status}`);
  const data = await parseResponse(response);
  return data.data.notepads;
}

// 根据词本名称获取词本 id
async function getNotepadIdByTitle(auth_token, targetTitle) {
  const notepads = await queryNotepads(auth_token);
  const target = notepads.find(np => np.title === targetTitle);
  if (!target)
    throw new Error(`未找到标题为 "${targetTitle}" 的词本`);
  return target.id;
}

// 获取词本详情，主要用于获取 content 字段
async function getNotepadDetail(notepad_id, auth_token) {
  const url = `https://open.maimemo.com/open/api/v1/notepads/${notepad_id}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Authorization": "Bearer " + auth_token
    }
  });
  if (response.status !== 200)
    throw new Error(`获取词本详情失败, HTTP 状态码: ${response.status}`);
  const data = await parseResponse(response);
  if (!data.data || !data.data.notepad)
    throw new Error("返回的词本详情数据异常");
  return data.data.notepad;
}

// 更新词本，仅更新 content 字段，其他字段保持原样
async function updateNotepad(notepad_id, updateBody, auth_token) {
  const url = `https://open.maimemo.com/open/api/v1/notepads/${notepad_id}`;
  const payload = { notepad: updateBody };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": "Bearer " + auth_token
    },
    body: JSON.stringify(payload)
  });
  if (![200, 201].includes(response.status))
    throw new Error(`更新词本失败, HTTP 状态码: ${response.status}`);
  return await parseResponse(response);
}

// 全局缓存与去抖动定时器
let cachedNotepad = null;
let updateTimer = null;

// 主逻辑：添加新单词到词本 content
// 单词以换行符分隔，不区分大小写判断是否存在
async function addWordToContent(auth_token, targetTitle, newWord) {
  // 如果缓存不存在，则获取词本详情并缓存
  if (!cachedNotepad) {
    const notepad_id = await getNotepadIdByTitle(auth_token, targetTitle);
    cachedNotepad = await getNotepadDetail(notepad_id, auth_token);
    cachedNotepad.id = notepad_id;
  }

  // 分割 content 得到单词数组（换行符分隔）
  const words = (cachedNotepad.content || "").split("\n").map(w => w.trim()).filter(Boolean);
  // 构建小写数组用于不区分大小写判断
  const lowerWords = words.map(word => word.toLowerCase());
  if (lowerWords.includes(newWord.toLowerCase())) {
    console.warn("该单词已经添加过了");
    throw new Error(`单词 "${newWord}" 已存在`);
  }

  // 添加新单词
  words.push(newWord);
  cachedNotepad.content = words.join("\n");
  console.log("新单词已添加到本地缓存，等待统一更新");

  // 设置去抖动，10秒内无新操作则上传缓存内容
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = setTimeout(async () => {
    const updateBody = {
      status: cachedNotepad.status || "UNPUBLISHED",
      content: cachedNotepad.content,
      title: cachedNotepad.title,
      brief: cachedNotepad.brief,
      tags: cachedNotepad.tags,
      list: cachedNotepad.list
    };
    try {
      await updateNotepad(cachedNotepad.id, updateBody, auth_token);
      console.log("词本更新成功");
      cachedNotepad = null;
      updateTimer = null;
    } catch (err) {
      console.error("更新失败：", err);
    }
  }, 20000);

  return { message: "新单词已添加到本地缓存，等待统一更新" };
}

// pot 插件调用的 collection 函数
async function collection(source, target, options = {}) {
  const { config } = options;
  const { auth_token, notepad_title } = config;
  return await addWordToContent(auth_token, notepad_title, source);
}
