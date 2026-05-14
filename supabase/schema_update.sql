CREATE TABLE IF NOT EXISTS wallets (
    wallet_id TEXT PRIMARY KEY,
    public_key TEXT UNIQUE NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    balance NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
    tx_id TEXT PRIMARY KEY,
    sender_id TEXT REFERENCES wallets(wallet_id),
    receiver_id TEXT REFERENCES wallets(wallet_id),
    amount NUMERIC NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    signature TEXT NOT NULL,
    nonce TEXT UNIQUE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offline_queue (
    tx_id TEXT PRIMARY KEY,
    sender_id TEXT REFERENCES wallets(wallet_id),
    receiver_id TEXT REFERENCES wallets(wallet_id),
    amount NUMERIC NOT NULL,
    signature TEXT NOT NULL,
    synced BOOLEAN DEFAULT false,
    synced_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    wallet_id TEXT REFERENCES wallets(wallet_id),
    token TEXT UNIQUE NOT NULL,
    device_id TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION process_transfer(
    p_sender_id TEXT,
    p_receiver_id TEXT,
    p_amount NUMERIC,
    p_tx_id TEXT,
    p_signature TEXT,
    p_nonce TEXT DEFAULT NULL,
    p_type TEXT DEFAULT 'TRANSFER'
) RETURNS json AS $$
DECLARE
    v_sender_balance NUMERIC;
    v_receiver_exists BOOLEAN;
BEGIN
    SELECT balance INTO v_sender_balance FROM wallets WHERE wallet_id = p_sender_id FOR UPDATE;
    IF v_sender_balance < p_amount THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient balance');
    END IF;
    
    SELECT EXISTS(SELECT 1 FROM wallets WHERE wallet_id = p_receiver_id) INTO v_receiver_exists;
    IF NOT v_receiver_exists THEN
        RETURN json_build_object('success', false, 'error', 'Receiver not found');
    END IF;
    
    UPDATE wallets SET balance = balance - p_amount WHERE wallet_id = p_sender_id;
    UPDATE wallets SET balance = balance + p_amount WHERE wallet_id = p_receiver_id;
    
    INSERT INTO transactions (tx_id, sender_id, receiver_id, amount, type, status, signature, nonce)
    VALUES (p_tx_id, p_sender_id, p_receiver_id, p_amount, p_type, 'CONFIRMED', p_signature, COALESCE(p_nonce, p_tx_id));
    
    RETURN json_build_object('success', true, 'new_balance', v_sender_balance - p_amount);
END;
$$ LANGUAGE plpgsql;
