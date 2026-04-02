import { drive_v3, drive } from '@googleapis/drive'

export type DriveClient = drive_v3.Drive

export function getDriveClient(accessToken: string): drive_v3.Drive {
  return drive({ version: 'v3', auth: accessToken }) as drive_v3.Drive
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  size?: string
  webViewLink?: string
  webContentLink?: string
}

export interface ListFilesResult {
  files: DriveFile[]
  nextPageToken?: string
}

export async function listDriveFiles(
  client: drive_v3.Drive,
  query?: string
): Promise<ListFilesResult> {
  const res = await client.files.list({
    q: query,
    fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink,webContentLink),nextPageToken',
    pageSize: 100,
    orderBy: 'modifiedTime desc',
  })

  return {
    files: (res.data.files ?? []) as DriveFile[],
    nextPageToken: res.data.nextPageToken ?? undefined,
  }
}

export async function readDriveFile(
  client: drive_v3.Drive,
  fileId: string
): Promise<{ metadata: DriveFile; content: string; isCSV: boolean }> {
  // Get metadata
  const metaRes = await client.files.get({
    fileId,
    fields: 'id,name,mimeType,modifiedTime,size,webViewLink,webContentLink',
  })

  const metadata = metaRes.data as unknown as DriveFile
  const isCSV = metadata.mimeType === 'text/csv' ||
    metadata.mimeType === 'application/vnd.google-apps.spreadsheet'

  // Get content (only for downloadable files)
  let content = ''
  if (!isCSV && metadata.mimeType?.startsWith('text/')) {
    const downloadRes = await client.files.get(
      { fileId, alt: 'media' },
      { responseType: 'text' }
    )
    content = downloadRes.data as string
  } else if (isCSV) {
    // Export Google Sheets as CSV
    const downloadRes = await client.files.export({
      fileId,
      mimeType: 'text/csv',
    })
    content = downloadRes.data as string
  }

  return { metadata, content, isCSV }
}

export async function writeDriveFile(
  client: drive_v3.Drive,
  name: string,
  content: string,
  mimeType: string
): Promise<{ fileId: string; webViewLink: string }> {
  // Generate a boundary for multipart request
  const boundary = `boundary_${Date.now()}`

  const metadataPart = [
    '--' + boundary,
    'Content-Type: application/json',
    '',
    JSON.stringify({ name, mimeType }),
    '',
  ].join('\r\n')

  const contentPart = [
    '--' + boundary,
    'Content-Type: ' + mimeType,
    '',
    content,
    '',
    '--' + boundary + '--',
  ].join('\r\n')

  const body =
    Buffer.from(metadataPart + contentPart).toString('base64')

  const res = await client.files.create({
    requestBody: { name, mimeType },
    media: {
      mimeType,
      body: content,
    },
    fields: 'id,webViewLink',
  })

  return {
    fileId: res.data.id!,
    webViewLink: res.data.webViewLink!,
  }
}
