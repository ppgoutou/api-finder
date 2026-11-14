/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { DocContent } from '../types'
import { DOC_SAMPLES } from './samples'

export const ZH_DOCS: DocContent = {
  title: 'API 开发文档',
  intro:
    '通过兼容 OpenAI 的接口调用 Seedance 视频生成模型和 GPT 图片生成模型：视频用提交任务、查询进度、下载视频三个接口完成，图片一次请求直接返回。',
  sections: [
    {
      id: 'overview',
      title: '概览',
      blocks: [
        {
          type: 'markdown',
          text: `**接口地址（Base URL）**：\`{{BASE_URL}}\`

| 接口 | 用途 |
| --- | --- |
| \`POST /v1/videos\` | 提交视频生成任务 |
| \`GET /v1/videos/{id}\` | 查询视频任务状态 |
| \`GET /v1/videos/{id}/content\` | 下载视频 |
| \`POST /v1/images/generations\` | 生成图片（同步返回） |

视频生成是异步任务：先提交任务拿到任务 ID，再轮询任务状态，完成后下载视频。图片生成是同步接口，一次请求直接返回图片。

各模型支持的分辨率、时长和计费方式不同，见下方「选择模型」和「图片生成」；最新规格和实时价格以 [模型广场](/pricing) 中的模型说明为准。`,
        },
      ],
    },
    {
      id: 'quickstart',
      title: '快速开始',
      blocks: [
        {
          type: 'markdown',
          text: `1. [注册账号](/sign-up)并登录；
2. 在控制台「钱包」页面充值；
3. 在「API 密钥」页面创建密钥（以 \`sk-\` 开头）；
4. 依次调用下面三个接口：提交任务 → 查询状态 → 下载视频。`,
        },
        { type: 'code', label: '1. 提交任务', code: DOC_SAMPLES.quickCreate },
        { type: 'code', label: '2. 查询状态', code: DOC_SAMPLES.quickQuery },
        { type: 'code', label: '3. 下载视频', code: DOC_SAMPLES.quickDownload },
      ],
    },
    {
      id: 'authentication',
      title: '鉴权',
      blocks: [
        {
          type: 'markdown',
          text: '所有请求都需要在请求头中携带 API 密钥：',
        },
        { type: 'code', label: 'HTTP Header', code: DOC_SAMPLES.authHeader },
        {
          type: 'markdown',
          text: `- 请填写完整的密钥，不要省略 \`sk-\` 前缀；
- 密钥只放在服务端，不要写进网页或 App 的前端代码；
- 密钥泄露后，请立即在「API 密钥」页面删除并重新创建。`,
        },
      ],
    },
    {
      id: 'models',
      title: '选择模型',
      blocks: [
        {
          type: 'markdown',
          text: `视频模型分三组，**前两组参数写法相同，官方模型写法不同**，见「官方模型写法」。

| 模型 | 分辨率 | 时长 | 计费 |
| --- | --- | --- | --- |
| \`seedance2.0-T\` | 480p–1080p | 4–15 秒 | 按秒 |
| \`seedance2.0-fast-T\` | 480p–720p | 4–15 秒 | 按秒 |
| \`seedance2.0-mini-T\` | 480p–720p | 4–15 秒 | 按秒 |
| \`seedance2.5-T\` | 480p–1080p | 4–30 秒 | 按秒 |
| \`seedance-2.0-dfyb\` | 480p–1080p | 4–15 秒 | 按秒 |
| \`seedance-2.5-dfyb\` | 480p–720p | 4–30 秒 | 按秒 |
| \`doubao-seedance-2-0-261111\` | 480p–4k | 4–15 秒 | 按 token |
| \`doubao-seedance-2-0-fast-261111\` | 480p–720p | 4–15 秒 | 按 token |
| \`doubao-seedance-2-0-mini-261111\` | 480p–720p | 4–15 秒 | 按 token |
| \`doubao-seedance-2-5-261111\` | 480p–1080p | 4–30 秒 | 按 token |
| \`dreamina-seedance-2-0-261111\` | 480p–4k | 4–15 秒 | 按 token |
| \`dreamina-seedance-2-0-fast-261111\` | 480p–720p | 4–15 秒 | 按 token |
| \`dreamina-seedance-2-0-mini-261111\` | 480p–720p | 4–15 秒 | 按 token |
| \`dreamina-seedance-2-5-261111\` | 480p–1080p | 4–30 秒 | 按 token |

**参考素材上限**：Seedance 2.0 系列最多 9 张图、3 段视频、3 段音频；Seedance 2.5 系列最多 30 张图、10 段视频、10 段音频；\`seedance-2.0-dfyb\` 合计不超过 12 个，\`seedance-2.5-dfyb\` 合计不超过 50 个。

**怎么选**

- **要 4K**：只有官方 \`doubao-seedance-2-0-261111\`、\`dreamina-seedance-2-0-261111\` 支持；
- **要长视频**：Seedance 2.5 系列单段最长 30 秒；
- **要更快、更便宜**：选名字带 \`fast\`、\`mini\` 的模型；
- **大量参考素材**：Seedance 2.5 系列最多 30 张参考图、10 段参考视频、10 段参考音频；
- **官方模型**：\`doubao-\` 开头的是字节跳动火山引擎线路，\`dreamina-\` 开头的是 BytePlus 海外线路，可生成有声视频。

**画面比例**：\`-T\` 系列支持 \`16:9\`、\`9:16\`、\`1:1\`、\`4:3\`、\`3:4\`、\`21:9\`、\`9:21\`；\`dfyb\` 系列支持 \`16:9\`、\`9:16\`、\`1:1\`、\`4:3\`、\`3:4\`、\`21:9\`；官方模型支持 \`21:9\`、\`16:9\`、\`4:3\`、\`1:1\`、\`3:4\`、\`9:16\`，Seedance 2.5 还支持 \`adaptive\`（自适应）。\`-T\` 系列不传比例时，带首帧或参考图会按素材自适应。`,
        },
      ],
    },
    {
      id: 'create',
      title: '创建任务',
      blocks: [
        {
          type: 'markdown',
          text: `\`POST /v1/videos\`，请求体为 JSON（\`Content-Type: application/json\`）。下表适用于 \`-T\` 和 \`dfyb\` 系列；官方模型请看「官方模型写法」。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| \`model\` | \`string\` | 是 | 模型名，见「选择模型」 |
| \`prompt\` | \`string\` | 是 | 视频描述，不能为空 |
| \`seconds\` | \`integer\` | 建议 | 时长（秒），整数，需在模型支持的范围内 |
| \`resolution\` | \`string\` | 建议 | \`480p\`、\`720p\`、\`1080p\`，需为模型支持的分辨率；\`-T\` 系列不传时为 720p |
| \`ratio\` | \`string\` | 否 | 画面比例，如 \`16:9\`、\`9:16\`、\`1:1\`，可选值见「选择模型」 |
| \`images\` | \`string[]\` | 否 | 参考图片的公网 URL |
| \`videos\` | \`string[]\` | 否 | 参考视频的公网 URL |
| \`audios\` | \`string[]\` | 否 | 参考音频的公网 URL |
| \`first_image_url\` | \`string\` | 否 | 首帧图片的公网 URL |
| \`last_image_url\` | \`string\` | 否 | 尾帧图片的公网 URL，需与 \`first_image_url\` 一起使用 |

**每个任务生成 1 条视频**，不要传 \`n\`。表中未列出的参数不保证生效。

时长或分辨率超出模型范围时，提交会直接被拒绝，不会扣费。`,
        },
        {
          type: 'code',
          label: '示例：参考图生成竖屏视频',
          code: DOC_SAMPLES.createFull,
        },
        {
          type: 'markdown',
          text: '提交成功后返回任务信息，请保存 `id`，后续查询和下载都要用到：',
        },
        { type: 'code', label: '返回示例', code: DOC_SAMPLES.createResponse },
      ],
    },
    {
      id: 'media',
      title: '参考素材与首尾帧',
      blocks: [
        {
          type: 'markdown',
          text: `除纯文字生成外，有两种用法，**两种用法不能混用**：传了首尾帧就不要再传参考素材。

- **参考素材**：用 \`images\`、\`videos\`、\`audios\` 传入参考图、视频、音频，在提示词里描述它们如何出现在视频中；
- **首尾帧**：用 \`first_image_url\` 指定第一帧，可再用 \`last_image_url\` 指定最后一帧，模型生成中间的过渡。

**\`dfyb\` 系列的额外要求**：

- 每个素材都要在提示词里用 \`@图N\`、\`@视频N\`、\`@音频N\` 引用（按数组顺序从 1 开始编号）；
- 首尾帧需要首帧和尾帧图片同时传；
- \`seedance-2.0-dfyb\`：参考视频单段 1.8–15 秒、总长不超过 15 秒，音频每段 2–15 秒；\`seedance-2.5-dfyb\`：参考视频总长不超过 30 秒，音频每段 2–30 秒；
- 素材须为 HTTPS 链接，单个不超过 100MB。

**素材要求**：所有素材都必须是公网可直接访问的 HTTP(S) 链接，不能是需要登录的地址或本地文件路径。素材数量上限见「选择模型」。`,
        },
        {
          type: 'code',
          label: '示例：首尾帧生成',
          code: DOC_SAMPLES.firstLastFrame,
        },
        {
          type: 'code',
          label: '示例：dfyb 系列参考素材（提示词引用素材）',
          code: DOC_SAMPLES.dfybReference,
        },
      ],
    },
    {
      id: 'official',
      title: '官方模型写法',
      blocks: [
        {
          type: 'markdown',
          text: `\`doubao-\`、\`dreamina-\` 开头的 8 个官方模型同样使用 \`POST /v1/videos\`，查询和下载也完全一样，但请求参数写法不同：

| 参数 | 说明 |
| --- | --- |
| \`model\`、\`prompt\` | 同上 |
| \`seconds\` | 时长（秒）；Seedance 2.x 也可传 \`-1\`，由模型自动选择时长 |
| \`images\` | 图片的公网 URL：1 张为首帧，2 张为首帧 + 尾帧，3 张及以上（或同时有参考视频 / 音频）为参考图 |
| \`metadata.resolution\` | 分辨率，如 \`720p\`、\`1080p\`；**不要用顶层的 \`resolution\`** |
| \`metadata.ratio\` | 画面比例，如 \`16:9\`；**不要用顶层的 \`ratio\`** |
| \`metadata.content\` | 参考视频和音频，写法见下方示例 |
| \`metadata.generate_audio\` | 是否生成声音，默认生成；传 \`false\` 生成无声视频 |

- 官方模型不读取顶层的 \`resolution\`、\`ratio\`、\`videos\`、\`audios\`、\`first_image_url\`、\`last_image_url\`，传了也不会生效；
- 参考音频需要搭配参考图片或视频一起使用（Seedance 2.5 可只传音频）；
- 不传 \`metadata.resolution\` 时由模型选择，提交时按该模型最高 1080p 预扣，完成后按实际用量结算。`,
        },
        {
          type: 'code',
          label: '示例：文生视频（1080p、16:9）',
          code: DOC_SAMPLES.officialText,
        },
        {
          type: 'code',
          label: '示例：参考图 + 参考视频 + 参考音频',
          code: DOC_SAMPLES.officialReference,
        },
      ],
    },
    {
      id: 'query',
      title: '查询任务',
      blocks: [
        {
          type: 'markdown',
          text: `\`GET /v1/videos/{id}\`，建议每 5 秒查询一次。只能查询自己账号创建的任务。

| 状态 \`status\` | 含义 | 处理 |
| --- | --- | --- |
| \`queued\` | 排队中 | 继续轮询 |
| \`in_progress\` | 生成中，\`progress\` 为进度百分比 | 继续轮询 |
| \`completed\` | 已完成 | 调用下载接口获取视频 |
| \`failed\` | 失败 | 停止轮询，查看 \`error.message\` 中的原因 |

任务也可能在提交时就直接返回 \`failed\`（例如内容未通过审核）。完成后 \`completed_at\` 为完成时间：`,
        },
        {
          type: 'code',
          label: '完成时的返回示例',
          code: DOC_SAMPLES.completedResponse,
        },
        {
          type: 'code',
          label: '失败时的返回示例',
          code: DOC_SAMPLES.failedResponse,
        },
      ],
    },
    {
      id: 'download',
      title: '下载视频',
      blocks: [
        {
          type: 'markdown',
          text: `\`GET /v1/videos/{id}/content\`，状态为 \`completed\` 后再请求，同样需要携带 API 密钥。

- 接口可能直接返回视频文件，也可能重定向到临时存储地址。用 cURL 时请加上 \`-L\` 跟随跳转；
- 不要把 API 密钥转发给临时存储地址（cURL、Python requests、Node.js fetch 跨域跳转时默认不会转发）；
- 临时地址会过期，请下载后自行保存视频文件。

下载较慢时可以用多连接分段下载：接口支持 \`Range\` 请求头，可以把文件分成几段同时下载，再拼回完整文件。建议不超过 8 条连接；如果慢在整条线路上，开多条连接也可能提速不明显。`,
        },
        {
          type: 'code',
          label: '多连接下载（需安装 aria2）',
          code: DOC_SAMPLES.multiConnectionDownload,
        },
      ],
    },
    {
      id: 'examples',
      title: '完整代码示例',
      blocks: [
        {
          type: 'markdown',
          text: '以下示例完成「提交 → 轮询 → 下载」全流程。运行前先设置环境变量 `API_KEY`；换模型只需修改 `model` 和对应的时长、分辨率（官方模型按「官方模型写法」改请求体）。',
        },
        {
          type: 'code',
          label: 'Python（需安装 requests）',
          code: DOC_SAMPLES.python,
        },
        { type: 'code', label: 'Node.js', code: DOC_SAMPLES.node },
      ],
    },
    {
      id: 'images',
      title: '图片生成',
      blocks: [
        {
          type: 'markdown',
          text: `\`POST /v1/images/generations\`，兼容 OpenAI Images 接口，根据文字描述生成 PNG 图片。

| 模型 | 单张耗时（1024x1024，实测） | 返回内容 |
| --- | --- | --- |
| \`gpt-image-2.5-flare\` | 约 35–65 秒 | 默认同时返回 base64 和临时 \`url\` |
| \`gpt-image-2.5-sunburst\` | 约 1 分钟 | 默认同时返回 base64 和临时 \`url\` |
| \`gpt-image-2.5-flare-02\` | 1 分钟以上 | 请传 \`b64_json\`，否则可能只返回临时 \`url\` |
| \`gpt-image-2.6-01\` | 约 50–85 秒 | 请传 \`b64_json\`，否则可能只返回临时 \`url\` |

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| \`model\` | \`string\` | 是 | 模型名，见上表 |
| \`prompt\` | \`string\` | 是 | 图片描述 |
| \`n\` | \`integer\` | 否 | 生成张数，默认 1 |
| \`size\` | \`string\` | 否 | 图片尺寸，如 \`1024x1024\` |
| \`response_format\` | \`string\` | 否 | 传 \`b64_json\` 返回 base64 图片 |

- 接口**同步返回**，请把客户端超时设为 150 秒以上；
- 临时 \`url\` 会过期，请及时下载保存；
- 按实际返回的图片张数计费，与尺寸、质量无关；请求失败不扣费。
- 也可以直接用 OpenAI SDK 的 \`images.generate\` 调用，把 \`base_url\` 设为 \`{{BASE_URL}}/v1\` 即可。`,
        },
        { type: 'code', label: 'cURL', code: DOC_SAMPLES.imageCreate },
        { type: 'code', label: '返回示例', code: DOC_SAMPLES.imageResponse },
        {
          type: 'code',
          label: 'Python（保存为 PNG 文件）',
          code: DOC_SAMPLES.imagePython,
        },
      ],
    },
    {
      id: 'billing',
      title: '计费说明',
      blocks: [
        {
          type: 'markdown',
          text: `不同模型的计费方式不同，具体价格以 [模型广场](/pricing) 显示的为准：

| 计费方式 | 计算 | 模型 |
| --- | --- | --- |
| 按秒 | 视频时长（秒）× 该分辨率的每秒单价 | \`-T\` 系列（带不带参考视频同价）、\`dfyb\` 系列（带参考视频单价更高） |
| 按 token | token 数 × token 单价；token 数 =（输出时长 + 参考视频时长）× 宽 × 高 × 24 ÷ 1024，带参考视频时单价更低 | 官方模型（\`doubao-\`、\`dreamina-\` 开头） |
| 按张 | 实际返回的图片张数 × 单价，与尺寸、质量无关 | 图片模型 |

- 视频在提交任务时预扣费用；按 token 计费的模型完成后按实际用量结算；
- **视频任务失败会自动退回费用**，图片请求失败不扣费，可在控制台「消费记录」查看扣费与退款；
- 余额不足时提交会被拒绝，请先在「钱包」充值。`,
        },
      ],
    },
    {
      id: 'errors',
      title: '错误与重试',
      blocks: [
        {
          type: 'markdown',
          text: `请求失败时返回 \`error\` 对象：\`error.code\` 是固定的错误代码，适合在程序里判断；\`error.message\` 是可以直接展示给用户的说明，语言跟随账号的语言设置（未设置时按 \`Accept-Language\` 请求头）。`,
        },
        {
          type: 'code',
          label: '错误返回示例',
          code: DOC_SAMPLES.errorResponse,
        },
        {
          type: 'markdown',
          text: `**常见错误代码**

| \`error.code\` | 含义 | 处理 |
| --- | --- | --- |
| \`balance_insufficient\` | 余额不足 | 到「钱包」充值后再提交 |
| \`prompt_required\` | 未填写提示词 | 补充 \`prompt\` |
| \`invalid_duration\` | 模型不支持该时长 | 按「选择模型」调整 \`seconds\` |
| \`invalid_resolution\` | 模型不支持该分辨率或尺寸 | 按「选择模型」调整分辨率 |
| \`request_too_large\` | 请求内容过大 | 减少或压缩素材 |
| \`material_unreachable\` | 素材无法访问 | 确认链接有效、可公网访问 |
| \`material_public_url\` | 素材不是公网 http(s) 链接 | 改用公网可访问的链接 |
| \`moderation_prompt\` | 提示词未通过审核 | 修改提示词后重试 |
| \`model_unavailable\` | 模型暂时不可用，未扣费 | 稍后重试或换一个模型 |
| \`service_busy\` | 服务繁忙 | 稍后重试 |
| \`submit_timeout\` | 提交超时，未开始生成，已退款 | 重新提交 |

**其他情况**

| 情况 | 处理建议 |
| --- | --- |
| 401 / 403 | 检查密钥是否完整、是否已删除或过期；不要自动重试 |
| \`task_not_exist\` | 检查任务 ID 是否正确、是否由当前账号创建 |
| 429 / 查询临时失败 | 降低轮询频率，用同一个任务 ID 稍后再查 |
| 提交时超时、断线或 5xx | 任务可能已经创建成功，先到控制台「任务日志」确认，**不要直接重新提交** |

任务失败时，\`error.message\` 中会给出原因，例如内容未通过审核、素材无法下载等。修改请求后重新提交即可，失败的任务已自动退款。

> 每次 \`POST /v1/videos\` 都会创建一个新的计费任务。丢失任务 ID 时，请到控制台查找，不要通过重复提交来"找回"任务。`,
        },
      ],
    },
    {
      id: 'faq',
      title: '常见问题',
      blocks: [
        {
          type: 'markdown',
          text: `**生成一个视频要多久？**
取决于模型、时长、分辨率和排队情况，请以轮询到的状态为准，不要设置过短的超时。

**可以用 OpenAI SDK 调用吗？**
图片接口可以直接用 OpenAI SDK 调用。视频接口的路径和返回格式兼容 OpenAI 视频接口，建议直接用 HTTP 请求调用；参数请以本文档为准。

**上传本地图片怎么办？**
接口只接受公网 URL。请先把图片上传到对象存储或图床，再把链接填入参数。

**为什么官方模型设置的分辨率没生效？**
官方模型的分辨率和比例要写在 \`metadata\` 里，见「官方模型写法」。

**生成的视频和图片能保存多久？**
下载地址是临时的，请在完成后尽快下载保存。`,
        },
      ],
    },
    {
      id: 'support',
      title: '联系支持',
      blocks: [
        {
          type: 'markdown',
          text: `以下两种方式任选其一，选您方便的即可：

- QQ：**3895235714**
- Telegram：[@APIFinder_Support](https://t.me/APIFinder_Support)

反馈问题时请附上任务 ID 和请求时间，便于排查。官方人员不会主动私聊，也不会索要您的账号密码或 API 密钥。`,
        },
      ],
    },
  ],
}
