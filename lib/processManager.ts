import { spawn, ChildProcess } from 'child_process';

export interface StreamingProcess {
  id: string;
  process: ChildProcess;
  // Avatar mapping fields (optional)
  avatarId?: string;
  state?: string;
  expression?: string;
  // Direct video file (optional)
  videoFile?: string;
  // Required fields
  channel: string;
  token: string;  // Required since we always resolve it from env or param
  uid: string;    // Required since we always provide a default
  status: 'starting' | 'running' | 'stopping' | 'stopped';
  createdAt: Date;
  lastActivity: Date;
}

export interface StartProcessParams {
  // Avatar mapping approach
  avatarId?: string;
  state?: string;
  expression?: string;
  // Direct video file approach
  videoFile?: string;
  // Required for all
  channel: string;
  token?: string;  // Optional since it can come from env
  uid?: string;    // Optional since it has a default
}

export interface SwitchProcessParams {
  // Avatar mapping approach
  avatarId?: string;
  state?: string;
  expression?: string;
  // Direct video file approach
  videoFile?: string;
  // Required for all
  channel: string;
  token?: string;  // Optional since it can come from env
  uid?: string;    // Optional since it has a default
}

export interface StopProcessParams {
  channel: string;
  token?: string;  // Optional since it can come from env
  uid?: string;    // Optional since it has a default
}

// Global registry that survives hot reloads
declare global {
  var __AGORA_PROCESS_REGISTRY: Map<string, StreamingProcess> | undefined;
  var __AGORA_PROCESS_MANAGER_INSTANCE: ProcessManager | undefined;
}

class ProcessManager {
  private processes: Map<string, StreamingProcess>;
  private executablePath: string = './build/agora_streaming_controlled';
  private libraryPath: string = '/home/ubuntu/agora_rtc_sdk/agora_sdk';
  private instanceId: string;

  constructor(executablePath?: string, libraryPath?: string) {
    this.instanceId = `PM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Use global registry to survive hot reloads
    if (!global.__AGORA_PROCESS_REGISTRY) {
      console.log(`🏗️  Creating new global process registry`);
      global.__AGORA_PROCESS_REGISTRY = new Map();
    } else {
      console.log(`♻️  Reusing existing global process registry with ${global.__AGORA_PROCESS_REGISTRY.size} processes`);
    }
    
    this.processes = global.__AGORA_PROCESS_REGISTRY;
    
    if (executablePath) {
      this.executablePath = executablePath;
    }
    if (libraryPath) {
      this.libraryPath = libraryPath;
    }

    // Clean up any dead processes that might be left from previous hot reloads
    this.cleanupDeadProcesses();
  }

  private cleanupDeadProcesses(): void {
    let deadCount = 0;
    
    for (const [id, streamingProcess] of this.processes.entries()) {
      try {
        if (streamingProcess.process.pid) {
          // Check if process is still alive using Node.js process.kill with signal 0
          process.kill(streamingProcess.process.pid, 0);
        } else {
          this.processes.delete(id);
          deadCount++;
        }
      } catch (error) {
        this.processes.delete(id);
        deadCount++;
      }
    }
    
    if (deadCount > 0) {
      console.log(`🧹 Cleaned up ${deadCount} dead processes. Active processes: ${this.processes.size}`);
    }
  }

  private generateVideoFile(avatarId: string, state: string, expression: string): string {
    // Generate video file path based on avatarId, state, and expression
    const baseUrl = 'https://assets.trulience.com/assets/vba';
    return `${baseUrl}/${avatarId}/videos/${state}_${expression}_hls/1080_3000_1/1080p_0.m3u8`;
  }

  private resolveVideoFile(params: StartProcessParams | SwitchProcessParams): string {
    // If videoFile is directly provided, use it
    if (params.videoFile) {
      return params.videoFile;
    }
    
    // If avatar parameters are provided, generate the URL
    if (params.avatarId && params.state && params.expression) {
      return this.generateVideoFile(params.avatarId, params.state, params.expression);
    }
    
    // TODO: In the future, this will map avatarId/state/expression to videoFile from database/config
    // For now, throw an error if neither approach is provided
    throw new Error('Either videoFile or complete avatarId/state/expression must be provided');
  }

  private obscureToken(token: string): string {
    if (token.length <= 8) {
      return '***';
    }
    return token.substring(0, 4) + '***' + token.substring(token.length - 4);
  }

  async startProcess(params: StartProcessParams): Promise<string> {
    const processId = `${params.channel}_${Date.now()}`;
    
    // Resolve token and uid to ensure they're never undefined
    const resolvedToken = params.token || process.env.AGORA_APP_TOKEN;
    const resolvedUid = params.uid || 'user123';
    
    if (!resolvedToken) {
      throw new Error('AGORA_APP_TOKEN not found in environment and no token provided');
    }
    
    console.log(`🚀 Starting stream: ${params.channel} -> ${params.avatarId ? `${params.avatarId}/${params.state}/${params.expression}` : params.videoFile}`);
    
    // Resolve video file from either direct videoFile or avatar parameters
    const videoFile = this.resolveVideoFile(params);
    
    // Build command line arguments
    const args = [
      '--token', resolvedToken,
      '--channelId', params.channel,
      '--userId', resolvedUid,
      '--videoFile', videoFile
    ];

    console.log(`📋 Command line arguments:`);
    console.log(`   Executable: ${this.executablePath}`);
    console.log(`   Args: ${JSON.stringify(args, null, 2)}`);
    console.log(`   Token length: ${resolvedToken.length} chars`);
    console.log(`   Token starts with: ${resolvedToken.substring(0, 8)}...`);
    console.log(`   Channel: ${params.channel}`);
    console.log(`   UID: ${resolvedUid}`);
    console.log(`   Video file: ${videoFile}`);
    console.log(`   LD_LIBRARY_PATH: ${this.libraryPath}`);

    try {
      // Set up environment with LD_LIBRARY_PATH
      const env = {
        ...process.env,
        LD_LIBRARY_PATH: this.libraryPath
      };

      console.log(`🚀 Spawning process with PID...`);
      const childProcess = spawn(this.executablePath, args, {
        stdio: ['pipe', 'pipe', 'pipe'] as const,
        env: env
      }) as ChildProcess;

      const streamingProcess: StreamingProcess = {
        id: processId,
        process: childProcess,
        avatarId: params.avatarId,
        state: params.state,
        expression: params.expression,
        videoFile: params.videoFile,
        channel: params.channel,
        token: resolvedToken,  // Now guaranteed to be string
        uid: resolvedUid,      // Now guaranteed to be string
        status: 'starting',
        createdAt: new Date(),
        lastActivity: new Date()
      };

      this.processes.set(processId, streamingProcess);

      // Handle process events
      childProcess.on('spawn', () => {
        console.log(`✅ Stream started: ${params.channel} (PID: ${childProcess.pid})`);
        streamingProcess.status = 'running';
        streamingProcess.lastActivity = new Date();
      });

      childProcess.on('error', (error) => {
        console.error(`❌ Stream error ${params.channel}:`, error.message);
        streamingProcess.status = 'stopped';
        streamingProcess.lastActivity = new Date();
      });

      childProcess.on('exit', (code, signal) => {
        console.log(`🛑 Process ${params.channel} exit event:`);
        console.log(`   Exit code: ${code}`);
        console.log(`   Signal: ${signal}`);
        console.log(`   PID was: ${childProcess.pid}`);
        console.log(`   Status was: ${streamingProcess.status}`);
        
        streamingProcess.status = 'stopped';
        streamingProcess.lastActivity = new Date();
        
        // Remove from registry after a short delay
        setTimeout(() => {
          if (this.processes.has(processId)) {
            this.processes.delete(processId);
            console.log(`🗑️  Process ${processId} removed from registry`);
          }
        }, 5000);
      });

      // Handle stdout - only log important messages
      childProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        streamingProcess.lastActivity = new Date();
        
        console.log(`📺 [${params.channel}] STDOUT: ${output.trim()}`);
        
        // Only log important messages
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.trim() && (
              line.includes('Process ready for commands') ||
              line.includes('Successfully switched to:') ||
              line.includes('Start sending video data') ||
              line.includes('Disconnected from Agora')
            )) {
            console.log(`📺 [${params.channel}] IMPORTANT: ${line.trim()}`);
          }
        }
      });

      // Handle stderr - log everything for debugging
      childProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        streamingProcess.lastActivity = new Date();
        
        console.error(`⚠️  [${params.channel}] STDERR: ${output.trim()}`);
        
        // Check for specific error patterns
        if (output.includes('Failed to connect to Agora channel')) {
          console.error(`🚨 [${params.channel}] AGORA CONNECTION FAILED - Check token and channel`);
        }
        if (output.includes('terminate called')) {
          console.error(`💥 [${params.channel}] PROCESS CRASHED - Unexpected termination`);
        }
      });

      // Ensure stdin is available and writable
      if (!childProcess.stdin) {
        throw new Error('Failed to establish stdin pipe to child process');
      }

      // Set stdin encoding to ensure proper text handling
      childProcess.stdin.setDefaultEncoding('utf8');

      // Give the process a moment to initialize
      setTimeout(() => {
        if (streamingProcess.status === 'starting' && !childProcess.killed) {
          streamingProcess.status = 'running';
        }
      }, 2000);

      return processId;
    } catch (error) {
      console.error(`💥 Failed to start stream ${params.channel}:`, error);
      this.processes.delete(processId);
      throw new Error(`Failed to start streaming process: ${error}`);
    }
  }

  async switchVideo(params: SwitchProcessParams): Promise<boolean> {
    // Resolve token and uid to ensure they're never undefined
    const resolvedToken = params.token || process.env.AGORA_APP_TOKEN;
    const resolvedUid = params.uid || 'user123';
    
    if (!resolvedToken) {
      throw new Error('AGORA_APP_TOKEN not found in environment and no token provided');
    }
    
    // Find process by channel, token, and uid
    const streamingProcess = this.findProcessByCredentials(params.channel, resolvedToken, resolvedUid);
    
    if (!streamingProcess) {
      throw new Error(`No process found for channel ${params.channel} with matching credentials`);
    }

    if (streamingProcess.status !== 'running') {
      throw new Error(`Process not running (status: ${streamingProcess.status})`);
    }

    if (!streamingProcess.process.stdin?.writable) {
      throw new Error(`Process stdin not available`);
    }

    try {
      console.log(`🔄 Switching video: ${params.channel} -> ${params.avatarId ? `${params.avatarId}/${params.state}/${params.expression}` : params.videoFile}`);
      
      // Resolve video file from either direct videoFile or avatar parameters
      const newVideoFile = this.resolveVideoFile(params);
      
      const command = `SWITCH_VIDEO:${newVideoFile}\n`;
      
      // Write the command
      const writeResult = streamingProcess.process.stdin.write(command, 'utf8');
      
      if (!writeResult) {
        // Wait for drain if needed
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Timeout waiting for stdin drain')), 5000);
          
          streamingProcess.process.stdin!.once('drain', () => {
            clearTimeout(timeout);
            resolve();
          });
          
          streamingProcess.process.stdin!.once('error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });
      }
      
      // Update process information based on what was provided
      if (params.avatarId && params.state && params.expression) {
        streamingProcess.avatarId = params.avatarId;
        streamingProcess.state = params.state;
        streamingProcess.expression = params.expression;
        streamingProcess.videoFile = undefined; // Clear direct videoFile since we're using avatar params
      } else if (params.videoFile) {
        streamingProcess.videoFile = params.videoFile;
        streamingProcess.avatarId = undefined; // Clear avatar params since we're using direct videoFile
        streamingProcess.state = undefined;
        streamingProcess.expression = undefined;
      }
      streamingProcess.lastActivity = new Date();
      
      console.log(`✅ Video switch command sent: ${params.channel}`);
      return true;
      
    } catch (error) {
      console.error(`💥 Failed to switch video:`, error);
      throw error;
    }
  }

  async stopProcess(params: StopProcessParams): Promise<boolean> {
    // Resolve token and uid to ensure they're never undefined
    const resolvedToken = params.token || process.env.AGORA_APP_TOKEN;
    const resolvedUid = params.uid || 'user123';
    
    if (!resolvedToken) {
      throw new Error('AGORA_APP_TOKEN not found in environment and no token provided');
    }
    
    // Find process by channel, token, and uid
    const streamingProcess = this.findProcessByCredentials(params.channel, resolvedToken, resolvedUid);
    
    if (!streamingProcess) {
      throw new Error(`No process found for channel ${params.channel} with matching credentials`);
    }

    try {
      console.log(`🛑 Stopping stream: ${params.channel}`);
      streamingProcess.status = 'stopping';
      
      // Send graceful shutdown command
      if (streamingProcess.process.stdin?.writable) {
        streamingProcess.process.stdin.write('EXIT\n', 'utf8');
      }
      
      // Graceful shutdown timeout
      setTimeout(() => {
        if (streamingProcess.process && !streamingProcess.process.killed) {
          streamingProcess.process.kill('SIGTERM');
        }
      }, 5000);

      // Force kill timeout
      setTimeout(() => {
        if (streamingProcess.process && !streamingProcess.process.killed) {
          streamingProcess.process.kill('SIGKILL');
        }
      }, 10000);

      return true;
    } catch (error) {
      console.error(`💥 Failed to stop process:`, error);
      return false;
    }
  }

  private findProcessByCredentials(channel: string, token: string, uid: string): StreamingProcess | undefined {
    for (const process of this.processes.values()) {
      if (process.channel === channel && process.token === token && process.uid === uid) {
        return process;
      }
    }
    return undefined;
  }

  getProcess(processId: string): StreamingProcess | undefined {
    return this.processes.get(processId);
  }

  getAllProcesses(): StreamingProcess[] {
    return Array.from(this.processes.values());
  }

  getProcessByChannel(channel: string): StreamingProcess | undefined {
    for (const process of this.processes.values()) {
      if (process.channel === channel) {
        return process;
      }
    }
    return undefined;
  }

  // Get process data suitable for frontend (with obscured token)
  getProcessDataForFrontend(process: StreamingProcess) {
    return {
      id: process.id,
      avatarId: process.avatarId,
      state: process.state,
      expression: process.expression,
      videoFile: process.videoFile,
      channel: process.channel,
      token: this.obscureToken(process.token),
      uid: process.uid,
      status: process.status,
      createdAt: process.createdAt.toISOString(),
      lastActivity: process.lastActivity.toISOString(),
      pid: process.process.pid || 0,
      killed: process.process.killed,
      exitCode: process.process.exitCode,
      resolvedVideoFile: process.videoFile || (process.avatarId && process.state && process.expression ? 
        this.generateVideoFile(process.avatarId, process.state, process.expression) : null)
    };
  }

  async cleanup(): Promise<void> {
    const promises = Array.from(this.processes.values()).map(process => 
      this.stopProcess({ channel: process.channel, token: process.token, uid: process.uid })
    );
    await Promise.all(promises);
  }
}

// Singleton instance that survives hot reloads
export const processManager = (() => {
  if (!global.__AGORA_PROCESS_MANAGER_INSTANCE) {
    global.__AGORA_PROCESS_MANAGER_INSTANCE = new ProcessManager(
      './build/agora_streaming_controlled',
      '/home/ubuntu/agora_rtc_sdk/agora_sdk'
    );
  }
  return global.__AGORA_PROCESS_MANAGER_INSTANCE;
})();

// Cleanup on process exit
process.on('SIGINT', () => processManager.cleanup());
process.on('SIGTERM', () => processManager.cleanup());