const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');
const ProcedureDoc = require('../models/ProcedureDoc');

// Configure multer for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/procedures');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `procedure_${Date.now()}_${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for procedure docs
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

/**
 * @route POST /api/procedures/upload
 * @desc Upload a PG&E procedure document for AI learning
 * @access Private (Admin/PM only)
 */
router.post('/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { 
      name, 
      description, 
      docType, 
      applicableWorkTypes,
      version,
      effectiveDate 
    } = req.body;

    // Parse applicableWorkTypes if it's a string
    let workTypes = applicableWorkTypes;
    if (typeof applicableWorkTypes === 'string') {
      workTypes = applicableWorkTypes.split(',').map(t => t.trim());
    }

    // Create the procedure document record
    const procedureDoc = new ProcedureDoc({
      name: name || req.file.originalname.replace('.pdf', ''),
      description,
      docType: docType || 'as-built-procedure',
      applicableWorkTypes: workTypes || ['all'],
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      fileKey: req.file.filename, // Local file path for now
      version: version || '1.0',
      effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
      uploadedBy: req.userId,
      companyId: req.user?.companyId,
      processingStatus: 'pending'
    });

    await procedureDoc.save();

    // Trigger async processing to extract content and generate questions
    processDocumentAsync(procedureDoc._id, req.file.path);

    res.status(201).json({
      success: true,
      message: 'Procedure document uploaded. AI is processing it to learn the requirements.',
      procedureDoc: {
        _id: procedureDoc._id,
        name: procedureDoc.name,
        docType: procedureDoc.docType,
        processingStatus: procedureDoc.processingStatus
      }
    });
  } catch (err) {
    console.error('Procedure upload error:', err);
    res.status(500).json({ error: 'Failed to upload procedure document' });
  }
});

/**
 * Process document asynchronously - extract text and generate questions
 */
async function processDocumentAsync(docId, filePath) {
  try {
    const procedureDoc = await ProcedureDoc.findById(docId);
    if (!procedureDoc) return;

    procedureDoc.processingStatus = 'processing';
    await procedureDoc.save();

    // Extract text from PDF
    const pdfParse = require('pdf-parse');
    const pdfBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(pdfBuffer);
    
    procedureDoc.extractedContent = {
      rawText: pdfData.text,
      sections: [],
      requirements: [],
      questions: []
    };

    // Use AI to extract requirements and generate questions
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // First pass: Extract requirements from the procedure
    const requirementsPrompt = `You are an expert at understanding PG&E utility construction procedures and as-built documentation requirements.

Analyze this procedure document and extract:
1. All fields/data points that need to be recorded on an as-built
2. For each field, specify if it's required, the data type, and any validation rules
3. Generate questions a foreman should answer to populate each field

Document text:
${pdfData.text.substring(0, 15000)}

Return JSON with this structure:
{
  "requirements": [
    {
      "field": "Pole Height",
      "description": "Actual measured height of installed pole",
      "required": true,
      "dataType": "number",
      "validationRules": "Must match material list within 5ft tolerance",
      "exampleValue": "45"
    }
  ],
  "questions": [
    {
      "field": "Pole Height",
      "question": "What is the actual height of the installed pole?",
      "helpText": "Measure from ground line to tip. Should match the design.",
      "inputType": "number",
      "options": [],
      "dependsOn": null
    }
  ],
  "sections": [
    {
      "title": "Section Title",
      "content": "Brief summary of section",
      "pageNumber": 1
    }
  ]
}

Focus on practical field data that a foreman would need to record. Include photo requirements, measurements, material verification, etc.`;

    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: requirementsPrompt }],
      response_format: { type: 'json_object' },
      max_tokens: 4000
    });

    const extracted = JSON.parse(aiResponse.choices[0].message.content);
    
    procedureDoc.extractedContent.requirements = extracted.requirements || [];
    procedureDoc.extractedContent.questions = extracted.questions || [];
    procedureDoc.extractedContent.sections = extracted.sections || [];
    procedureDoc.processingStatus = 'completed';
    procedureDoc.lastProcessedAt = new Date();

    await procedureDoc.save();
    console.log(`Procedure doc ${docId} processed: ${extracted.requirements?.length || 0} requirements, ${extracted.questions?.length || 0} questions`);

  } catch (err) {
    console.error('Procedure processing error:', err);
    try {
      await ProcedureDoc.findByIdAndUpdate(docId, {
        processingStatus: 'failed',
        processingError: err.message
      });
    } catch (error_) {
      console.error('Failed to update processing status:', error_);
    }
  }
}

/**
 * @route GET /api/procedures
 * @desc List all procedure documents
 * @access Private
 */
router.get('/', async (req, res) => {
  try {
    const { docType, workType, status } = req.query;
    
    const filter = { isActive: true };
    if (docType) filter.docType = docType;
    if (workType) filter.applicableWorkTypes = workType;
    if (status) filter.processingStatus = status;
    if (req.user?.companyId) filter.companyId = req.user.companyId;

    const procedures = await ProcedureDoc.find(filter)
      .select('-extractedContent.rawText') // Don't send full text in list
      .sort({ createdAt: -1 })
      .populate('uploadedBy', 'name email');

    res.json(procedures);
  } catch (err) {
    console.error('List procedures error:', err);
    res.status(500).json({ error: 'Failed to list procedures' });
  }
});

/**
 * @route GET /api/procedures/:id
 * @desc Get a single procedure document with full details
 * @access Private
 */
router.get('/:id', async (req, res) => {
  try {
    const procedure = await ProcedureDoc.findById(req.params.id)
      .populate('uploadedBy', 'name email');
    
    if (!procedure) {
      return res.status(404).json({ error: 'Procedure not found' });
    }

    res.json(procedure);
  } catch (err) {
    console.error('Get procedure error:', err);
    res.status(500).json({ error: 'Failed to get procedure' });
  }
});

/**
 * @route GET /api/procedures/questions/:workType
 * @desc Get all as-built questions for a specific work type
 * @access Private
 */
router.get('/questions/:workType', async (req, res) => {
  try {
    const { workType } = req.params;
    const companyId = req.user?.companyId;

    const questions = await ProcedureDoc.getAsBuiltQuestions(workType, companyId);

    res.json({
      workType,
      questionCount: questions.length,
      questions
    });
  } catch (err) {
    console.error('Get questions error:', err);
    res.status(500).json({ error: 'Failed to get questions' });
  }
});

/**
 * @route DELETE /api/procedures/:id
 * @desc Deactivate a procedure document
 * @access Private (Admin only)
 */
router.delete('/:id', async (req, res) => {
  try {
    const procedure = await ProcedureDoc.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!procedure) {
      return res.status(404).json({ error: 'Procedure not found' });
    }

    res.json({ message: 'Procedure deactivated', procedure });
  } catch (err) {
    console.error('Delete procedure error:', err);
    res.status(500).json({ error: 'Failed to delete procedure' });
  }
});

module.exports = router;

