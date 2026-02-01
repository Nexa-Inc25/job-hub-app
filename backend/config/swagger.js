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
## FieldLedger - Enterprise Field Operations Platform

A comprehensive REST API for managing utility construction work orders, unit-price billing, 
document workflows, and Oracle ERP integration.

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **Multi-tenant Architecture** | Complete data isolation between companies with role-based access |
| **Unit-Price Billing** | Price book management, field unit capture, claims generation |
| **Oracle Integration** | FBDI export for Oracle Fusion Cloud Payables, Primavera ready |
| **Document Management** | As-built routing, PDF editing, digital approvals |
| **Offline-First** | PWA with sync queue for remote field operations |
| **AI-Powered** | Document parsing, auto-classification, smart routing |

### Oracle Cloud Integration

FieldLedger provides seamless integration with Oracle Cloud applications:

- **Oracle Fusion Cloud ERP** - Export claims in FBDI CSV format for Accounts Payable
- **Oracle Primavera Unifier** - Project sync and document delivery (roadmap)
- **Oracle EAM** - Asset updates and work order sync (roadmap)

### Authentication

All API endpoints (except health check) require JWT authentication.
Include the token in the Authorization header:

\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

### Rate Limits

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Authentication | 15 requests | 15 minutes |
| General API | 300 requests | 1 minute |
| Heavy Operations | 30 requests | 1 minute |

### Security & Compliance

- TLS 1.3 encryption in transit
- AES-256 encryption at rest  
- SOC 2 Type II (in progress)
- NIST SP 800-53 aligned
- MFA support (TOTP)
- Complete audit logging
      `,
      contact: {
        name: 'FieldLedger Support',
        email: 'support@fieldledger.io',
        url: 'https://www.fieldledger.io'
      },
      license: {
        name: 'Proprietary',
        url: 'https://www.fieldledger.io/terms'
      },
      'x-logo': {
        url: 'https://www.fieldledger.io/logo.png',
        altText: 'FieldLedger Logo'
      }
    },
    externalDocs: {
      description: 'FieldLedger Documentation',
      url: 'https://www.fieldledger.io/docs'
    },
    servers: [
      {
        url: 'https://api.fieldledger.io',
        description: 'Production API'
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
        },
        // ============================================
        // BILLING SCHEMAS (Oracle Integration Ready)
        // ============================================
        PriceBook: {
          type: 'object',
          description: 'Contract rate schedule for unit-price billing',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439020' },
            name: { type: 'string', example: 'PG&E 2026 CWA Rates' },
            utilityId: { type: 'string', description: 'Associated utility' },
            contractNumber: { type: 'string', example: 'CWA-2026-001' },
            effectiveDate: { type: 'string', format: 'date' },
            expirationDate: { type: 'string', format: 'date' },
            status: { 
              type: 'string', 
              enum: ['draft', 'active', 'expired'],
              example: 'active'
            },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/PriceBookItem' }
            }
          }
        },
        PriceBookItem: {
          type: 'object',
          description: 'Individual billable unit item',
          properties: {
            itemCode: { type: 'string', example: 'POLE-T3-ACC' },
            description: { type: 'string', example: 'Type 3 Pole Replacement - Accessible' },
            unitOfMeasure: { type: 'string', example: 'EA' },
            unitPrice: { type: 'number', format: 'float', example: 4500.00 },
            category: { type: 'string', example: 'Pole Replacement' },
            laborIncluded: { type: 'boolean', default: true },
            materialsIncluded: { type: 'boolean', default: false }
          }
        },
        UnitEntry: {
          type: 'object',
          description: 'Field-captured billable unit',
          properties: {
            _id: { type: 'string' },
            jobId: { type: 'string', description: 'Associated work order' },
            priceBookItemId: { type: 'string' },
            itemCode: { type: 'string', example: 'POLE-T3-ACC' },
            description: { type: 'string' },
            quantity: { type: 'number', example: 1 },
            unitPrice: { type: 'number', format: 'float' },
            totalPrice: { type: 'number', format: 'float' },
            status: {
              type: 'string',
              enum: ['pending', 'approved', 'rejected', 'billed'],
              example: 'pending'
            },
            capturedBy: { type: 'string', description: 'User who captured the unit' },
            capturedAt: { type: 'string', format: 'date-time' },
            gpsCoordinates: {
              type: 'object',
              properties: {
                latitude: { type: 'number' },
                longitude: { type: 'number' },
                accuracy: { type: 'number' }
              }
            },
            photos: {
              type: 'array',
              items: { type: 'string', format: 'uri' }
            }
          }
        },
        Claim: {
          type: 'object',
          description: 'Invoice/claim for billing submission',
          properties: {
            _id: { type: 'string' },
            claimNumber: { type: 'string', example: 'CLM-2026-00123' },
            companyId: { type: 'string' },
            utilityId: { type: 'string' },
            status: {
              type: 'string',
              enum: ['draft', 'pending_approval', 'approved', 'submitted', 'paid', 'disputed'],
              example: 'draft'
            },
            unitEntries: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of UnitEntry IDs'
            },
            totalAmount: { type: 'number', format: 'float', example: 45000.00 },
            submittedAt: { type: 'string', format: 'date-time' },
            paidAt: { type: 'string', format: 'date-time' },
            oracleInvoiceNumber: { 
              type: 'string', 
              description: 'Oracle AP invoice reference after FBDI import'
            }
          }
        },
        OracleFBDIExport: {
          type: 'object',
          description: 'Oracle Fusion FBDI export format for Accounts Payable',
          properties: {
            exportId: { type: 'string' },
            exportDate: { type: 'string', format: 'date-time' },
            format: { 
              type: 'string', 
              enum: ['FBDI_CSV', 'JSON'],
              example: 'FBDI_CSV'
            },
            supplierNumber: { type: 'string', example: 'SUP-123456' },
            supplierSite: { type: 'string', example: 'HQ' },
            invoiceLines: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  lineNumber: { type: 'integer' },
                  amount: { type: 'number', format: 'float' },
                  description: { type: 'string' },
                  distributionAccount: { type: 'string' },
                  projectNumber: { type: 'string' },
                  taskNumber: { type: 'string' }
                }
              }
            },
            downloadUrl: { type: 'string', format: 'uri' }
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
      { name: 'Billing', description: 'Unit-price billing and claims management' },
      { name: 'PriceBooks', description: 'Contract rate schedule management' },
      { name: 'Oracle', description: 'Oracle Cloud ERP integration endpoints' },
      { name: 'AsBuilt', description: 'As-built document routing and submission' },
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

