import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HTTP_TOOLS, handleHttpRequest } from '../../../src/tools/http/index.js'
import { HttpService } from '../../../src/services/http-service.js'

// Mock HttpService
vi.mock('../../../src/services/http-service.js', () => ({
    HttpService: vi.fn().mockImplementation(function() {
        return {
            makeRequest: vi.fn()
        }
    })
}))

describe('HTTP Tools', () => {
    let mockHttpService: any

    beforeEach(() => {
        vi.clearAllMocks()
        mockHttpService = new HttpService()
    })

    describe('HTTP_TOOLS', () => {
        it('should export HTTP_TOOLS array with correct structure', () => {
            expect(HTTP_TOOLS).toBeInstanceOf(Array)
            expect(HTTP_TOOLS).toHaveLength(1)

            const httpTool = HTTP_TOOLS[0]
            expect(httpTool.name).toBe('http_request')
            expect(httpTool.description).toContain('Make HTTP request to test API endpoints')
            expect(httpTool.inputSchema.type).toBe('object')
            expect(httpTool.inputSchema.properties).toHaveProperty('url')
            expect(httpTool.inputSchema.properties).toHaveProperty('method')
            expect(httpTool.inputSchema.properties).toHaveProperty('headers')
            expect(httpTool.inputSchema.properties).toHaveProperty('body')
            expect(httpTool.inputSchema.properties).toHaveProperty('timeout')
            expect(httpTool.inputSchema.required).toEqual(['url'])
        })

        it('should have proper parameter descriptions and defaults', () => {
            const httpTool = HTTP_TOOLS[0]
            const props = httpTool.inputSchema.properties as any

            expect(props.url.description).toContain('The URL to send request to')
            expect(props.method.enum).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
            expect(props.method.default).toBe('GET')
            expect(props.headers.description).toContain('HTTP headers as key-value pairs')
            expect(props.body.description).toContain('Request body')
            expect(props.timeout.description).toContain('Request timeout in milliseconds')
            expect(props.timeout.default).toBe(30000)
        })
    })

    describe('handleHttpRequest', () => {
        it('should handle successful HTTP GET request', async () => {
            const mockResult = {
                success: true,
                status: 200,
                data: { message: 'Hello World', status: 'success' },
                headers: { 'content-type': 'application/json' }
            }

            mockHttpService.makeRequest.mockResolvedValue(mockResult)

            const result = await handleHttpRequest(mockHttpService, {
                url: 'https://api.example.com/health'
            })

            expect(mockHttpService.makeRequest).toHaveBeenCalledWith(
                'https://api.example.com/health',
                'GET',
                undefined,
                undefined,
                30000
            )

            expect(result.content).toHaveLength(1)
            expect(result.content[0].type).toBe('text')

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent).toEqual(mockResult)
            expect(result.isError).toBe(false)
        })

        it('should handle successful HTTP POST request with body and headers', async () => {
            const mockResult = {
                success: true,
                status: 201,
                data: { id: 123, created: true },
                headers: { 'content-type': 'application/json', 'location': '/users/123' }
            }

            mockHttpService.makeRequest.mockResolvedValue(mockResult)

            const customHeaders = { 'Authorization': 'Bearer token123', 'X-API-Key': 'secret' }
            const requestBody = { name: 'John Doe', email: 'john@example.com' }

            const result = await handleHttpRequest(mockHttpService, {
                url: 'https://api.example.com/users',
                method: 'POST',
                headers: customHeaders,
                body: requestBody,
                timeout: 5000
            })

            expect(mockHttpService.makeRequest).toHaveBeenCalledWith(
                'https://api.example.com/users',
                'POST',
                customHeaders,
                requestBody,
                5000
            )

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent).toEqual(mockResult)
            expect(result.isError).toBe(false)
        })

        it('should handle HTTP request with custom method', async () => {
            const mockResult = {
                success: true,
                status: 204,
                data: null,
                headers: {}
            }

            mockHttpService.makeRequest.mockResolvedValue(mockResult)

            const result = await handleHttpRequest(mockHttpService, {
                url: 'https://api.example.com/users/123',
                method: 'DELETE'
            })

            expect(mockHttpService.makeRequest).toHaveBeenCalledWith(
                'https://api.example.com/users/123',
                'DELETE',
                undefined,
                undefined,
                30000
            )
        })

        it('should handle HTTP request errors', async () => {
            const mockResult = {
                success: false,
                status: 404,
                error: 'Resource not found',
                data: { error: 'User not found' }
            }

            mockHttpService.makeRequest.mockResolvedValue(mockResult)

            const result = await handleHttpRequest(mockHttpService, {
                url: 'https://api.example.com/users/999'
            })

            expect(result.content).toHaveLength(1)
            expect(result.content[0].type).toBe('text')

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent).toEqual(mockResult)
            expect(result.isError).toBe(true)
        })

        it('should handle network/service exceptions', async () => {
            const testError = new Error('Connection timeout')
            mockHttpService.makeRequest.mockRejectedValue(testError)

            await expect(handleHttpRequest(mockHttpService, {
                url: 'https://api.example.com/test'
            })).rejects.toThrow('Connection timeout')
        })

        it('should use default values when not provided', async () => {
            const mockResult = {
                success: true,
                status: 200,
                data: { ok: true },
                headers: { 'content-type': 'application/json' }
            }

            mockHttpService.makeRequest.mockResolvedValue(mockResult)

            const result = await handleHttpRequest(mockHttpService, {
                url: 'https://api.example.com/status'
            })

            expect(mockHttpService.makeRequest).toHaveBeenCalledWith(
                'https://api.example.com/status',
                'GET', // default method
                undefined, // no headers
                undefined, // no body
                30000 // default timeout
            )
        })

        it('should handle PUT and PATCH methods', async () => {
            const mockResult = {
                success: true,
                status: 200,
                data: { updated: true },
                headers: {}
            }

            mockHttpService.makeRequest.mockResolvedValue(mockResult)

            // Test PUT
            await handleHttpRequest(mockHttpService, {
                url: 'https://api.example.com/users/123',
                method: 'PUT',
                body: { name: 'Updated Name' }
            })

            expect(mockHttpService.makeRequest).toHaveBeenCalledWith(
                'https://api.example.com/users/123',
                'PUT',
                undefined,
                { name: 'Updated Name' },
                30000
            )

            // Reset mock
            mockHttpService.makeRequest.mockClear()

            // Test PATCH
            await handleHttpRequest(mockHttpService, {
                url: 'https://api.example.com/users/123',
                method: 'PATCH',
                body: { email: 'newemail@example.com' }
            })

            expect(mockHttpService.makeRequest).toHaveBeenCalledWith(
                'https://api.example.com/users/123',
                'PATCH',
                undefined,
                { email: 'newemail@example.com' },
                30000
            )
        })

        it('should handle requests with only headers (no body)', async () => {
            const mockResult = {
                success: true,
                status: 200,
                data: { authenticated: true },
                headers: {}
            }

            mockHttpService.makeRequest.mockResolvedValue(mockResult)

            const result = await handleHttpRequest(mockHttpService, {
                url: 'https://api.example.com/auth/status',
                headers: { 'Authorization': 'Bearer token' }
            })

            expect(mockHttpService.makeRequest).toHaveBeenCalledWith(
                'https://api.example.com/auth/status',
                'GET',
                { 'Authorization': 'Bearer token' },
                undefined,
                30000
            )
        })
    })
})