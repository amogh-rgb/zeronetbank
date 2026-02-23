import { Router } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';

const router = Router();

// WebSocket setup for real-time updates
export function setupWebSocket(server: any) {
    const io = new SocketIOServer(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket: Socket) => {
        console.log('Client connected to WebSocket');

        // Join user-specific room
        socket.on('join-user', (userId: string) => {
            socket.join(`user-${userId}`);
            console.log(`User ${userId} joined their room`);
        });

        // Handle real-time transactions
        socket.on('transaction', (data: any) => {
            // Broadcast to all admin clients
            io.emit('admin-transaction', data);
            
            // Send to specific user
            if (data.toUserId) {
                io.to(`user-${data.toUserId}`).emit('user-transaction', data);
            }
        });

        // Handle user status updates
        socket.on('user-status', (data: any) => {
            io.emit('user-status-update', data);
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected from WebSocket');
        });
    });

    return io;
}

// Real-time event broadcasting
export function broadcastTransaction(io: any, transaction: any) {
    io.emit('transaction', {
        type: 'transaction',
        transaction: `${transaction.from} → ${transaction.to}: ₹${transaction.amount}`,
        data: transaction
    });
}

export function broadcastUserStatus(io: any, userId: string, status: string) {
    io.emit('user_status', {
        type: 'user_status',
        userId,
        status
    });
}

export default router;
