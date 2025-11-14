import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class ShellOperations {
  static async handleExecuteShellCommand(args: any) {
    const { command, cwd = process.cwd(), timeout = 30000 } = args;

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout,
      });

      return {
        content: [
          {
            type: "text",
            text: `Command executed successfully\n\nStdout:\n${stdout}\n\nStderr:\n${stderr}`,
          },
        ],
        isError: false,
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Command failed: ${error.message}\n\nStdout: ${error.stdout || ''}\n\nStderr: ${error.stderr || ''}`,
          },
        ],
        isError: true,
      };
    }
  }
}