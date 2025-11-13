import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DAPService } from "@/services/dap-service.js";
import { resolveDAPServer } from "@/core/dap-handlers.js";
import { DAPEvent, DAPEventListenerOptions } from "@/types/server.js";

// Event handling tools for DAP

export const DAP_EVENT_TOOLS: Tool[] = [
    {
        name: "dap_listen_events",
        description: "Listen for DAP events in real-time. Useful for monitoring debugger state changes, breakpoint hits, and program output.",
        inputSchema: {
            type: "object",
            properties: {
                host: {
                    type: "string",
                    description: "DAP server host (default: auto-detected)",
                    default: "127.0.0.1"
                },
                port: {
                    type: "number",
                    description: "DAP server port (auto-detected if not provided)"
                },
                event_types: {
                    type: "array",
                    description: "Types of events to listen for",
                    items: {
                        type: "string",
                        enum: ["stopped", "output", "breakpoint", "thread", "module", "loadedSource", "process", "capabilities", "initialized", "terminated", "exited"]
                    },
                    default: ["stopped", "output", "breakpoint"]
                },
                timeout_ms: {
                    type: "number",
                    description: "How long to listen for events in milliseconds",
                    default: 30000,
                    minimum: 1000,
                    maximum: 300000
                },
                max_events: {
                    type: "number",
                    description: "Maximum number of events to collect before returning",
                    default: 100,
                    minimum: 1,
                    maximum: 1000
                }
            }
        },
    },
    {
        name: "dap_subscribe_events",
        description: "Subscribe to specific DAP events with persistent callbacks. Events will be monitored continuously until unsubscribed.",
        inputSchema: {
            type: "object",
            properties: {
                host: {
                    type: "string",
                    description: "DAP server host (default: auto-detected)",
                    default: "127.0.0.1"
                },
                port: {
                    type: "number",
                    description: "DAP server port (auto-detected if not provided)"
                },
                subscriptions: {
                    type: "array",
                    description: "Event subscriptions to create",
                    items: {
                        type: "object",
                        properties: {
                            event_type: {
                                type: "string",
                                description: "Type of event to subscribe to",
                                enum: ["stopped", "output", "breakpoint", "thread", "module", "loadedSource", "process", "capabilities", "initialized", "terminated", "exited"]
                            },
                            filter: {
                                type: "object",
                                description: "Optional filter criteria for events"
                            },
                            persistent: {
                                type: "boolean",
                                description: "Whether subscription should persist across tool calls",
                                default: false
                            }
                        },
                        required: ["event_type"]
                    }
                }
            },
            required: ["subscriptions"]
        },
    },
];

export async function handleDAPListenEvents(dapService: DAPService, args: any) {
    const { host, port, event_types, timeout_ms, max_events } = args;

    try {
        // Resolve DAP server
        const resolution = await resolveDAPServer(host, port);
        if (!resolution.success) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: resolution.error,
                            tool: "dap_listen_events"
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        // Listen for events
        const events = await dapService.listenForEvents(resolvedHost, resolvedPort, {
            eventTypes: event_types,
            timeoutMs: timeout_ms,
            maxEvents: max_events
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        tool: "dap_listen_events",
                        events_listened: event_types,
                        events_received: events.length,
                        timeout_ms,
                        max_events,
                        events: events.map(event => ({
                            type: event.event,
                            sequence: event.seq,
                            body: event.body,
                            timestamp: new Date().toISOString()
                        })),
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        summary: {
                            event_counts: events.reduce((acc, event) => {
                                acc[event.event] = (acc[event.event] || 0) + 1;
                                return acc;
                            }, {} as Record<string, number>)
                        }
                    }, null, 2),
                },
            ],
        };
    } catch (error: any) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: false,
                        tool: "dap_listen_events",
                        event_types,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

export async function handleDAPSubscribeEvents(dapService: DAPService, args: any) {
    const { host, port, subscriptions } = args;

    try {
        // Resolve DAP server
        const resolution = await resolveDAPServer(host, port);
        if (!resolution.success) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: resolution.error,
                            tool: "dap_subscribe_events"
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        // Create subscriptions
        const subscriptionIds: string[] = [];
        subscriptions.forEach((sub: any, index: number) => {
            const subscriptionId = `${sub.event_type}_${Date.now()}_${index}`;
            subscriptionIds.push(subscriptionId);

            dapService.subscribeToEvent({
                eventType: sub.event_type,
                filter: sub.filter,
                persistent: sub.persistent || false,
                callback: (event: DAPEvent) => {
                    // Log event for monitoring (in real implementation, this could be stored or forwarded)
                    console.log(`DAP Event [${subscriptionId}]:`, {
                        type: event.event,
                        seq: event.seq,
                        body: event.body,
                        timestamp: new Date().toISOString()
                    });
                }
            });
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        tool: "dap_subscribe_events",
                        subscriptions_created: subscriptions.length,
                        subscription_ids: subscriptionIds,
                        subscriptions: subscriptions.map((sub: any, index: number) => ({
                            id: subscriptionIds[index],
                            event_type: sub.event_type,
                            filter: sub.filter,
                            persistent: sub.persistent || false
                        })),
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        note: "Subscriptions are active. Events will be logged to console. Use dap_listen_events for immediate event collection."
                    }, null, 2),
                },
            ],
        };
    } catch (error: any) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: false,
                        tool: "dap_subscribe_events",
                        subscriptions,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}