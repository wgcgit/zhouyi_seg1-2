'use strict';

const fs = require('fs');
const path = require('path');

const SKILLS_PATH = path.join(__dirname, '..', '..', 'skills', 'bazi-tuipan');
const CAREER_PROMPT_PATH = path.join(__dirname, '..', '..', 'prompts', 'CAREER_PROMPT.md');
const CAREER_SCHEMA_PATH = path.join(__dirname, '..', '..', 'prompts', 'CAREER_SCHEMA.md');

const INTERPRET_HEADING = 'Interpretation（核心方法论）';
const MASTER_SPEC_HEADING = '输出规范（固化在此文件，必须严格遵守）';
const MASTER_EXEC_HEADING = 'Execution（执行步骤）';

/** 阶段二注入的 4 个事业子 skill（只取 Interpretation） */
const CAREER_SUB_SKILLS = [
  'tiaohou-shiye',
  'geshi-shiye',
  'wuxing-shiye',
  'suiyun-shiye',
];

/** 转义正则元字符，标题文字一律按字面量匹配 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 取 `## <heading>` 到下一个 `## ` 之间的正文。
 *
 * 标题必须**独占一行**且**恰好**是 `## <heading>`（允许行尾空白）：
 * `### <heading>`、`## <heading>补充`、`- ## <heading>` 都不算命中，取不到返回空串。
 * 段落结束只看下一个 `## `；段内的 `###` 三级子节属于段内内容，必须保留。
 *
 * @param {string} markdown
 * @param {string} heading 标题文字（不含 `## ` 前缀）
 * @returns {string} 取不到返回空串
 */
function extractSection(markdown, heading) {
  const re = new RegExp(`^## ${escapeRegExp(heading)}[ \\t\\r]*$`, 'm');
  const matched = re.exec(markdown);
  if (!matched) return '';
  const rest = markdown.slice(matched.index + matched[0].length);
  const end = rest.search(/\n##\s/);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

/**
 * 取 `## Interpretation（核心方法论）` 段。
 * 只有这一段是纯知识；A2 / Execution / Boundary 是流程与输出格式指令，不进 prompt。
 */
function extractInterpretation(markdown) {
  return extractSection(markdown, INTERPRET_HEADING);
}

/** 阶段二的 system prompt：合同 + 事业知识库 + JSON Schema */
function buildCareerSystemPrompt() {
  const contract = fs.readFileSync(CAREER_PROMPT_PATH, 'utf8');
  const schema = fs.readFileSync(CAREER_SCHEMA_PATH, 'utf8');

  let skills = '';
  for (const name of CAREER_SUB_SKILLS) {
    const body = extractInterpretation(
      fs.readFileSync(path.join(SKILLS_PATH, name, 'SKILL.md'), 'utf8'),
    );
    if (body) skills += `### ${name}\n${body}\n\n`;
  }

  // master 取三段：输出规范（含推进顺序与硬性规则）+ Interpretation + Execution（含落笔映射）。
  // 只取 Interpretation 会丢掉推进顺序、硬性规则、10→13 步的落笔映射。
  const masterMd = fs.readFileSync(path.join(SKILLS_PATH, 'shiye-master.skill.md'), 'utf8');
  const masterSpec = extractSection(masterMd, MASTER_SPEC_HEADING);
  const masterInterp = extractSection(masterMd, INTERPRET_HEADING);
  const masterExec = extractSection(masterMd, MASTER_EXEC_HEADING);
  let master = '';
  if (masterSpec) master += `### shiye-master · 输出规范\n${masterSpec}\n\n`;
  if (masterInterp) master += `### shiye-master · 核心方法论\n${masterInterp}\n\n`;
  if (masterExec) master += `### shiye-master · 执行步骤\n${masterExec}\n\n`;

  return [
    contract.trim(),
    '\n\n---\n\n## 事业择业知识库\n\n',
    (skills + master).trim(),
    '\n\n---\n\n## 输出格式规范\n\n',
    schema.trim(),
  ].join('\n');
}

/** 阶段二的 user prompt：命盘 JSON + 固定引导语 */
function buildCareerUserPrompt(chart) {
  return [
    '以下是程序离线算出的命盘 JSON。四柱、藏干、十神、纳音、空亡、十二长生、神煞、',
    '干支作用、旺衰打分、格局候选、大运流年都已算好，**请直接采用，不要重新计算**。',
    '',
    JSON.stringify(chart, null, 2),
    '',
    '请严格按 system 提示词末尾的 JSON Schema 输出事业推理结果，',
    '直接返回纯 JSON 对象，不要用 markdown 代码块包裹，不要有任何额外解释文字。',
  ].join('\n');
}

/** 阶段三的 system prompt：聊天合同 + 本命推理结果 + skill 通用知识 */
function buildChatSystemPrompt(careerJson, careerProse) {
  const contract = [
    '# 事业问答合同',
    '',
    '你是一位八字事业顾问。用户已经完成排盘与事业推理，',
    '下面是**这个命例本人**的事业推理结果，以及通用的事业择业方法论。',
    '',
    '## 回答规则',
    '',
    '1. 优先依据**本命事业推理结果**回答；它是对这个命例的具体结论。',
    '2. 涉及具体大运、流年、喜忌、格局的细节，**必须引用推理结果里的原文**，不要自己另推。',
    '3. 推理结果里没有直接结论的问题，可以用下面的通用方法论回答，但要**明说**',
    '   「这一点推理结果里没有直接结论，以下是通用判断」。',
    '4. **不得重排四柱、不得重算旺衰喜忌** —— 那些由程序负责，结论已固定。',
    '5. 命理结论只作时机参考，不是保证书；涉及现实决策要提示结合政策、产权、资金、团队。',
    '6. 回答用中文，语气自然、直接，不要客套开场白，不要复述问题。',
    '',
    '---',
    '',
    '## 本命事业推理结果（JSON）',
    '',
    '```json',
    JSON.stringify(careerJson, null, 2),
    '```',
    '',
    '## 本命事业推理结果（可读版）',
    '',
    careerProse,
    '',
    '---',
    '',
    '## 通用事业择业方法论',
    '',
  ].join('\n');

  let skills = '';
  for (const name of CAREER_SUB_SKILLS) {
    const body = extractInterpretation(
      fs.readFileSync(path.join(SKILLS_PATH, name, 'SKILL.md'), 'utf8'),
    );
    if (body) skills += `### ${name}\n${body}\n\n`;
  }

  return contract + '\n' + skills.trim();
}

/** 阶段三的 user prompt：历史消息 + 本轮提问 */
function buildChatUserPrompt(history, message) {
  const parts = [];
  // history 只接受数组；其余（对象 / 数字 / 字符串 / null）一律当空数组处理
  const list = Array.isArray(history) ? history : [];
  for (const m of list) {
    if (!m || typeof m.content !== 'string') continue;
    // assistant 的历史回答标「顾问」，user 的历史提问标「用户」
    parts.push(`${m.role === 'assistant' ? '顾问' : '用户'}：${m.content}`);
  }
  parts.push(`用户：${message}`);
  return parts.join('\n');
}

module.exports = {
  extractSection,
  extractInterpretation,
  buildCareerSystemPrompt,
  buildCareerUserPrompt,
  buildChatSystemPrompt,
  buildChatUserPrompt,
  CAREER_SUB_SKILLS,
};
