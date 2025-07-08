import { spawn, ChildProcess } from 'child_process';

export interface StreamingProcess {
  id: string;
  process: ChildProcess;
  channelId: string;
  currentVideoFile: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped';
  createdAt: Date;
}

export interface StartProcessParams {
  token: string;
  channelId: string;
  userId?: string;
  videoFile: string;
  fps?: number;
  localIP?: string;
}

class ProcessManager {
  private processes: Map<string, StreamingProcess> = new Map();
  private executablePath: string = './build/agora_streaming_controlled'; // Local build
  private libraryPath: string = '/home/ubuntu/agora_rtc_sdk/agora_sdk'; // Reference existing SDK

  constructor(executablePath?: string, libraryPath?: string) {
    if (executablePath) {
      this.executablePath = executablePath;
    }
    if (libraryPath) {
      this.libraryPath = libraryPath;
    }
  }

  async startProcess(params: StartProcessParams): Promise<string> {
    const processId = `${params.channelId}_${Date.now()}`;
    
    // Build command line arguments
    const args = [
      '--token', params.token,
      '--channelId', params.channelId,
      '--videoFile', params.videoFile
    ];

    if (params.userId) {
      args.push('--userId', params.userId);
    }
    if (params.fps) {
      args.push('--fps', params.fps.toString());
    }
    if (params.localIP) {
      args.push('--localIP', params.localIP);
    }

    try {
      // Set up environment with LD_LIBRARY_PATH
      const env = {
        ...process.env,
        LD_LIBRARY_PATH: this.libraryPath
      };

      const childProcess = spawn(this.executablePath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: env
      });

      const streamingProcess: StreamingProcess = {
        id: processId,
        process: childProcess,
        channelId: params.channelId,
        currentVideoFile: params.videoFile,
        status: 'starting',
        createdAt: new Date()
      };

      this.processes.set(processId, streamingProcess);

      // Handle process events
      childProcess.on('spawn', () => {
        console.log(`Process ${processId} started successfully`);
        streamingProcess.status = 'running';
      });

      childProcess.on('error', (error) => {
        console.error(`Process ${processId} error:`, error);
        streamingProcess.status = 'stopped';
      });

      childProcess.on('exit', (code, signal) => {
        console.log(`Process ${processId} exited with code ${code}, signal ${signal}`);
        streamingProcess.status = 'stopped';
        this.processes.delete(processId);
      });

      // Handle stdout/stderr for logging
      childProcess.stdout?.on('data', (data) => {
        console.log(`[${processId}] stdout: ${data}`);
      });

      childProcess.stderr?.on('data', (data) => {
        console.error(`[${processId}] stderr: ${data}`);
      });

      return processId;
    } catch (error) {
      console.error('Failed to start process:', error);
      throw new Error(`Failed to start streaming process: ${error}`);
    }
  }

  async switchVideo(processId: string, newVideoFile: string): Promise<boolean> {
    const streamingProcess = this.processes.get(processId);
    
    if (!streamingProcess || streamingProcess.status !== 'running') {
      throw new Error(`Process ${processId} not found or not running`);
    }

    try {
      // Send switch command to the process
      const command = `SWITCH_VIDEO:${newVideoFile}\n`;
      streamingProcess.process.stdin?.write(command);
      
      // Update current video file
      streamingProcess.currentVideoFile = newVideoFile;
      
      console.log(`Sent switch command to process ${processId}: ${newVideoFile}`);
      return true;
    } catch (error) {
      console.error(`Failed to switch video for process ${processId}:`, error);
      return false;
    }
  }

  async stopProcess(processId: string): Promise<boolean> {
    const streamingProcess = this.processes.get(processId);
    
    if (!streamingProcess) {
      return false;
    }

    try {
      streamingProcess.status = 'stopping';
      
      // Send graceful shutdown command
      streamingProcess.process.stdin?.write('EXIT\n');
      
      // Give process time to shutdown gracefully
      setTimeout(() => {
        if (streamingProcess.process && !streamingProcess.process.killed) {
          streamingProcess.process.kill('SIGTERM');
        }
      }, 5000);

      // Force kill after 10 seconds if still running
      setTimeout(() => {
        if (streamingProcess.process && !streamingProcess.process.killed) {
          streamingProcess.process.kill('SIGKILL');
        }
      }, 10000);

      return true;
    } catch (error) {
      console.error(`Failed to stop process ${processId}:`, error);
      return false;
    }
  }

  getProcess(processId: string): StreamingProcess | undefined {
    return this.processes.get(processId);
  }

  getAllProcesses(): StreamingProcess[] {
    return Array.from(this.processes.values());
  }

  getProcessByChannelId(channelId: string): StreamingProcess | undefined {
    for (const process of this.processes.values()) {
      if (process.channelId === channelId) {
        return process;
      }
    }
    return undefined;
  }

  async cleanup(): Promise<void> {
    const promises = Array.from(this.processes.keys()).map(id => this.stopProcess(id));
    await Promise.all(promises);
  }
}

// Singleton instance
export const processManager = new ProcessManager(
  './build/agora_streaming_controlled', // Local build in agora-video-controller
  '/home/ubuntu/agora_rtc_sdk/agora_sdk' // Reference existing Agora SDK
);

// Cleanup on process exit
process.on('SIGINT', () => processManager.cleanup());
process.on('SIGTERM', () => processManager.cleanup());
