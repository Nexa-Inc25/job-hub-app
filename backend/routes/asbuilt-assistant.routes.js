const express = require('express');
const router = express.Router();
const ProcedureDoc = require('../models/ProcedureDoc');
const Job = require('../models/Job');
const OpenAI = require('openai');

/**
 * As-Built Assistant Routes
 * AI-powered assistant that helps foremen fill out as-built documentation
 * by asking targeted questions based on uploaded PG&E procedures.
 */

/**
 * @route POST /api/asbuilt-assistant/start/:jobId
 * @desc Start an as-built session for a job
 * @access Private
 */
router.post('/start/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Get the job to determine work type
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Determine work type from job data
    const workType = determineWorkType(job);
    
    // Get relevant procedure documents
    const companyId = req.user?.companyId;
    const procedures = await ProcedureDoc.find({
      isActive: true,
      processingStatus: 'completed',
      $or: [
        { applicableWorkTypes: workType },
        { applicableWorkTypes: 'all' }
      ],
      ...(companyId && { companyId })
    });

    // Collect all questions from procedures
    const allQuestions = [];
    const procedureContext = [];
    
    for (const proc of procedures) {
      if (proc.extractedContent?.questions) {
        allQuestions.push(...proc.extractedContent.questions.map(q => ({
          ...q,
          sourceDoc: proc.name
        })));
      }
      if (proc.extractedContent?.requirements) {
        procedureContext.push({
          name: proc.name,
          requirements: proc.extractedContent.requirements
        });
      }
    }

    // Create initial session state
    const session = {
      jobId,
      workType,
      pmNumber: job.pmNumber,
      address: job.address,
      proceduresLoaded: procedures.length,
      totalQuestions: allQuestions.length,
      answeredQuestions: 0,
      answers: {},
      questions: allQuestions,
      procedureContext,
      startedAt: new Date()
    };

    // Store session in job (or could use Redis/session store)
    job.asBuiltSession = session;
    await job.save();

    // Generate first batch of questions
    const nextQuestions = getNextQuestions(session, 5);

    res.json({
      success: true,
      message: `As-built assistant ready. ${procedures.length} procedure docs loaded with ${allQuestions.length} questions.`,
      session: {
        jobId,
        workType,
        pmNumber: job.pmNumber,
        address: job.address,
        totalQuestions: allQuestions.length,
        proceduresLoaded: procedures.map(p => p.name)
      },
      nextQuestions
    });
  } catch (err) {
    console.error('Start as-built session error:', err);
    res.status(500).json({ error: 'Failed to start as-built session' });
  }
});

/**
 * @route POST /api/asbuilt-assistant/answer/:jobId
 * @desc Submit answers and get next questions
 * @access Private
 */
router.post('/answer/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { answers } = req.body; // { fieldName: value, ... }

    const job = await Job.findById(jobId);
    if (!job || !job.asBuiltSession) {
      return res.status(404).json({ error: 'No active as-built session' });
    }

    // Store answers
    job.asBuiltSession.answers = {
      ...job.asBuiltSession.answers,
      ...answers
    };
    job.asBuiltSession.answeredQuestions = Object.keys(job.asBuiltSession.answers).length;

    // Check for conditional questions that are now relevant
    const nextQuestions = getNextQuestions(job.asBuiltSession, 5);
    
    // Calculate progress
    const progress = Math.round((job.asBuiltSession.answeredQuestions / job.asBuiltSession.totalQuestions) * 100);

    await job.save();

    res.json({
      success: true,
      progress,
      answeredCount: job.asBuiltSession.answeredQuestions,
      totalQuestions: job.asBuiltSession.totalQuestions,
      nextQuestions,
      isComplete: nextQuestions.length === 0
    });
  } catch (err) {
    console.error('Answer submission error:', err);
    res.status(500).json({ error: 'Failed to submit answers' });
  }
});

/**
 * @route POST /api/asbuilt-assistant/generate/:jobId
 * @desc Generate the as-built document from collected answers
 * @access Private
 */
router.post('/generate/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await Job.findById(jobId);
    if (!job || !job.asBuiltSession) {
      return res.status(404).json({ error: 'No active as-built session' });
    }

    const session = job.asBuiltSession;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Build context from procedure requirements
    const procedureRequirements = session.procedureContext
      .map(p => `${p.name}:\n${p.requirements.map(r => `- ${r.field}: ${r.description}`).join('\n')}`)
      .join('\n\n');

    // Format answers
    const formattedAnswers = Object.entries(session.answers)
      .map(([field, value]) => `${field}: ${value}`)
      .join('\n');

    // Generate as-built summary using AI
    const prompt = `You are generating an as-built document for a PG&E utility construction job.

JOB INFORMATION:
- PM Number: ${job.pmNumber || 'N/A'}
- Address: ${job.address || 'N/A'}
- City: ${job.city || 'N/A'}
- Work Type: ${session.workType}
- Job Scope: ${job.jobScope?.summary || 'N/A'}

PROCEDURE REQUIREMENTS:
${procedureRequirements}

FOREMAN ANSWERS:
${formattedAnswers}

Generate a formatted as-built document that:
1. Organizes information by section (Location, Materials, Installation, Verification)
2. Includes all measured values and installed materials
3. Notes any deviations from design
4. Lists photos taken and what they document
5. Includes any issues or special conditions

Format as a professional as-built record that could be submitted to PG&E.`;

    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 3000
    });

    const generatedAsBuilt = aiResponse.choices[0].message.content;

    // Store the generated as-built
    job.asBuiltDocument = {
      generatedAt: new Date(),
      content: generatedAsBuilt,
      answers: session.answers,
      status: 'draft'
    };

    await job.save();

    res.json({
      success: true,
      message: 'As-built document generated',
      asBuilt: {
        content: generatedAsBuilt,
        answersUsed: Object.keys(session.answers).length,
        status: 'draft'
      }
    });
  } catch (err) {
    console.error('Generate as-built error:', err);
    res.status(500).json({ error: 'Failed to generate as-built' });
  }
});

/**
 * @route GET /api/asbuilt-assistant/status/:jobId
 * @desc Get current as-built session status
 * @access Private
 */
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await Job.findById(jobId).select('asBuiltSession asBuiltDocument pmNumber address');
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!job.asBuiltSession && !job.asBuiltDocument) {
      return res.json({
        hasSession: false,
        hasDocument: false,
        message: 'No as-built session started'
      });
    }

    res.json({
      hasSession: !!job.asBuiltSession,
      hasDocument: !!job.asBuiltDocument,
      session: job.asBuiltSession ? {
        answeredQuestions: job.asBuiltSession.answeredQuestions,
        totalQuestions: job.asBuiltSession.totalQuestions,
        progress: Math.round((job.asBuiltSession.answeredQuestions / job.asBuiltSession.totalQuestions) * 100),
        startedAt: job.asBuiltSession.startedAt
      } : null,
      document: job.asBuiltDocument ? {
        generatedAt: job.asBuiltDocument.generatedAt,
        status: job.asBuiltDocument.status
      } : null
    });
  } catch (err) {
    console.error('Get session status error:', err);
    res.status(500).json({ error: 'Failed to get session status' });
  }
});

/**
 * @route POST /api/asbuilt-assistant/chat/:jobId
 * @desc Chat with the AI assistant about the as-built
 * @access Private
 */
router.post('/chat/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { message } = req.body;

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Build context
    const context = `You are an as-built documentation assistant for PG&E utility construction.

JOB CONTEXT:
- PM Number: ${job.pmNumber || 'N/A'}
- Address: ${job.address || 'N/A'}
- Work Type: ${job.preFieldLabels?.constructionType || 'unknown'}
- Job Scope: ${job.jobScope?.summary || 'N/A'}

${job.asBuiltSession ? `
CURRENT ANSWERS:
${Object.entries(job.asBuiltSession.answers || {}).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
` : ''}

Help the foreman with their as-built documentation. Answer questions about:
- What information needs to be recorded
- How to measure or document specific items
- PG&E requirements and standards
- Photo requirements
- Common mistakes to avoid

Be concise and practical. Focus on field-relevant information.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: context },
        { role: 'user', content: message }
      ],
      max_tokens: 1000
    });

    res.json({
      success: true,
      response: response.choices[0].message.content
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Failed to get AI response' });
  }
});

// Helper functions

function determineWorkType(job) {
  // Determine from preFieldLabels or jobScope
  if (job.preFieldLabels?.constructionType) {
    return job.preFieldLabels.constructionType;
  }
  if (job.preFieldLabels?.poleWork) {
    return 'pole-replacement';
  }
  if (job.jobScope?.workType) {
    const wt = job.jobScope.workType.toLowerCase();
    if (wt.includes('underground') || wt.includes('ug')) return 'underground';
    if (wt.includes('overhead') || wt.includes('oh')) return 'overhead';
    if (wt.includes('pole')) return 'pole-replacement';
    if (wt.includes('transformer')) return 'transformer';
    if (wt.includes('service')) return 'service-install';
  }
  return 'all';
}

function getNextQuestions(session, count) {
  const answeredFields = Object.keys(session.answers || {});
  
  // Filter out already answered questions
  const unanswered = session.questions.filter(q => !answeredFields.includes(q.field));
  
  // Filter out conditional questions that don't apply yet
  const applicable = unanswered.filter(q => {
    if (!q.dependsOn) return true;
    // Check if the dependency condition is met
    const depValue = session.answers[q.dependsOn];
    return depValue !== undefined;
  });

  // Return next batch
  return applicable.slice(0, count);
}

module.exports = router;

