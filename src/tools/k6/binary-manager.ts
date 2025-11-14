import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { logError, logInfo } from "@/services/logger-service.js";

const execAsync = promisify(exec);

export class K6BinaryManager {
    private k6Version = '0.45.0';
    private k6Path: string | null = null;

    async ensureK6Installed(): Promise<string> {
        try {
            // Check if k6 is already available in PATH
            const existingPath = await this.findK6InPath();
            if (existingPath) {
                this.k6Path = existingPath;
                logInfo("Found existing K6 installation", { path: existingPath });
                return existingPath;
            }

            // Check for local installation
            const localPath = await this.checkLocalInstallation();
            if (localPath) {
                this.k6Path = localPath;
                return localPath;
            }

            // Download and install K6
            const installedPath = await this.downloadAndInstallK6();
            this.k6Path = installedPath;
            return installedPath;

        } catch (error: any) {
            logError("Failed to ensure K6 installation", error);
            throw new Error(`Failed to install K6: ${error.message}`);
        }
    }

    private async findK6InPath(): Promise<string | null> {
        try {
            const { stdout } = await execAsync('which k6');
            const k6Path = stdout.trim();
            if (k6Path) {
                // Validate version
                await this.validateVersion(k6Path);
                return k6Path;
            }
        } catch (error) {
            // k6 not found in PATH
        }
        return null;
    }

    private async checkLocalInstallation(): Promise<string | null> {
        const possiblePaths = [
            path.join(process.cwd(), 'node_modules', '.bin', 'k6'),
            path.join(process.cwd(), '.gibrun', 'bin', 'k6'),
            path.join(os.homedir(), '.gibrun', 'bin', 'k6'),
            path.join(os.homedir(), '.k6', 'bin', 'k6')
        ];

        for (const binPath of possiblePaths) {
            try {
                await fs.access(binPath);
                await this.validateVersion(binPath);
                logInfo("Found local K6 installation", { path: binPath });
                return binPath;
            } catch (error) {
                // Path doesn't exist or invalid
            }
        }

        return null;
    }

    private async downloadAndInstallK6(): Promise<string> {
        const platform = os.platform();
        const arch = os.arch();

        // Determine download URL based on platform
        const downloadUrl = this.getDownloadUrl(platform, arch);
        const installDir = path.join(process.cwd(), '.gibrun', 'bin');
        const k6Path = path.join(installDir, 'k6');

        logInfo("Downloading K6", { url: downloadUrl, installPath: k6Path });

        try {
            // Create install directory
            await fs.mkdir(installDir, { recursive: true });

            // Download K6 binary
            const response = await fetch(downloadUrl);
            if (!response.ok) {
                throw new Error(`Failed to download K6: ${response.status} ${response.statusText}`);
            }

            const buffer = await response.arrayBuffer();
            await fs.writeFile(k6Path, Buffer.from(buffer));

            // Make executable
            await fs.chmod(k6Path, 0o755);

            // Validate installation
            await this.validateVersion(k6Path);

            logInfo("Successfully installed K6", { path: k6Path });
            return k6Path;

        } catch (error: any) {
            logError("Failed to download/install K6", error, { url: downloadUrl, installPath: k6Path });
            throw new Error(`Failed to install K6: ${error.message}`);
        }
    }

    private getDownloadUrl(platform: string, arch: string): string {
        const baseUrl = 'https://github.com/grafana/k6/releases/download';
        const version = `v${this.k6Version}`;

        let platformArch = '';
        switch (platform) {
            case 'darwin':
                platformArch = arch === 'arm64' ? 'macos-arm64' : 'macos-amd64';
                break;
            case 'linux':
                platformArch = arch === 'arm64' ? 'linux-arm64' : 'linux-amd64';
                break;
            case 'win32':
                platformArch = arch === 'x64' ? 'windows-amd64' : 'windows-386';
                break;
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }

        return `${baseUrl}/${version}/k6-${version}-${platformArch}.tar.gz`;
    }

    private async validateVersion(k6Path: string): Promise<boolean> {
        try {
            const { stdout } = await execAsync(`"${k6Path}" version`);
            const versionMatch = stdout.match(/k6 v(\d+\.\d+\.\d+)/);

            if (!versionMatch) {
                throw new Error(`Invalid K6 version output: ${stdout}`);
            }

            const installedVersion = versionMatch[1];
            logInfo("K6 version validated", { version: installedVersion, path: k6Path });

            // Check if version is compatible (basic check)
            const majorVersion = parseInt(installedVersion.split('.')[0]);
            if (majorVersion < 0) {
                throw new Error(`K6 version ${installedVersion} is too old. Minimum required: 0.40.0`);
            }

            return true;
        } catch (error: any) {
            logError("K6 version validation failed", error, { path: k6Path });
            throw new Error(`Invalid K6 installation: ${error.message}`);
        }
    }

    getK6Path(): string | null {
        return this.k6Path;
    }
}