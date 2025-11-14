import { readFile, writeFile } from "fs/promises";

export class FileSystemOperations {
  static async handleReadSourceFile(args: any) {
    const { file_path } = args;

    try {
      const content = await readFile(file_path, 'utf-8');

      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
        isError: false,
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to read file: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  static async handleWriteSourceFile(args: any) {
    const { file_path, content, create_dirs = false } = args;

    try {
      await writeFile(file_path, content, 'utf-8');

      return {
        content: [
          {
            type: "text",
            text: `File written successfully to ${file_path}`,
          },
        ],
        isError: false,
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to write file: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
}