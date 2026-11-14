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
    'Call Seedance video models and GPT image models through OpenAI-compatible APIs: a video takes three endpoints (create a task, check its progress, download it), and an image comes back from a single request.',
  sections: [
    {
      id: 'overview',
      title: 'Overview',
      blocks: [
        {
          type: 'markdown',
          text: `**Base URL**: \`{{BASE_URL}}\`

| Endpoint | Purpose |
| --- | --- |
| \`POST /v1/videos\` | Create a video generation task |
| \`GET /v1/videos/{id}\` | Check a video task |
| \`GET /v1/videos/{id}/content\` | Download the video |
| \`POST /v1/images/generations\` | Generate images (synchronous) |

Video generation is asynchronous: create a task to get a task ID, poll its status, then download the video once it completes. Image generation is synchronous: one request returns the images.

Models differ in resolution, duration and billing, see Choosing a model and Image generation below. The model descriptions in the [Model Square](/pricing) always show the latest specs and live prices.`,
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
          text: 'Every request carries your API key in a header:',
        },
        { type: 'code', label: 'HTTP Header', code: DOC_SAMPLES.authHeader },
        {
          type: 'markdown',
          text: `- Send the full key, including the \`sk-\` prefix;
- Keep the key on your server, never in web page or app front-end code;
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
          text: `Video models come in three groups. **The first two share one set of parameters; the official models use a different one**, see Official model requests.

| Model | Resolution | Duration | Billing |
| --- | --- | --- | --- |
| \`seedance2.0-T\` | 480p–1080p | 4–15 s | Per second |
| \`seedance2.0-fast-T\` | 480p–720p | 4–15 s | Per second |
| \`seedance2.0-mini-T\` | 480p–720p | 4–15 s | Per second |
| \`seedance2.5-T\` | 480p–1080p | 4–30 s | Per second |
| \`seedance-2.0-dfyb\` | 480p–1080p | 4–15 s | Per second |
| \`seedance-2.5-dfyb\` | 480p–720p | 4–30 s | Per second |
| \`doubao-seedance-2-0-261111\` | 480p–4k | 4–15 s | Per token |
| \`doubao-seedance-2-0-fast-261111\` | 480p–720p | 4–15 s | Per token |
| \`doubao-seedance-2-0-mini-261111\` | 480p–720p | 4–15 s | Per token |
| \`doubao-seedance-2-5-261111\` | 480p–1080p | 4–30 s | Per token |
| \`dreamina-seedance-2-0-261111\` | 480p–4k | 4–15 s | Per token |
| \`dreamina-seedance-2-0-fast-261111\` | 480p–720p | 4–15 s | Per token |
| \`dreamina-seedance-2-0-mini-261111\` | 480p–720p | 4–15 s | Per token |
| \`dreamina-seedance-2-5-261111\` | 480p–1080p | 4–30 s | Per token |

**Reference limits**: the Seedance 2.0 models take up to 9 images, 3 videos and 3 audios; the Seedance 2.5 models up to 30 images, 10 videos and 10 audios; \`seedance-2.0-dfyb\` takes at most 12 files in all and \`seedance-2.5-dfyb\` at most 50.

**Which one to pick**

- **4K**: only the official \`doubao-seedance-2-0-261111\` and \`dreamina-seedance-2-0-261111\`;
- **Long videos**: the Seedance 2.5 models go up to 30 seconds per clip;
- **Faster and cheaper**: models with \`fast\` or \`mini\` in the name;
- **Many references**: the Seedance 2.5 models take up to 30 reference images, 10 reference videos and 10 reference audios;
- **Official models**: \`doubao-\` models run on ByteDance Volcano Engine, \`dreamina-\` models on BytePlus outside China; both can generate sound.

**Aspect ratios**: the \`-T\` models take \`16:9\`, \`9:16\`, \`1:1\`, \`4:3\`, \`3:4\`, \`21:9\` and \`9:21\`; the \`dfyb\` models take \`16:9\`, \`9:16\`, \`1:1\`, \`4:3\`, \`3:4\` and \`21:9\`; the official models take \`21:9\`, \`16:9\`, \`4:3\`, \`1:1\`, \`3:4\` and \`9:16\`, and Seedance 2.5 also takes \`adaptive\`. Without a ratio, a \`-T\` model with a first frame or reference image follows the media.`,
        },
      ],
    },
    {
      id: 'create',
      title: 'Creating a task',
      blocks: [
        {
          type: 'markdown',
          text: `\`POST /v1/videos\` with a JSON body (\`Content-Type: application/json\`). The table applies to the \`-T\` and \`dfyb\` models; for the official models see Official model requests.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| \`model\` | \`string\` | Yes | Model name, see Choosing a model |
| \`prompt\` | \`string\` | Yes | Video description, not empty |
| \`seconds\` | \`integer\` | Recommended | Duration in whole seconds, within the model's range |
| \`resolution\` | \`string\` | Recommended | \`480p\`, \`720p\` or \`1080p\`, one the model supports; the \`-T\` models default to 720p |
| \`ratio\` | \`string\` | No | Aspect ratio such as \`16:9\`, \`9:16\` or \`1:1\`, see Choosing a model |
| \`images\` | \`string[]\` | No | Public URLs of reference images |
| \`videos\` | \`string[]\` | No | Public URLs of reference videos |
| \`audios\` | \`string[]\` | No | Public URLs of reference audios |
| \`first_image_url\` | \`string\` | No | Public URL of the first frame |
| \`last_image_url\` | \`string\` | No | Public URL of the last frame, used together with \`first_image_url\` |

**Each task produces one video**, so do not send \`n\`. Parameters not listed here are not guaranteed to take effect.

A duration or resolution outside the model's range is rejected at submission, and nothing is charged.`,
        },
        {
          type: 'code',
          label: 'Example: portrait video from a reference image',
          code: DOC_SAMPLES.createFull,
        },
        {
          type: 'markdown',
          text: 'A successful submission returns the task. Keep its `id` for checking and downloading:',
        },
        {
          type: 'code',
          label: 'Response',
          code: DOC_SAMPLES.createResponse,
        },
      ],
    },
    {
      id: 'media',
      title: 'Reference media and first/last frames',
      blocks: [
        {
          type: 'markdown',
          text: `Besides text-only generation there are two modes, and **they cannot be combined**: if you send first/last frames, send no reference media.

- **Reference media**: pass reference images, videos and audios in \`images\`, \`videos\` and \`audios\`, and describe in the prompt how they appear in the video;
- **First/last frames**: set the first frame with \`first_image_url\`, optionally the last with \`last_image_url\`, and the model generates the motion in between.

**Extra rules for the \`dfyb\` models**:

- Reference each file in the prompt as \`@图N\`, \`@视频N\` or \`@音频N\` (image, video, audio), numbered from 1 in array order;
- First/last-frame mode needs both the first and the last frame;
- \`seedance-2.0-dfyb\`: each reference video 1.8–15 s and 15 s in all, each audio 2–15 s; \`seedance-2.5-dfyb\`: reference videos 30 s in all, each audio 2–30 s;
- Media must be HTTPS links of at most 100 MB each.

**Media requirements**: every file must be a public HTTP(S) link that can be fetched directly, not an address behind a login or a local path. See Choosing a model for the count limits.`,
        },
        {
          type: 'code',
          label: 'Example: first and last frames',
          code: DOC_SAMPLES.firstLastFrame,
        },
        {
          type: 'code',
          label: 'Example: dfyb reference media referenced in the prompt',
          code: DOC_SAMPLES.dfybReference,
        },
      ],
    },
    {
      id: 'official',
      title: 'Official model requests',
      blocks: [
        {
          type: 'markdown',
          text: `The 8 official models starting with \`doubao-\` or \`dreamina-\` also use \`POST /v1/videos\`, and checking and downloading work the same, but the request parameters differ:

| Parameter | Description |
| --- | --- |
| \`model\`, \`prompt\` | As above |
| \`seconds\` | Duration in seconds; Seedance 2.x also takes \`-1\` to let the model choose |
| \`images\` | Public image URLs: 1 is the first frame, 2 are the first and last frames, 3 or more (or any with reference video or audio) are reference images |
| \`metadata.resolution\` | Resolution such as \`720p\` or \`1080p\`; **not the top-level \`resolution\`** |
| \`metadata.ratio\` | Aspect ratio such as \`16:9\`; **not the top-level \`ratio\`** |
| \`metadata.content\` | Reference videos and audios, see the example below |
| \`metadata.generate_audio\` | Whether to generate sound, on by default; \`false\` makes a silent video |

- The official models ignore the top-level \`resolution\`, \`ratio\`, \`videos\`, \`audios\`, \`first_image_url\` and \`last_image_url\`;
- A reference audio needs a reference image or video with it (Seedance 2.5 takes audio alone);
- Without \`metadata.resolution\` the model chooses; the submission reserves the model's highest tier up to 1080p, and completion settles the actual usage.`,
        },
        {
          type: 'code',
          label: 'Example: text to video (1080p, 16:9)',
          code: DOC_SAMPLES.officialText,
        },
        {
          type: 'code',
          label: 'Example: reference image, video and audio',
          code: DOC_SAMPLES.officialReference,
        },
      ],
    },
    {
      id: 'query',
      title: 'Checking a task',
      blocks: [
        {
          type: 'markdown',
          text: `\`GET /v1/videos/{id}\`. Poll about every 5 seconds. You can only check tasks your own account created.

| \`status\` | Meaning | What to do |
| --- | --- | --- |
| \`queued\` | Waiting in the queue | Keep polling |
| \`in_progress\` | Generating; \`progress\` is the percentage | Keep polling |
| \`completed\` | Done | Download the video |
| \`failed\` | Failed | Stop polling and read \`error.message\` |

A task can also come back \`failed\` right at submission, for example when moderation rejects the content. Once done, \`completed_at\` holds the completion time:`,
        },
        {
          type: 'code',
          label: 'Completed response',
          code: DOC_SAMPLES.completedResponse,
        },
        {
          type: 'code',
          label: 'Failed response',
          code: DOC_SAMPLES.failedResponse,
        },
      ],
    },
    {
      id: 'download',
      title: 'Downloading the video',
      blocks: [
        {
          type: 'markdown',
          text: `\`GET /v1/videos/{id}/content\`, once the status is \`completed\`, with your API key as usual.

- The endpoint may return the file directly or redirect to temporary storage. With cURL, add \`-L\` to follow the redirect;
- Do not forward your API key to the storage address (cURL, Python requests and Node.js fetch drop it on cross-origin redirects by default);
- The temporary address expires, so save the file after downloading.

If the download is slow, download it over several connections: the endpoint supports the \`Range\` header, so you can fetch the file in parts at once and join them. Use at most 8 connections; if the whole route is slow, more connections may not help much.`,
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
          text: 'These examples run the whole create → poll → download flow. Set the `API_KEY` environment variable first. To switch models, change `model` and its duration and resolution (for the official models, shape the body as in Official model requests).',
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
      id: 'images',
      title: 'Image generation',
      blocks: [
        {
          type: 'markdown',
          text: `\`POST /v1/images/generations\`, compatible with the OpenAI Images API, turns a text prompt into PNG images.

| Model | Time per image (1024x1024, measured) | Returns |
| --- | --- | --- |
| \`gpt-image-2.5-flare\` | About 35–65 s | Base64 and a temporary \`url\` by default |
| \`gpt-image-2.5-sunburst\` | About 1 min | Base64 and a temporary \`url\` by default |
| \`gpt-image-2.5-flare-02\` | Over 1 min | Send \`b64_json\`, otherwise you may get only a temporary \`url\` |
| \`gpt-image-2.6-01\` | About 50–85 s | Send \`b64_json\`, otherwise you may get only a temporary \`url\` |

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| \`model\` | \`string\` | Yes | Model name, see the table above |
| \`prompt\` | \`string\` | Yes | Image description |
| \`n\` | \`integer\` | No | Number of images, default 1 |
| \`size\` | \`string\` | No | Image size such as \`1024x1024\` |
| \`response_format\` | \`string\` | No | \`b64_json\` returns base64 images |

- The API **responds synchronously**; set the client timeout to 150 seconds or more;
- The temporary \`url\` expires, so save the image promptly;
- Billing follows the number of images returned, regardless of size or quality; failed requests are not charged;
- The OpenAI SDK's \`images.generate\` works too: set \`base_url\` to \`{{BASE_URL}}/v1\`.`,
        },
        { type: 'code', label: 'cURL', code: DOC_SAMPLES.imageCreate },
        { type: 'code', label: 'Response', code: DOC_SAMPLES.imageResponse },
        {
          type: 'code',
          label: 'Python (saves PNG files)',
          code: DOC_SAMPLES.imagePython,
        },
      ],
    },
    {
      id: 'billing',
      title: 'Billing',
      blocks: [
        {
          type: 'markdown',
          text: `Models are billed in different ways. The [Model Square](/pricing) shows the actual prices:

| Billing | Calculation | Models |
| --- | --- | --- |
| Per second | Video length in seconds × the per-second price of the resolution | \`-T\` models (same price with or without a reference video), \`dfyb\` models (higher price with a reference video) |
| Per token | Tokens × token price; tokens = (output seconds + reference video seconds) × width × height × 24 ÷ 1024, at a lower price with a reference video | Official models (\`doubao-\`, \`dreamina-\`) |
| Per image | Images returned × price per image, regardless of size or quality | Image models |

- A video is charged when the task is created; per-token models settle the actual usage on completion;
- **A failed video task is refunded automatically**, and a failed image request is not charged. See charges and refunds on the Billing Records page of the console;
- A submission is rejected when the balance is too low; top up on the Wallet page first.`,
        },
      ],
    },
    {
      id: 'errors',
      title: 'Errors and retries',
      blocks: [
        {
          type: 'markdown',
          text: `A failed request returns an \`error\` object: \`error.code\` is a fixed code for your program to check, and \`error.message\` is a sentence you can show your users. Its language follows your account's language setting, or the \`Accept-Language\` header when none is set.`,
        },
        {
          type: 'code',
          label: 'Error response',
          code: DOC_SAMPLES.errorResponse,
        },
        {
          type: 'markdown',
          text: `**Common error codes**

| \`error.code\` | Meaning | What to do |
| --- | --- | --- |
| \`balance_insufficient\` | Balance too low | Top up on the Wallet page, then submit again |
| \`prompt_required\` | No prompt | Send a \`prompt\` |
| \`invalid_duration\` | Duration not supported by the model | Adjust \`seconds\` per Choosing a model |
| \`invalid_resolution\` | Resolution or size not supported | Adjust the resolution per Choosing a model |
| \`request_too_large\` | Request too large | Send fewer or smaller files |
| \`material_unreachable\` | A media file could not be fetched | Check that the link works publicly |
| \`material_public_url\` | A media link is not a public http(s) URL | Use a publicly accessible link |
| \`moderation_prompt\` | The prompt failed moderation | Change the prompt and retry |
| \`model_unavailable\` | Model temporarily unavailable, not charged | Retry later or use another model |
| \`service_busy\` | The service is busy | Retry later |
| \`submit_timeout\` | Submission timed out before generation, refunded | Submit again |

**Other cases**

| Case | What to do |
| --- | --- |
| 401 / 403 | Check that the key is complete and not deleted or expired; do not retry automatically |
| \`task_not_exist\` | Check the task ID and that your account created it |
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
For images, yes. The video paths and responses follow the OpenAI video API, and plain HTTP requests work best there. Use the parameters in this document.

**How do I use a local image?**
The API only takes public URLs. Upload the image to object storage or an image host first, then pass its link.

**Why is my resolution ignored on an official model?**
The official models read the resolution and ratio from \`metadata\`, see Official model requests.

**How long are videos and images kept?**
Download links are temporary. Download and save the files soon after they are ready.`,
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
