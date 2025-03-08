/* 基于pot将单词添加至墨墨云词本，作者leod86 */
// 解析响应数据
async function parseResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
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
  if (response.status !== 200) {
    throw new Error(`查询云词本失败, HTTP 状态码: ${response.status}`);
  }
  const data = await parseResponse(response);
  return data.data.notepads;
}

// 根据词本名称获取词本 id
async function getNotepadIdByTitle(auth_token, targetTitle) {
  const notepads = await queryNotepads(auth_token);
  const target = notepads.find(np => np.title === targetTitle);
  if (!target) {
    throw new Error(`未找到标题为 "${targetTitle}" 的词本`);
  }
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
  if (response.status !== 200) {
    throw new Error(`获取词本详情失败, HTTP 状态码: ${response.status}`);
  }
  const data = await parseResponse(response);
  if (!data.data || !data.data.notepad) {
    throw new Error("返回的词本详情数据异常");
  }
  return data.data.notepad;
}

// 更新词本，仅更新 content 字段
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
  if (![200, 201].includes(response.status)) {
    throw new Error(`更新词本失败, HTTP 状态码: ${response.status}`);
  }
  return await parseResponse(response);
}

// 主逻辑：添加新单词到词本 content
async function addWordToContent(auth_token, targetTitle, newWord) {
  const notepad_id = await getNotepadIdByTitle(auth_token, targetTitle);
  const notepad = await getNotepadDetail(notepad_id, auth_token);
  const words = (notepad.content || "").split("/").map(w => w.trim()).filter(Boolean);
  if (!words.includes(newWord)) {
    words.push(newWord);
  }
  const updatedContent = words.join("/");
  const updateBody = {
    status: notepad.status || "UNPUBLISHED",
    content: updatedContent,
    title: notepad.title,
    brief: notepad.brief,
    tags: notepad.tags,
    list: notepad.list
  };
  return await updateNotepad(notepad_id, updateBody, auth_token);
}

// pot 插件调用的 collection 函数
async function collection(source, target, options = {}) {
  const { config } = options;
  const { auth_token, notepad_title } = config;
  return await addWordToContent(auth_token, notepad_title, source);
}

