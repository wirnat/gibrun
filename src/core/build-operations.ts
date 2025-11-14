import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class BuildOperations {
  static async handleBuildGoProject(args: any) {
    const { project_path, build_flags = "", output_path = "" } = args;

    try {
      let command = "go build";
      if (build_flags) {
        command += ` ${build_flags}`;
      }
      if (output_path) {
        command += ` -o ${output_path}`;
      }

      const { stdout, stderr } = await execAsync(command, {
        cwd: project_path,
      });

      return {
        content: [
          {
            type: "text",
            text: `Build completed successfully\n\nStdout:\n${stdout}\n\nStderr:\n${stderr}`,
          },
        ],
        isError: false,
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Build failed: ${error.message}\n\nStdout: ${error.stdout || ''}\n\nStderr: ${error.stderr || ''}`,
          },
        ],
        isError: true,
      };
    }
  }

  static async handleRunGoCommand(args: any) {
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