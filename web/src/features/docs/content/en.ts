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

export const EN_DOCS: DocContent = {
  title: 'API documentation',
  intro:
    'Call Seedance, Wan and other video generation models through an OpenAI-compatible video API: create a task, check its progress, download the video. Three endpoints are all you need, and every model works the same way.',
  sections: [
    {
      id: 'overview',
      title: 'Overview',
      blocks: [
        {
          type: 'markdown',
          text: `**Base URL**: \`{{BASE_URL}}\`

Video generation is asynchronous: create a task to get a task ID, poll its status, then download the video once it completes.

| Endpoint | Purpose |
| --- | --- |
| \`POST /v1/videos\` | Create a generation task |
| \`GET /v1/videos/{id}\` | Check the task status |
| \`GET /v1/videos/{id}/content\` | Download the video |

Every video model uses these three endpoints; to switch models, change the \`model\` parameter. Models differ in resolution, duration and billing, see Choosing a model below. The model descriptions in the [Model Square](/pricing) always show the latest specs and live prices.`,
        },
      ],
    },
    {
      id: 'quickstart',
      title: 'Quick start',
      blocks: [
        {
          type: 'markdown',
          text: `1. [Sign up](/sign-up) and sign in;
2. Top up on the Wallet page of the console;
3. Create an API key (starting with \`sk-\`) on the API Keys page;
4. Call the three endpoints below in order: create a task → check its status → download the video.`,
        },
        {
          type: 'code',
          label: '1. Create a task',
          code: DOC_SAMPLES.quickCreate,
        },
        {
          type: 'code',
          label: '2. Check the status',
          code: DOC_SAMPLES.quickQuery,
        },
        {
          type: 'code',
          label: '3. Download the video',
          code: DOC_SAMPLES.quickDownload,
        },
      ],
    },
    {
      id: 'authentication',
      title: 'Authentication',
      blocks: [
        {
          type: 'markdown',
          text: 'Every request must carry your API key in the request header:',
        },
        { type: 'code', label: 'HTTP Header', code: DOC_SAMPLES.authHeader },
        {
          type: 'markdown',
          text: `- Send the full key, including the \`sk-\` prefix;
- Keep the key on your server. Never put it in web or app front-end code;
- If a key leaks, delete it on the API Keys page right away and create a new one.`,
        },
      ],
    },
    {
      id: 'models',
      title: 'Choosing a model',
      blocks: [
        {
          type: 'markdown',
          text: `| Model | Resolution | Duration | Billing |
| --- | --- | --- | --- |
| \`seedance-2.0\` | 480p / 720p / 1080p / 4k | 4–15 s | Per second |
| \`seedance-2.0-fast\` | 480p / 720p | 4–15 s | Per second |
| \`seedance-2.0-mini\` | 480p / 720p | 4–15 s | Per second |
| \`sd-2.0-线路1\` | 720p | 4–15 s | Per second |
| \`sd-2.0-线路1-fast\` | 720p | 4–15 s | Per second |
| \`seedance-2.5\` | 480p / 720p / 1080p | 4–30 s | Per second |
| \`sd-2.5-线路1（2.5）\` | 720p | 4–30 s | Per second |
| \`seedance-2.5-G2-V\` | 720p | 5–30 s | Per video |
| \`seedance-2.5-g4-m1-官转\` | 480p | 4–25 s | Per video |
| \`wan3.0-超限\` | 480p / 720p / 1080p | 5–30 s | Per second |

**How to choose**

- **High definition or 4K**: \`seedance-2.0\` (up to 4K) or \`seedance-2.5\` (up to 1080p);
- **Long clips**: the Seedance 2.5 models and \`wan3.0-超限\` go up to 30 seconds per clip;
- **Faster and cheaper**: \`seedance-2.0-fast\`, \`seedance-2.0-mini\`;
- **Many reference files**: \`sd-2.5-线路1（2.5）\`, \`seedance-2.5-G2-V\` and \`seedance-2.5-g4-m1-官转\` take up to 30 reference images, 10 reference videos and 10 reference audio clips;
- **Long clips on a budget**: \`seedance-2.5-G2-V\` and \`seedance-2.5-g4-m1-官转\` charge per video, so longer clips cost less per second.

**Aspect ratio**: \`seedance-2.0\`, \`seedance-2.0-fast\`, \`seedance-2.0-mini\` and \`seedance-2.5\` support \`16:9\`, \`9:16\`, \`1:1\`, \`21:9\`, \`4:3\`, \`3:4\`; \`seedance-2.5-G2-V\`, \`seedance-2.5-g4-m1-官转\` and \`wan3.0-超限\` support only \`16:9\`, \`9:16\`, \`1:1\`.

**Other limits**: the \`sd-2.0-线路1\` models take up to 9 reference images, 3 reference videos and 3 reference audio clips; \`wan3.0-超限\` takes up to 10 reference images and 5 reference audio clips and no reference video; \`seedance-2.5-g4-m1-官转\` accepts prompts of up to 15,000 characters.`,
        },
      ],
    },
    {
      id: 'create',
      title: 'Create a task',
      blocks: [
        {
          type: 'markdown',
          text: `\`POST /v1/videos\` with a JSON body (\`Content-Type: application/json\`).

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| \`model\` | \`string\` | Yes | Model name, see Choosing a model |
| \`prompt\` | \`string\` | Yes | Text description of the video; must not be empty |
| \`seconds\` | \`integer\` | No | Duration in whole seconds, within the model's range; 5 when omitted |
| \`resolution\` | \`string\` | No | \`480p\`, \`720p\`, \`1080p\` or \`4k\`, one the model supports; 720p when omitted (480p for the 480p-only model) |
| \`ratio\` | \`string\` | No | Aspect ratio such as \`16:9\`, \`9:16\`, \`1:1\`; see Choosing a model for the values |
| \`images\` | \`string[]\` | No | Public URLs of reference images |
| \`videos\` | \`string[]\` | No | Public URLs of reference videos |
| \`audios\` | \`string[]\` | No | Public URLs of reference audio |
| \`first_image_url\` | \`string\` | No | Public URL of the first-frame image |
| \`last_image_url\` | \`string\` | No | Public URL of the last-frame image; use together with \`first_image_url\` |

**Alternative forms**: \`duration\` is the same as \`seconds\`; if you send both they must be equal. \`size\` sets the resolution as a pixel size: \`854x480\`, \`480x854\`, \`1280x720\`, \`720x1280\`, \`720x720\`, \`1920x1080\`, \`1080x1920\`, \`3840x2160\` or \`2160x3840\`; if you also send \`resolution\` the two must match.

**Each task generates one video**, so do not send \`n\`. Parameters not listed here are not guaranteed to take effect.

A duration or resolution outside the model's range is rejected at submission, with no charge.`,
        },
        {
          type: 'code',
          label: 'Example: vertical video from a reference image',
          code: DOC_SAMPLES.createFull,
        },
        {
          type: 'markdown',
          text: 'A successful request returns the task. Keep its `id`; you need it to check the status and download the video:',
        },
        { type: 'code', label: 'Response', code: DOC_SAMPLES.createResponse },
      ],
    },
    {
      id: 'media',
      title: 'Reference media and frames',
      blocks: [
        {
          type: 'markdown',
          text: `Besides text-only generation, there are two ways to guide a video:

- **Reference media**: pass reference images, videos and audio in \`images\`, \`videos\` and \`audios\`, and describe in the prompt how they appear in the video;
- **First and last frames**: set the first frame with \`first_image_url\`, optionally the last frame with \`last_image_url\`, and the model generates the motion between them.

On \`seedance-2.5-G2-V\` and \`seedance-2.5-g4-m1-官转\` the two **cannot be mixed**: when you send frames, send no reference media. On \`wan3.0-超限\`, one or two images alone are used as the first and last frames.

**Media requirements**: every file must be a public HTTP(S) link that can be fetched directly — not a URL behind a login and not a local file path. See Choosing a model for how many files each model takes.`,
        },
        {
          type: 'code',
          label: 'Example: first and last frame',
          code: DOC_SAMPLES.firstLastFrame,
        },
      ],
    },
    {
      id: 'query',
      title: 'Check a task',
      blocks: [
        {
          type: 'markdown',
          text: `\`GET /v1/videos/{id}\`. Poll about every 5 seconds. You can only read tasks created by your own account.

| \`status\` | Meaning | What to do |
| --- | --- | --- |
| \`queued\` | Waiting in the queue | Keep polling |
| \`in_progress\` | Generating; \`progress\` is a percentage | Keep polling |
| \`completed\` | Done | Call the download endpoint |
| \`failed\` | Failed | Stop polling and read the reason in \`error.message\` |

A task can also come back as \`failed\` right when it is created (for example, when the content is rejected by moderation). Once completed, \`completed_at\` is the completion time:`,
        },
        {
          type: 'code',
          label: 'Response when completed',
          code: DOC_SAMPLES.completedResponse,
        },
        {
          type: 'code',
          label: 'Response when failed',
          code: DOC_SAMPLES.failedResponse,
        },
      ],
    },
    {
      id: 'download',
      title: 'Download the video',
      blocks: [
        {
          type: 'markdown',
          text: `\`GET /v1/videos/{id}/content\`, once the status is \`completed\`. This also requires your API key.

- The endpoint may return the file directly or redirect to temporary storage. With cURL, add \`-L\` to follow the redirect;
- Do not forward your API key to the storage host (cURL, Python requests and Node.js fetch drop it on cross-host redirects by default);
- The temporary link expires, so download and keep your own copy of the video.

If a download is slow, try a multi-connection download: the endpoint supports the \`Range\` header, so you can fetch several parts at once and join them into the full file. Use no more than 8 connections. If the whole network path is slow, more connections may not help much.`,
        },
        {
          type: 'code',
          label: 'Multi-connection download (requires aria2)',
          code: DOC_SAMPLES.multiConnectionDownload,
        },
      ],
    },
    {
      id: 'examples',
      title: 'Full code examples',
      blocks: [
        {
          type: 'markdown',
          text: 'These examples run the full create → poll → download flow. Set the `API_KEY` environment variable first. To use another model, change `model` and pick a duration and resolution it supports.',
        },
        {
          type: 'code',
          label: 'Python (requires requests)',
          code: DOC_SAMPLES.python,
        },
        { type: 'code', label: 'Node.js', code: DOC_SAMPLES.node },
      ],
    },
    {
      id: 'billing',
      title: 'Billing',
      blocks: [
        {
          type: 'markdown',
          text: `Models are billed in different ways. The [Model Square](/pricing) shows the current prices:

| Billing | How it is calculated | Models |
| --- | --- | --- |
| Per second | Video duration (seconds) × the per-second price of the resolution | Models marked Per second in Choosing a model |
| Per video | A fixed price per video, whatever the duration | \`seedance-2.5-G2-V\`, \`seedance-2.5-g4-m1-官转\` |

- The charge is taken when you create a task, based on the requested duration and resolution; reference media do not change the price;
- **If a task fails, the charge is refunded automatically.** Charges and refunds appear in the usage logs of the console;
- Requests are rejected when your balance is too low. Top up on the Wallet page first.`,
        },
      ],
    },
    {
      id: 'errors',
      title: 'Errors and retries',
      blocks: [
        {
          type: 'markdown',
          text: `| Case | What to do |
| --- | --- |
| 400 validation error | Check the model name, duration range, resolution, parameter names and media URLs |
| 401 / 403 | Check that the key is complete and not deleted or expired; do not retry automatically |
| Insufficient balance | Top up on the Wallet page, then submit again |
| 404 or \`task_not_exist\` | Check the task ID and that your account created it |
| 429 / temporary query failure | Poll less often and query the same task ID again later |
| Timeout, disconnect or 5xx when creating | The task may have been created. Check the task logs in the console first — **do not just submit again** |

When a task fails, \`error.message\` gives the reason, such as content rejected by moderation or a media file that could not be fetched. Fix the request and submit again; the failed task has already been refunded.

> Every \`POST /v1/videos\` creates a new billable task. If you lose a task ID, find it in the console instead of submitting again.`,
        },
      ],
    },
    {
      id: 'faq',
      title: 'FAQ',
      blocks: [
        {
          type: 'markdown',
          text: `**How long does a video take?**
It depends on the model, duration, resolution and queue length. Rely on the polled status and avoid short client timeouts.

**Can I use the OpenAI SDK?**
Paths and responses follow the OpenAI video API, so plain HTTP requests work well. Use the parameters in this document.

**How do I use a local image?**
The API only takes public URLs. Upload the image to object storage or an image host first, then pass its link.

**Some model names contain Chinese characters. Is that a problem?**
No. Send the model name exactly as shown, brackets included, in a UTF-8 JSON body.

**How long is the video kept?**
The download link is temporary. Download and save the video soon after the task completes.`,
        },
      ],
    },
    {
      id: 'support',
      title: 'Support',
      blocks: [
        {
          type: 'markdown',
          text: `Reach us on whichever app is convenient for you:

- QQ: **3895235714**
- Telegram: [@APIFinder_Support](https://t.me/APIFinder_Support)

Include the task ID and request time when you report a problem. Our staff never message you first and never ask for your password or API key.`,
        },
      ],
    },
  ],
}
