import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpService } from '../../../src/services/http-service.js'

// Mock axios
vi.mock('axios', () => ({
    default: vi.fn()
}))

import axios from 'axios'

describe('HttpService', () => {
    let service: HttpService
    const mockAxios = vi.mocked(axios)

    beforeEach(() => {
        vi.clearAllMocks()
        service = new HttpService()
    })

    describe('makeRequest', () => {
        it('should make GET request successfully', async () => {
            const mockResponse = {
                data: { message: 'Hello World', status: 'success' },
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' }
            }

            mockAxios.mockResolvedValue(mockResponse)

            const result = await service.makeRequest('https://api.example.com/health', 'GET')

            expect(result.success).toBe(true)
            expect(result.status).toBe(200)
            expect(result.data).toEqual(mockResponse.data)
            expect(mockAxios).toHaveBeenCalledWith({
                url: 'https://api.example.com/health',
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            })
        })

        it('should handle HTTP errors gracefully', async () => {
            const error = new Error('Request failed')
            ;(error as any).response = {
                status: 404,
                statusText: 'Not Found',
                data: { error: 'Resource not found' },
                headers: { 'content-type': 'application/json' }
            }

            mockAxios.mockRejectedValue(error)

            const result = await service.makeRequest('https://api.example.com/missing', 'GET')

            expect(result.success).toBe(false)
            expect(result.status).toBe(404)
            expect(result.error).toBe('Request failed')
        })

        it('should handle network errors', async () => {
            mockAxios.mockRejectedValue(new Error('Network Error'))

            const result = await service.makeRequest('https://api.example.com/test', 'POST')

            expect(result.success).toBe(false)
            expect(result.error).toContain('Network Error')
        })

        it('should support custom headers and timeout', async () => {
            const mockResponse = {
                data: { result: 'success' },
                status: 201,
                statusText: 'Created',
                headers: { 'content-type': 'application/json' }
            }

            mockAxios.mockResolvedValue(mockResponse)

            const result = await service.makeRequest(
                'https://api.example.com/users',
                'POST',
                {
                    'Authorization': 'Bearer token123',
                    'X-Custom': 'value'
                },
                { name: 'John Doe', email: 'john@example.com' },
                5000
            )

            expect(result.success).toBe(true)
            expect(result.status).toBe(201)
            expect(mockAxios).toHaveBeenCalledWith({
                url: 'https://api.example.com/users',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer token123',
                    'X-Custom': 'value'
                },
                data: { name: 'John Doe', email: 'john@example.com' },
                timeout: 5000
            })
        })

        it('should use default timeout when not specified', async () => {
            const mockResponse = {
                data: { ok: true },
                status: 200,
                statusText: 'OK',
                headers: {}
            }

            mockAxios.mockResolvedValue(mockResponse)

            await service.makeRequest('https://api.example.com/test')

            expect(mockAxios).toHaveBeenCalledWith({
                url: 'https://api.example.com/test',
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            })
        })
    })
})