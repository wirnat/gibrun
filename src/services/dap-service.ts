import * as net from "net";
import { logError, logInfo } from "./logger-service.js";
// Type definitions for DAP messages
interface DAPMessage {
    seq: number;
    type: string;
    [key: string]: any;
}

export class DAPService {
    private connections = new Map<string, net.Socket>();
    private sequenceNumber = 1;

    constructor() {}

    private async connect(host: string, port: number): Promise<net.Socket> {
        return new Promise((resolve, reject) => {
            const socket = net.createConnection({ host, port }, () => {
                logInfo(`Connected to DAP server at ${host}:${port}`);
                resolve(socket);
            });

            socket.on('error', (error) => {
                logError('DAP connection failed', error, { host, port });
                reject(error);
            });

            socket.on('close', () => {
                logInfo(`DAP connection closed for ${host}:${port}`);
                this.connections.delete(`${host}:${port}`);
            });
        });
    }

    private getConnection(host: string, port: number): net.Socket | null {
        return this.connections.get(`${host}:${port}`) || null;
    }

    private async ensureConnection(host: string, port: number): Promise<net.Socket> {
        let socket = this.getConnection(host, port);
        if (!socket) {
            socket = await this.connect(host, port);
            this.connections.set(`${host}:${port}`, socket);
        }
        return socket;
    }

    private async sendMessage(socket: net.Socket, message: DAPMessage): Promise<void> {
        return new Promise((resolve, reject) => {
            const jsonMessage = JSON.stringify(message) + '\r\n';
            socket.write(jsonMessage, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    private async readMessage(socket: net.Socket): Promise<DAPMessage> {
        return new Promise((resolve, reject) => {
            let buffer = '';

            const onData = (data: Buffer) => {
                buffer += data.toString();

                const messages = buffer.split('\r\n');
                if (messages.length > 1) {
                    try {
                        const message = JSON.parse(messages[0]);
                        socket.removeListener('data', onData);
                        resolve(message);
                    } catch (error) {
                        reject(error);
                    }
                }
            };

            socket.on('data', onData);

            // Timeout after 30 seconds
            setTimeout(() => {
                socket.removeListener('data', onData);
                reject(new Error('DAP response timeout'));
            }, 30000);
        });
    }

    async sendDAPRequest(host: string, port: number, command: string, args?: any): Promise<DAPMessage> {
        try {
            const socket = await this.ensureConnection(host, port);

            // Create DAP request
            const request: DAPMessage = {
                seq: this.sequenceNumber++,
                type: 'request',
                command,
                arguments: args
            };

            await this.sendMessage(socket, request);
            const response = await this.readMessage(socket);

            return response;
        } catch (error) {
            logError('DAP request failed', error, { host, port, command, args });
            throw error;
        }
    }

    async disconnect(host: string, port: number): Promise<void> {
        const socket = this.getConnection(host, port);
        if (socket) {
            socket.end();
            this.connections.delete(`${host}:${port}`);
        }
    }

    async closeAllConnections(): Promise<void> {
        for (const socket of this.connections.values()) {
            socket.end();
        }
        this.connections.clear();
    }
}

// Legacy GoDebuggerProxy class - kept for backward compatibility
export class GoDebuggerProxy {
    private workingDir: string;

    constructor(workingDir: string) {
        this.workingDir = workingDir;
    }

    // Placeholder methods - to be migrated to DAPService
    async initialize(): Promise<void> {
        logInfo("GoDebuggerProxy initialized (legacy)");
    }

    async listTools(): Promise<any[]> {
        // Return empty array for now - DAP tools are handled in main server
        return [];
    }

    async callTool(name: string, args: any): Promise<any> {
        // This should not be called - DAP tools are handled in main server
        throw new Error(`Tool ${name} not found in GoDebuggerProxy`);
    }

    async shutdown(): Promise<void> {
        logInfo("GoDebuggerProxy shutdown (legacy)");
    }

    async restart(host: string, port: number): Promise<any> {
        // Delegate to DAPService
        const dapService = new DAPService();
        try {
            return await dapService.sendDAPRequest(host, port, 'disconnect', { restart: true });
        } finally {
            await dapService.closeAllConnections();
        }
    }
}