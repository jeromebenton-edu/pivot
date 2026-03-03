/**
 * OpenAPI 3.0 spec for all Pivot API endpoints.
 */

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Pivot BI API',
    description: 'Conversational Business Intelligence platform with RAG and forecasting',
    version: '1.0.0',
  },
  servers: [
    { url: '/api', description: 'API base path' },
  ],
  paths: {
    '/chat': {
      post: {
        summary: 'Send a chat message',
        description: 'Stream an AI response with optional chart config and RAG sources',
        tags: ['Chat'],
        security: [{ session: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['messages'],
                properties: {
                  messages: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['id', 'role', 'content', 'timestamp'],
                      properties: {
                        id: { type: 'string' },
                        role: { type: 'string', enum: ['user', 'assistant'] },
                        content: { type: 'string', maxLength: 10000 },
                        timestamp: { type: 'string', format: 'date-time' },
                      },
                    },
                    maxItems: 50,
                  },
                  sessionId: { type: 'string' },
                  datasetId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'SSE stream of text chunks, metadata, and done events',
            content: { 'text/event-stream': {} },
          },
          '400': { description: 'Invalid request' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Insufficient permissions' },
          '429': { description: 'Rate limited' },
        },
      },
    },
    '/forecast': {
      post: {
        summary: 'Generate revenue forecast',
        tags: ['Forecast'],
        security: [{ session: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  steps: { type: 'number', minimum: 1, maximum: 12, default: 3 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Forecast result with chart config' },
          '401': { description: 'Authentication required' },
        },
      },
    },
    '/upload': {
      post: {
        summary: 'Upload a CSV or Excel file',
        tags: ['Data'],
        security: [{ session: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                  preview: { type: 'string', enum: ['true', 'false'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Upload result with dataset ID and columns' },
          '400': { description: 'Invalid file' },
          '401': { description: 'Authentication required' },
          '413': { description: 'File too large' },
        },
      },
    },
    '/connect': {
      post: {
        summary: 'Connect to external database',
        tags: ['Data'],
        security: [{ session: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['action', 'type', 'host', 'database', 'username'],
                properties: {
                  action: { type: 'string', enum: ['test', 'import'] },
                  type: { type: 'string', enum: ['postgresql'] },
                  host: { type: 'string' },
                  port: { type: 'number', default: 5432 },
                  database: { type: 'string' },
                  username: { type: 'string' },
                  password: { type: 'string' },
                  ssl: { type: 'boolean' },
                  table: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Connection result or imported data' },
          '400': { description: 'Invalid parameters or blocked host' },
          '401': { description: 'Authentication required' },
        },
      },
    },
    '/sessions': {
      get: {
        summary: 'List chat sessions',
        tags: ['Sessions'],
        security: [{ session: [] }],
        responses: {
          '200': { description: 'Array of sessions' },
          '401': { description: 'Authentication required' },
        },
      },
      post: {
        summary: 'Create a new session',
        tags: ['Sessions'],
        security: [{ session: [] }],
        responses: {
          '201': { description: 'Created session' },
        },
      },
    },
    '/dashboards': {
      get: {
        summary: 'List dashboards or get one by ID',
        tags: ['Dashboards'],
        security: [{ session: [] }],
        parameters: [
          { name: 'id', in: 'query', schema: { type: 'string' }, required: false },
        ],
        responses: {
          '200': { description: 'Dashboard(s)' },
          '401': { description: 'Authentication required' },
          '404': { description: 'Dashboard not found' },
        },
      },
      post: {
        summary: 'Create a dashboard',
        tags: ['Dashboards'],
        security: [{ session: [] }],
        responses: {
          '201': { description: 'Created dashboard' },
        },
      },
      put: {
        summary: 'Update a dashboard',
        tags: ['Dashboards'],
        security: [{ session: [] }],
        responses: {
          '200': { description: 'Updated dashboard' },
        },
      },
      delete: {
        summary: 'Delete a dashboard',
        tags: ['Dashboards'],
        security: [{ session: [] }],
        responses: {
          '200': { description: 'Deleted' },
        },
      },
    },
    '/health': {
      get: {
        summary: 'Health check',
        tags: ['System'],
        responses: {
          '200': { description: 'Service healthy' },
          '503': { description: 'Service degraded' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      session: {
        type: 'apiKey',
        in: 'cookie',
        name: 'better-auth.session_token',
      },
    },
  },
};
