interface ToolDefinition {
  id: string
  description: string
  triggers: string[]
  inputSchema: object
  outputSchema: object
  isConcurrencySafe: boolean
  permissionLevel: 'safe' | 'needs_approval'
}

export const driveTools: ToolDefinition[] = [
  {
    id: 'drive.read',
    description: 'Read files from Google Drive — lists files and reads file content (CSV parsing for Monday loop)',
    triggers: ['read from drive', 'list drive files', 'read csv from drive', 'get file from drive'],
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Google Drive query string (e.g. "name contains \'Monday\'")',
          default: '',
        },
        fileId: {
          type: 'string',
          description: 'File ID to read (omit to list files)',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of files to list',
          default: 20,
        },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          description: 'List of files (when fileId not provided)',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              mimeType: { type: 'string' },
              modifiedTime: { type: 'string' },
            },
          },
        },
        content: {
          type: 'string',
          description: 'File content (when fileId provided, CSV rows as string)',
        },
        isCSV: { type: 'boolean' },
      },
    },
    isConcurrencySafe: true,
    permissionLevel: 'safe',
  },
  {
    id: 'drive.write',
    description: 'Write files to Google Drive — uploads CSV or text files',
    triggers: ['write to drive', 'upload to drive', 'save csv to drive', 'write file to drive'],
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'File name (e.g. "processed_leads.csv")',
        },
        content: {
          type: 'string',
          description: 'File content (CSV string for CSV files)',
        },
        mimeType: {
          type: 'string',
          description: 'MIME type (e.g. "text/csv", "text/plain")',
          default: 'text/csv',
        },
        folderId: {
          type: 'string',
          description: 'Optional folder ID to write into',
        },
      },
      required: ['name', 'content'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        fileId: { type: 'string' },
        webViewLink: { type: 'string' },
      },
    },
    isConcurrencySafe: false,
    permissionLevel: 'needs_approval',
  },
]
