const mongoose = require('mongoose');

const evaluationSchema = new mongoose.Schema({
  interviewCode: { type: String, required: true },
  department: { type: String, required: true },
  interviewerUsername: { type: String, required: true },
  // One entry per criterion in org config `evaluation.criteria`
  scores: [{
    _id: false,
    key: { type: String, required: true },
    label: { type: String },
    score: { type: Number, required: true }
  }],
  averageScore: { type: Number },
  // Legacy fixed criteria (records created before criteria became configurable)
  attitudeScore: { type: Number },
  skillScore: { type: Number },
  problemSolvingScore: { type: Number },
  questions: [{
    questionText: { type: String },
    score: { type: Number },
    note: { type: String }
  }],
  totalScore: { type: Number },
  notes: { type: String },
  result: { type: String, required: true } // one of org config `evaluation.results`
}, { timestamps: true });

module.exports = mongoose.model('Evaluation', evaluationSchema);
