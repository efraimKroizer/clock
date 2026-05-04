/**
 * Google Drive REST API v3 – File operations
 * Uses drive.file scope: app can only access files it created.
 * Data is stored as a single JSON file visible in the user's Drive.
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const FILE_NAME = 'clock-time-tracking.json'
const MIME_TYPE = 'application/json'

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

async function assertOk(resp: Response): Promise<void> {
  if (!resp.ok) {
    let message = `Drive API error ${resp.status}`
    try {
      const body = (await resp.json()) as { error?: { message?: string } }
      message = body?.error?.message ?? message
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(message)
  }
}

export async function findDriveFile(token: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`)
  const resp = await fetch(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name,modifiedTime)&spaces=drive`,
    { headers: authHeaders(token) },
  )
  await assertOk(resp)
  const data = (await resp.json()) as { files?: Array<{ id: string }> }
  const files = data?.files
  return files && files.length > 0 ? files[0]!.id : null
}

export async function readDriveFile<T>(token: string, fileId: string): Promise<T> {
  const resp = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: authHeaders(token),
  })
  await assertOk(resp)
  return resp.json() as Promise<T>
}

export async function createDriveFile(token: string, data: unknown): Promise<string> {
  const metadata = { name: FILE_NAME, mimeType: MIME_TYPE }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('media', new Blob([JSON.stringify(data, null, 2)], { type: MIME_TYPE }))

  const resp = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: authHeaders(token),
    body: form,
  })
  await assertOk(resp)
  const result = (await resp.json()) as { id: string }
  return result.id
}

export async function updateDriveFile(
  token: string,
  fileId: string,
  data: unknown,
): Promise<void> {
  const resp = await fetch(`${UPLOAD_API}/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      ...authHeaders(token),
      'Content-Type': MIME_TYPE,
    },
    body: JSON.stringify(data, null, 2),
  })
  await assertOk(resp)
}
