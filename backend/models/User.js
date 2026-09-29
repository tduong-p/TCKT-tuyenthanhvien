const mongoose = require('mongoose');
const { defaultDepartment } = require('../config');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true }, // For login
  fullName: { type: String }, // For display
  department: { type: String, default: defaultDepartment }, // validated against org config in routes
  roles: [{ type: String, enum: ['interviewer', 'admin', 'receptionist'] }],
  role: { 
    type: String, 
    enum: ['interviewer', 'admin', 'receptionist'], 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['active', 'break', 'interviewing'], 
    default: 'active' 
  },
  roomNumber: { type: String, default: null },
  tableNumber: { type: String, default: null }, // Only for interviewers
  autoAssign: { type: Boolean, default: false } // Toggle auto/manual candidate dispatch
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
