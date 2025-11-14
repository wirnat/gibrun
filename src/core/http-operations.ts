import { HttpService } from "@/services/http-service.js";

export class HttpOperations {
  static async handleHttpRequest(args: any) {
    const {
      url,
      method = "GET",
      headers = {},
      body,
      timeout = 30000,
    } = args;

    const httpService = new HttpService();
    const result = await httpService.makeRequest(url, method, headers, body, timeout);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError: !result.success,
    };
  }
}