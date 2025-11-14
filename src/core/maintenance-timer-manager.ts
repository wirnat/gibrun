// Maintenance timer manager to prevent memory leaks
export class MaintenanceTimerManager {
  private timer: NodeJS.Timeout | null = null;
  private intervalMs: number;

  constructor(intervalMs: number) {
    this.intervalMs = intervalMs;
  }

  start(callback: () => void): void {
    this.stop(); // Clear any existing timer
    this.timer = setInterval(callback, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}