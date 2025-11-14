import * as vscode from 'vscode';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';

export interface MCPToolResult {
  operation: string;
  success: boolean;
  data?: any;
  error?: string;
  metadata?: any;
}

export class MCPClient {
  private client: Client | null = null;
  private transport: SSEClientTransport | WebSocketClientTransport | null = null;
  private connected = false;

  constructor() {}

  async connect(): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('gibrun.mcpServer');
      const host = config.get('host', 'localhost');
      const port = config.get('port', 3000);

      // Try WebSocket first, fallback to SSE
      try {
        this.transport = new WebSocketClientTransport(new URL(`ws://${host}:${port}`));
        this.client = new Client(
          {
            name: 'gibrun-vscode-extension',
            version: '1.0.0',
          },
          {
            capabilities: {},
          }
        );

        await this.client.connect(this.transport);
        console.log('Connected to MCP server via WebSocket');
      } catch (wsError) {
        console.warn('WebSocket connection failed, trying SSE:', wsError);

        this.transport = new SSEClientTransport(new URL(`http://${host}:${port}/sse`));
        this.client = new Client(
          {
            name: 'gibrun-vscode-extension',
            version: '1.0.0',
          },
          {
            capabilities: {},
          }
        );

        await this.client.connect(this.transport);
        console.log('Connected to MCP server via SSE');
      }

      this.connected = true;

      // List available tools for verification
      const tools = await this.client.listTools();
      console.log('Available MCP tools:', tools.tools?.map(t => t.name));

    } catch (error) {
      console.error('Failed to connect to MCP server:', error);
      throw new Error(`Cannot connect to MCP server: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      try {
        await this.client.close();
        this.connected = false;
        console.log('Disconnected from MCP server');
      } catch (error) {
        console.error('Error disconnecting from MCP server:', error);
      }
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async executeTool(toolName: string, args: any = {}): Promise<MCPToolResult | null> {
    if (!this.client || !this.connected) {
      throw new Error('MCP client not connected');
    }

    try {
      console.log(`Executing MCP tool: ${toolName}`, args);

      const result = await this.client.callTool({
        name: toolName,
        arguments: args,
      });

      console.log(`MCP tool ${toolName} result:`, result);

      // Parse the result
      if (result.content && Array.isArray(result.content) && result.content.length > 0) {
        const content = result.content[0];

        if (content.type === 'text') {
          try {
            const parsed = JSON.parse(content.text);
            return {
              operation: toolName.split('/')[1] || toolName,
              success: parsed.success !== false,
              data: parsed.data,
              error: parsed.error,
              metadata: parsed.metadata
            };
          } catch (parseError) {
            // If not JSON, return as text
            return {
              operation: toolName.split('/')[1] || toolName,
              success: true,
              data: content.text
            };
          }
        }
      }

      return {
        operation: toolName.split('/')[1] || toolName,
        success: false,
        error: 'No response content'
      };

    } catch (error: any) {
      console.error(`MCP tool ${toolName} execution failed:`, error);
      return {
        operation: toolName.split('/')[1] || toolName,
        success: false,
        error: error.message || 'Tool execution failed'
      };
    }
  }

  async listAvailableTools(): Promise<string[]> {
    if (!this.client || !this.connected) {
      return [];
    }

    try {
      const response = await this.client.listTools();
      return response.tools?.map(tool => tool.name) || [];
    } catch (error) {
      console.error('Failed to list tools:', error);
      return [];
    }
  }

  async getToolSchema(toolName: string): Promise<any> {
    if (!this.client || !this.connected) {
      return null;
    }

    try {
      const response = await this.client.listTools();
      const tool = response.tools?.find(t => t.name === toolName);
      return tool?.inputSchema || null;
    } catch (error) {
      console.error(`Failed to get schema for tool ${toolName}:`, error);
      return null;
    }
  }

  // Health check method
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.executeTool('project_analyzer/health', {
        operation: 'health',
        scope: 'module'
      });
      return result?.success === true;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }
}