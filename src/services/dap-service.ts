import * as net from "net";
import { logError, logInfo } from "./logger-service.js";

// Type definitions for DAP messages and events
interface DAPMessage {
    seq: number;
    type: string;
    [key: string]: any;
}

interface DAPEvent {
    seq: number;
    type: 'event';
    event: string;
    body?: any;
}

interface DAPEventSubscription {
    eventType: string;
    filter?: Record<string, any>;
    persistent?: boolean;
    callback?: (event: DAPEvent) => void;
}

export class DAPService {
    private connections = new Map<string, net.Socket>();
    private sequenceNumber = 1;
    private eventListeners = new Map<string, ((event: DAPEvent) => void)[]>();
    private eventSubscriptions = new Map<string, DAPEventSubscription>();

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
            const timeout = setTimeout(() => {
                socket.removeListener('data', onData);
                reject(new Error('DAP response timeout'));
            }, 30000); // 30 second timeout

            const onData = (data: Buffer) => {
                buffer += data.toString();

                const messages = buffer.split('\r\n');
                for (let i = 0; i < messages.length - 1; i++) {
                    const messageStr = messages[i];
                    if (messageStr.trim()) {
                        try {
                            const message = JSON.parse(messageStr);

                            // Handle events
                            if (message.type === 'event') {
                                this.handleEvent(message as DAPEvent);
                            } else if (message.type === 'response') {
                                // Found response, clean up and resolve
                                clearTimeout(timeout);
                                socket.removeListener('data', onData);
                                resolve(message);
                                return;
                            }
                        } catch (error) {
                            clearTimeout(timeout);
                            socket.removeListener('data', onData);
                            reject(error);
                            return;
                        }
                    }
                }

                // Keep remaining incomplete message in buffer
                buffer = messages[messages.length - 1];
            };

            socket.on('data', onData);

            // Timeout after 30 seconds
            setTimeout(() => {
                socket.removeListener('data', onData);
                reject(new Error('DAP response timeout'));
            }, 30000);
        });
    }

    private handleEvent(event: DAPEvent): void {
        logInfo('DAP Event received', { event: event.event, seq: event.seq });

        // Notify all listeners for this event type
        const listeners = this.eventListeners.get(event.event) || [];
        listeners.forEach(callback => {
            try {
                callback(event);
            } catch (error) {
                logError('Error in DAP event listener', error, { event: event.event });
            }
        });

        // Check subscriptions
        const subscription = this.eventSubscriptions.get(event.event);
        if (subscription?.callback) {
            try {
                subscription.callback(event);
            } catch (error) {
                logError('Error in DAP event subscription callback', error, { event: event.event });
            }
        }
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
        this.eventListeners.clear();
        this.eventSubscriptions.clear();
    }

    // Event handling methods
    addEventListener(eventType: string, callback: (event: DAPEvent) => void): void {
        if (!this.eventListeners.has(eventType)) {
            this.eventListeners.set(eventType, []);
        }
        this.eventListeners.get(eventType)!.push(callback);
    }

    removeEventListener(eventType: string, callback: (event: DAPEvent) => void): void {
        const listeners = this.eventListeners.get(eventType);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    subscribeToEvent(subscription: DAPEventSubscription): void {
        this.eventSubscriptions.set(subscription.eventType, subscription);
    }

    unsubscribeFromEvent(eventType: string): void {
        this.eventSubscriptions.delete(eventType);
    }

    async listenForEvents(host: string, port: number, options: {
        eventTypes?: string[];
        timeoutMs?: number;
        maxEvents?: number;
    } = {}): Promise<DAPEvent[]> {
        const { eventTypes = ['stopped', 'output', 'breakpoint'], timeoutMs = 30000, maxEvents = 100 } = options;

        return new Promise((resolve, reject) => {
            const events: DAPEvent[] = [];
            let timeoutId: NodeJS.Timeout;

            const eventHandler = (event: DAPEvent) => {
                if (eventTypes.includes(event.event)) {
                    events.push(event);

                    if (events.length >= maxEvents) {
                        cleanup();
                        resolve(events);
                    }
                }
            };

            const cleanup = () => {
                if (timeoutId) clearTimeout(timeoutId);
                eventTypes.forEach(eventType => {
                    this.removeEventListener(eventType, eventHandler);
                });
            };

            // Add listeners for specified event types
            eventTypes.forEach(eventType => {
                this.addEventListener(eventType, eventHandler);
            });

            // Set timeout
            timeoutId = setTimeout(() => {
                cleanup();
                resolve(events); // Return events collected so far
            }, timeoutMs);
        });
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