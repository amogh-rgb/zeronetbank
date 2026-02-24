import mongoose, { Schema, Document } from 'mongoose';

// Transaction Interface
export interface ITransaction extends Document {
  transactionId: string;
  senderWallet: string;
  receiverWallet: string;
  amount: number;
  type: 'credit' | 'debit';
  mode: 'online' | 'offline';
  status: 'pending' | 'success' | 'failed';
  digitalSignature?: string;
  createdAt: Date;
  syncedAt?: Date;
  description?: string;
}

// Transaction Schema
const TransactionSchema: Schema = new Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  senderWallet: {
    type: String,
    required: true,
    index: true
  },
  receiverWallet: {
    type: String,
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: true
  },
  mode: {
    type: String,
    enum: ['online', 'offline'],
    required: true,
    default: 'online'
  },
  status: {
    type: String,
    enum: ['pending', 'success', 'failed'],
    required: true,
    default: 'pending'
  },
  digitalSignature: {
    type: String,
    sparse: true
  },
  syncedAt: {
    type: Date,
    sparse: true
  },
  description: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  collection: 'transactions'
});

// Indexes for performance
TransactionSchema.index({ senderWallet: 1, createdAt: -1 });
TransactionSchema.index({ receiverWallet: 1, createdAt: -1 });
TransactionSchema.index({ status: 1, mode: 1 });
TransactionSchema.index({ transactionId: 1 });

export const Transaction = mongoose.model<ITransaction>('Transaction', TransactionSchema);
