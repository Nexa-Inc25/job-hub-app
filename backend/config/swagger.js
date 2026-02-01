/**
 * Swagger/OpenAPI Configuration
 * 
 * Provides interactive API documentation at /api-docs
 * Enterprise-ready documentation for potential integrations
 */

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'FieldLedger API',
      version: '1.0.0',
      description: `
## FieldLedger - Unit-Price Billing API for Utility Contractors

A comprehensive API for managing utility construction work orders, document workflows, 
and field operations.

### Key Features
- **Multi-tenant architecture** - Complete data isolation between companies
- **Role-based access control** - GF, PM, Admin, Crew roles with granular permissions
- **Document management** - PDF editing, approvals, and automated filing
- **Real-time updates** - WebSocket support for live collaboration
- **AI-powered features** - Document parsing and auto-fill capabilities

### Authentication
All API endpoints (except health check) require JWT authentication.
Include the token in the Authorization header:
\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

### Rate Limits
- Authentication endpoints: 10 requests per 15 minutes
- General API: 200 requests per minute
      `,
      contact: {
        name: 'FieldLedger Support',
        email: 'support@fieldledger.io'
      },
      license: {
        name: 'Proprietary',
        url: 'https://fieldledger.io/terms'
      }
    },
    servers: [
      {
        url: process.env.API_URL || 'https://job-hub-app-production.up.railway.app',
        description: 'Production server'
      },
      {
        url: 'http://localhost:5000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /api/login or /api/signup'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            name: { type: 'string', example: 'John Doe' },
            role: { 
              type: 'string', 
              enum: ['crew', 'foreman', 'gf', 'pm', 'admin'],
              example: 'gf'
            },
            isAdmin: { type: 'boolean', example: false },
            companyId: { type: 'string', example: '507f1f77bcf86cd799439012' },
            mfaEnabled: { type: 'boolean', example: false },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Job: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439013' },
            title: { type: 'string', example: 'Pole Replacement - Main St' },
            pmNumber: { type: 'string', example: 'PM-35440499' },
            woNumber: { type: 'string', example: 'WO-12345' },
            status: {
              type: 'string',
              enum: ['new', 'assigned_to_gf', 'pre_fielding', 'scheduled', 'in_progress', 
                     'pending_gf_review', 'pending_qa_review', 'pending_pm_approval', 
                     'ready_to_submit', 'submitted', 'billed', 'invoiced'],
              example: 'pre_fielding'
            },
            address: { type: 'string', example: '123 Main St' },
            city: { type: 'string', example: 'San Francisco' },
            client: { type: 'string', example: 'PG&E' },
            assignedTo: { $ref: '#/components/schemas/User' },
            assignedToGF: { $ref: '#/components/schemas/User' },
            crewScheduledDate: { type: 'string', format: 'date' },
            folders: {
              type: 'array',
              items: { $ref: '#/components/schemas/Folder' }
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Folder: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'ACI' },
            documents: {
              type: 'array',
              items: { $ref: '#/components/schemas/Document' }
            },
            subfolders: {
              type: 'array',
              items: { $ref: '#/components/schemas/Folder' }
            }
          }
        },
        Document: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'PM-35440499_FaceSheet.pdf' },
            url: { type: 'string', format: 'uri' },
            r2Key: { type: 'string' },
            uploadedAt: { type: 'string', format: 'date-time' },
            uploadedBy: { type: 'string' },
            isTemplate: { type: 'boolean', default: false },
            approvalStatus: {
              type: 'string',
              enum: ['pending', 'approved', 'rejected'],
              default: 'pending'
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Validation failed' },
            details: { type: 'string', example: 'Email is required' }
          }
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            password: { type: 'string', format: 'password', example: 'SecureP@ss123' }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            token: { type: 'string', description: 'JWT access token' },
            userId: { type: 'string' },
            isAdmin: { type: 'boolean' },
            role: { type: 'string' },
            name: { type: 'string' },
            mfaRequired: { 
              type: 'boolean', 
              description: 'If true, MFA verification is required before full access'
            },
            mfaToken: { 
              type: 'string', 
              description: 'Temporary token for MFA verification (only if mfaRequired=true)'
            }
          }
        },
        SignupRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { 
              type: 'string', 
              format: 'password',
              description: 'Min 8 chars, must include uppercase, lowercase, and number'
            },
            name: { type: 'string' },
            role: { 
              type: 'string',
              enum: ['crew', 'foreman', 'gf', 'pm'],
              default: 'crew'
            }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Access token is missing or invalid',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        NotFoundError: {
          description: 'The requested resource was not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        ValidationError: {
          description: 'Validation failed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        }
      }
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Health', description: 'System health and status endpoints' },
      { name: 'Auth', description: 'Authentication and user management' },
      { name: 'Jobs', description: 'Work order management' },
      { name: 'Documents', description: 'Document and file operations' },
      { name: 'Admin', description: 'Administrative operations' }
    ]
  },
  apis: [
    './routes/*.js',
    './server.js'
  ]
};

const specs = swaggerJsdoc(options);

/**
 * Setup Swagger UI in Express app
 * @param {Express} app - Express application instance
 */
const setupSwagger = (app) => {
  // Serve Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'FieldLedger API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true
    }
  }));
  
  // Serve raw OpenAPI spec as JSON
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
  
  console.log('Swagger docs available at /api-docs');
};

module.exports = { setupSwagger, specs };

