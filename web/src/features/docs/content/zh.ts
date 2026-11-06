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
    '通过兼容 OpenAI 视频接口的 API 调用 Seedance、Wan 等视频生成模型：提交任务、查询进度、下载视频，三个接口即可完成接入，所有模型用法相同。',
  sections: [
    {
      id: 'overview',
      title: '概览',
      blocks: [
        {
          type: 'markdown',
          text: `**接口地址（Base URL）**：\`{{BASE_URL}}\`

视频生成是异步任务：先提交任务拿到任务 ID，再轮询任务状态，完成后下载视频。

| 接口 | 用途 |
| --- | --- |
| \`POST /v1/videos\` | 提交生成任务 |
| \`GET /v1/videos/{id}\` | 查询任务状态 |
| \`GET /v1/videos/{id}/content\` | 下载视频 |

所有视频模型都使用这三个接口，换模型只需要改 \`model\` 参数。各模型支持的分辨率、时长和计费方式不同，见下方「选择模型」；最新规格和实时价格以 [模型广场](/pricing) 中的模型说明为准。`,
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
          text: `| 模型 | 分辨率 | 时长 | 计费 |
| --- | --- | --- | --- |
| \`seedance-2.0\` | 480p / 720p / 1080p / 4k | 4–15 秒 | 按秒 |
| \`seedance-2.0-fast\` | 480p / 720p | 4–15 秒 | 按秒 |
| \`seedance-2.0-mini\` | 480p / 720p | 4–15 秒 | 按秒 |
| \`sd-2.0-线路1\` | 720p | 4–15 秒 | 按秒 |
| \`sd-2.0-线路1-fast\` | 720p | 4–15 秒 | 按秒 |
| \`seedance-2.5\` | 480p / 720p / 1080p | 4–30 秒 | 按秒 |
| \`sd-2.5-线路1（2.5）\` | 720p | 4–30 秒 | 按秒 |
| \`seedance-2.5-G2-V\` | 720p | 5–30 秒 | 按条 |
| \`seedance-2.5-g4-m1-官转\` | 480p | 4–25 秒 | 按条 |
| \`wan3.0-超限\` | 480p / 720p / 1080p | 5–30 秒 | 按秒 |

**怎么选**

- **要高清或 4K**：\`seedance-2.0\`（最高 4K）或 \`seedance-2.5\`（最高 1080p）；
- **要长视频**：Seedance 2.5 系列和 \`wan3.0-超限\` 单段最长 30 秒；
- **要更快、更便宜**：\`seedance-2.0-fast\`、\`seedance-2.0-mini\`；
- **大量参考素材**：\`sd-2.5-线路1（2.5）\`、\`seedance-2.5-G2-V\`、\`seedance-2.5-g4-m1-官转\` 最多 30 张参考图、10 段参考视频、10 段参考音频；
- **长视频控制成本**：\`seedance-2.5-G2-V\`、\`seedance-2.5-g4-m1-官转\` 按条计费，时长越长越划算。

**画面比例**：\`seedance-2.0\`、\`seedance-2.0-fast\`、\`seedance-2.0-mini\`、\`seedance-2.5\` 支持 \`16:9\`、\`9:16\`、\`1:1\`、\`21:9\`、\`4:3\`、\`3:4\`；\`seedance-2.5-G2-V\`、\`seedance-2.5-g4-m1-官转\`、\`wan3.0-超限\` 只支持 \`16:9\`、\`9:16\`、\`1:1\`。

**其他限制**：\`sd-2.0-线路1\` 系列最多 9 张参考图、3 段参考视频、3 段参考音频；\`wan3.0-超限\` 最多 10 张参考图、5 段参考音频，不支持参考视频；\`seedance-2.5-g4-m1-官转\` 提示词最长 15000 字符。`,
        },
      ],
    },
    {
      id: 'create',
      title: '创建任务',
      blocks: [
        {
          type: 'markdown',
          text: `\`POST /v1/videos\`，请求体为 JSON（\`Content-Type: application/json\`）。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| \`model\` | \`string\` | 是 | 模型名，见「选择模型」 |
| \`prompt\` | \`string\` | 是 | 视频描述，不能为空 |
| \`seconds\` | \`integer\` | 否 | 时长（秒），整数，需在模型支持的范围内；不传时为 5 秒 |
| \`resolution\` | \`string\` | 否 | \`480p\`、\`720p\`、\`1080p\`、\`4k\`，需为模型支持的分辨率；不传时为 720p（只支持 480p 的模型为 480p） |
| \`ratio\` | \`string\` | 否 | 画面比例，如 \`16:9\`、\`9:16\`、\`1:1\`，可选值见「选择模型」 |
| \`images\` | \`string[]\` | 否 | 参考图片的公网 URL |
| \`videos\` | \`string[]\` | 否 | 参考视频的公网 URL |
| \`audios\` | \`string[]\` | 否 | 参考音频的公网 URL |
| \`first_image_url\` | \`string\` | 否 | 首帧图片的公网 URL |
| \`last_image_url\` | \`string\` | 否 | 尾帧图片的公网 URL，需与 \`first_image_url\` 一起使用 |

**兼容写法**：\`duration\` 等同于 \`seconds\`，两者同时传时必须相等；\`size\` 可用像素写法指定分辨率，可选 \`854x480\`、\`480x854\`、\`1280x720\`、\`720x1280\`、\`720x720\`、\`1920x1080\`、\`1080x1920\`、\`3840x2160\`、\`2160x3840\`，与 \`resolution\` 同时传时必须一致。

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
          text: `除纯文字生成外，有两种用法：

- **参考素材**：用 \`images\`、\`videos\`、\`audios\` 传入参考图、视频、音频，在提示词里描述它们如何出现在视频中；
- **首尾帧**：用 \`first_image_url\` 指定第一帧，可再用 \`last_image_url\` 指定最后一帧，模型生成中间的过渡。

\`seedance-2.5-G2-V\`、\`seedance-2.5-g4-m1-官转\` 的两种用法**不能混用**：传了首尾帧就不要再传参考素材。\`wan3.0-超限\` 只传一两张图片时，会按首尾帧处理。

**素材要求**：所有素材都必须是公网可直接访问的 HTTP(S) 链接，不能是需要登录的地址或本地文件路径。素材数量上限见「选择模型」。`,
        },
        {
          type: 'code',
          label: '示例：首尾帧生成',
          code: DOC_SAMPLES.firstLastFrame,
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
          text: '以下示例完成「提交 → 轮询 → 下载」全流程。运行前先设置环境变量 `API_KEY`；换模型只需修改 `model` 和对应的时长、分辨率。',
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
      id: 'billing',
      title: '计费说明',
      blocks: [
        {
          type: 'markdown',
          text: `不同模型的计费方式不同，具体价格以 [模型广场](/pricing) 显示的为准：

| 计费方式 | 计算 | 模型 |
| --- | --- | --- |
| 按秒 | 视频时长（秒）× 该分辨率的每秒单价 | 选择模型表中标为「按秒」的模型 |
| 按条 | 每条视频固定价格，与时长无关 | \`seedance-2.5-G2-V\`、\`seedance-2.5-g4-m1-官转\` |

- 提交任务时按请求的时长和分辨率扣费，带不带参考素材价格相同；
- **任务失败会自动退回费用**，可在控制台「使用日志」查看扣费与退款记录；
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
          text: `| 情况 | 处理建议 |
| --- | --- |
| 400 参数校验失败 | 检查模型名、时长范围、分辨率、参数写法和素材 URL |
| 401 / 403 | 检查密钥是否完整、是否已删除或过期；不要自动重试 |
| 余额不足 | 到「钱包」充值后再提交 |
| 404 或 \`task_not_exist\` | 检查任务 ID 是否正确、是否由当前账号创建 |
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
接口路径和返回格式兼容 OpenAI 视频接口，可以直接用 HTTP 请求调用；参数请以本文档为准。

**上传本地图片怎么办？**
接口只接受公网 URL。请先把图片上传到对象存储或图床，再把链接填入参数。

**模型名里有中文，会不会出问题？**
不会，请原样填写模型名（包括括号），JSON 请求体使用 UTF-8 编码即可。

**生成的视频能保存多久？**
下载地址是临时的，请在任务完成后尽快下载保存。`,
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
