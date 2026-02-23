# ZeroNetBank Authority (V2)

The strict, offline-first authority backend for ZeroNetPay.

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    # OR if you need to install without lockfile issues:
    npm install --no-package-lock
    ```

2.  **Generate Database Client**:
    ```bash
    npx prisma generate
    ```

3.  **Push Schema to SQLite (Dev)**:
    ```bash
    npx prisma db push
    ```

4.  **Start Server**:
    ```bash
    npm run dev
    ```

## API Structure

*   `POST /auth/register`: Create new wallet identity.
*   `POST /wallet/sync`: The "Mega Sync" endpoint (Upload offline txs + Download credits).
*   `POST /wallet/transfer`: Real-time online transfer.

## Cryptography

Matches Flutter's `pointycastle` and `bip32` implementation:
*   **Curve**: P-256 (secp256r1)
*   **Signatures**: R+S Hex Concatenation (64 bytes)
*   **Hash**: SHA-256
