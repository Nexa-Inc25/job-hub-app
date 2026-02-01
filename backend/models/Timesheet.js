/**
 * Timesheet Model
 * 
 * Tracks daily crew time entries for jobs.
 */

const mongoose = require('mongoose');

const timeEntrySchema = new mongoose.Schema({
  clockIn: Date,
  clockOut: Date,
  breakMinutes: { type: Number, default: 30 },
  workType: { 
    type: String, 
    enum: ['regular', 'overtime', 'double', 'travel', 'standby'],
    default: 'regular'
  },
  notes: String,
  gpsLocation: {
    latitude: Number,
    longitude: Number,
  },
});

const crewMemberSchema = new mongoose.Schema({
  name: { type: String, required: true },
  classification: String,
  employeeId: String,
  entries: [timeEntrySchema],
});

const timesheetSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  date: { type: Date, required: true },
  crewMembers: [crewMemberSchema],
  totalHours: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'approved', 'rejected'],
    default: 'draft',
  },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  submittedAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  notes: String,
}, { timestamps: true });

// Compound index for unique job+date timesheets
timesheetSchema.index({ jobId: 1, date: 1 }, { unique: true });
timesheetSchema.index({ companyId: 1, date: 1 });

module.exports = mongoose.model('Timesheet', timesheetSchema);

