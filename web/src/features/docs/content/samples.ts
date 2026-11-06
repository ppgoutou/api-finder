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

/**
 * Code samples shared by every language of the API docs. `{{BASE_URL}}` is
 * replaced with the site address when the page renders.
 */
export const DOC_SAMPLES = {
  authHeader: 'Authorization: Bearer sk-xxxxxxxxxxxxxxxx',

  quickCreate: [
    'curl {{BASE_URL}}/v1/videos \\',
    '  -H "Authorization: Bearer $API_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    "  -d '{",
    '    "model": "seedance-2.0",',
    '    "prompt": "A red sports car drifts through a rainy neon street at night, low tracking shot",',
    '    "seconds": 5,',
    '    "resolution": "720p",',
    '    "ratio": "16:9"',
    "  }'",
  ].join('\n'),

  quickQuery: [
    'curl {{BASE_URL}}/v1/videos/$TASK_ID \\',
    '  -H "Authorization: Bearer $API_KEY"',
  ].join('\n'),

  quickDownload: [
    'curl -L {{BASE_URL}}/v1/videos/$TASK_ID/content \\',
    '  -H "Authorization: Bearer $API_KEY" \\',
    '  -o video.mp4',
  ].join('\n'),

  multiConnectionDownload: [
    'aria2c -x 8 -s 8 \\',
    '  --header="Authorization: Bearer $API_KEY" \\',
    '  -o video.mp4 \\',
    '  "{{BASE_URL}}/v1/videos/$TASK_ID/content"',
  ].join('\n'),

  createFull: JSON.stringify(
    {
      model: 'seedance-2.0',
      prompt:
        'The woman in the first image turns to the camera and smiles, soft morning light',
      seconds: 8,
      resolution: '1080p',
      ratio: '9:16',
      images: ['https://example.com/reference.jpg'],
    },
    null,
    2
  ),

  firstLastFrame: JSON.stringify(
    {
      model: 'seedance-2.0',
      prompt: 'The flower slowly blooms, camera stays still',
      seconds: 5,
      resolution: '720p',
      first_image_url: 'https://example.com/first.jpg',
      last_image_url: 'https://example.com/last.jpg',
    },
    null,
    2
  ),

  createResponse: JSON.stringify(
    {
      id: 'video_abc123',
      object: 'video',
      model: 'seedance-2.0',
      status: 'queued',
      progress: 0,
      created_at: 1761000000,
    },
    null,
    2
  ),

  completedResponse: JSON.stringify(
    {
      id: 'video_abc123',
      object: 'video',
      model: 'seedance-2.0',
      status: 'completed',
      progress: 100,
      created_at: 1761000000,
      completed_at: 1761000180,
    },
    null,
    2
  ),

  failedResponse: JSON.stringify(
    {
      id: 'video_abc123',
      object: 'video',
      model: 'seedance-2.0',
      status: 'failed',
      progress: 0,
      created_at: 1761000000,
      error: {
        code: 'video_generation_failed',
        message: 'The video generation task failed.',
      },
    },
    null,
    2
  ),

  python: `import os
import time

import requests

BASE_URL = "{{BASE_URL}}"
API_KEY = os.environ["API_KEY"]
HEADERS = {"Authorization": f"Bearer {API_KEY}"}

# 1. Create the task (one POST = one billable task; do not retry it blindly)
task = requests.post(
    f"{BASE_URL}/v1/videos",
    headers=HEADERS,
    json={
        "model": "seedance-2.0",
        "prompt": "A red sports car drifts through a rainy neon street at night",
        "seconds": 5,
        "resolution": "720p",
        "ratio": "16:9",
    },
    timeout=60,
).json()
task_id = task["id"]
print("task:", task_id)

# 2. Poll every 5 seconds until the task finishes
while task["status"] not in ("completed", "failed"):
    time.sleep(5)
    task = requests.get(
        f"{BASE_URL}/v1/videos/{task_id}", headers=HEADERS, timeout=30
    ).json()
    print(task["status"], task.get("progress"))

if task["status"] == "failed":
    raise SystemExit(f"failed: {task.get('error')}")

# 3. Download the video (follows the redirect to temporary storage)
video = requests.get(
    f"{BASE_URL}/v1/videos/{task_id}/content", headers=HEADERS, timeout=300
)
video.raise_for_status()
with open("video.mp4", "wb") as f:
    f.write(video.content)
print("saved video.mp4")
`,

  node: `// Node.js 18+ (built-in fetch)
import { writeFile } from 'node:fs/promises'

const BASE_URL = '{{BASE_URL}}'
const headers = { Authorization: \`Bearer \${process.env.API_KEY}\` }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 1. Create the task (one POST = one billable task; do not retry it blindly)
let task = await fetch(\`\${BASE_URL}/v1/videos\`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'seedance-2.0',
    prompt: 'A red sports car drifts through a rainy neon street at night',
    seconds: 5,
    resolution: '720p',
    ratio: '16:9',
  }),
}).then((res) => res.json())
const taskId = task.id
console.log('task:', taskId)

// 2. Poll every 5 seconds until the task finishes
while (task.status !== 'completed' && task.status !== 'failed') {
  await sleep(5000)
  task = await fetch(\`\${BASE_URL}/v1/videos/\${taskId}\`, { headers }).then(
    (res) => res.json()
  )
  console.log(task.status, task.progress)
}
if (task.status === 'failed') throw new Error(JSON.stringify(task.error))

// 3. Download the video (fetch follows the redirect to temporary storage)
const video = await fetch(\`\${BASE_URL}/v1/videos/\${taskId}/content\`, {
  headers,
})
if (!video.ok) throw new Error(\`download failed: \${video.status}\`)
await writeFile('video.mp4', Buffer.from(await video.arrayBuffer()))
console.log('saved video.mp4')
`,
} as const
