import mongoose, { Schema, Document } from 'mongoose';

// AdminLog Interface
export interface IAdminLog extends Document {
  adminId: string;
  actionType: 'credit' | 'debit' | 'view' | 'search';
  targetWallet: string;
  amount?: number;
  description?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

// AdminLog Schema
const AdminLogSchema: Schema = new Schema({
  adminId: {
    type: String,
    required: true,
    index: true
  },
  actionType: {
    type: String,
    enum: ['credit', 'debit', 'view', 'search'],
    required: true
  },
  targetWallet: {
    type: String,
    required: true,
    index: true
  },
  amount: {
    type: Number,
    min: 0,
    sparse: true
  },
  description: {
    type: String,
    trim: true
  },
  ipAddress: {
    type: String,
    sparse: true
  },
  userAgent: {
    type: String,
    sparse: true
  }
}, {
  timestamps: true,
  collection: 'adminlogs'
});

// Indexes for performance
AdminLogSchema.index({ adminId: 1, timestamp: -1 });
AdminLogSchema.index({ targetWallet: 1, timestamp: -1 });
AdminLogSchema.index({ actionType: 1, timestamp: -1 });

export const AdminLog = mongoose.model<IAdminLog>('AdminLog', AdminLogSchema);
