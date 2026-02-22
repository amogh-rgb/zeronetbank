import { z } from 'zod';

const HexSchema = z.string().regex(/^[0-9a-fA-F]+$/, "Must be a valid hex string");

const PhoneIdSchema = z
    .string()
    .min(10)
    .max(15)
    .regex(/^\+?[0-9]+$/, "Must be a valid phone number");

// Backward-compatible wallet identifier support:
// - Preferred: mobile number
// - Legacy/dev: UUID wallet IDs
const WalletIdentifierSchema = z.union([
    PhoneIdSchema,
    z.string().uuid("Must be a valid UUID wallet identifier"),
]);

export const RegisterSchema = z.object({
    phone: WalletIdentifierSchema,
    publicKey: HexSchema.length(130, "Must be 130 characters (Uncompressed P-256 Hex 04+...)"),
    displayName: z.string().trim().min(1).max(120).optional(),
});

export const OfflineTransactionSchema = z.object({
    id: z.string().min(1),
    from: HexSchema, // Public Key
    to: HexSchema,   // Public Key
    amount: z.number().positive().max(1000000000, "Amount exceeds limit"), // 1B limit
    timestamp: z.number().int(),
    signature: HexSchema,
    type: z.string().optional().default('TRANSFER'),
});

export const SyncSchema = z.object({
    offlineTransactions: z.array(OfflineTransactionSchema).optional().default([]),
    deviceInfo: z.string().trim().max(240).optional(),
});

// Online transfer supports both legacy publicKey addressing and
// phone/UUID wallet identifiers (UPI-style long-range payment).
export const TransferSchema = z.object({
    id: z.string().min(1),
    from: z.union([HexSchema, WalletIdentifierSchema]),
    to: z.union([HexSchema, WalletIdentifierSchema]),
    amount: z.number().positive().max(1000000000, "Amount exceeds limit"),
    timestamp: z.number().int(),
    signature: HexSchema,
    type: z.string().optional().default('TRANSFER'),
});

export const QueueAlertSchema = z.object({
    issueId: z.string().min(1),
    severity: z.enum(['WARN', 'CRITICAL']).default('WARN'),
    warning: z.string().optional(),
    pendingCount: z.number().int().nonnegative().default(0),
    readyCount: z.number().int().nonnegative().default(0),
    failingCount: z.number().int().nonnegative().default(0),
    staleCount: z.number().int().nonnegative().default(0),
    needsReviewCount: z.number().int().nonnegative().default(0),
    unacknowledgedIds: z.array(z.string()).optional().default([]),
    unknownProcessedIds: z.array(z.string()).optional().default([]),
    sampleTxIds: z.array(z.string()).optional().default([]),
    clientTimestamp: z.number().int().optional(),
});
