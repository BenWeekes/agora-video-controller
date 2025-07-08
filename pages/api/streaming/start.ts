import { NextApiRequest, NextApiResponse } from 'next';
import { processManager, StartProcessParams } from '../../../lib/processManager';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token, channelId, userId, videoFile, fps, localIP }: StartProcessParams = req.body;

    // Validate required parameters
    if (!token || !channelId || !videoFile) {
      return res.status(400).json({ 
        error: 'Missing required parameters: token, channelId, and videoFile are required' 
      });
    }

    // Check if there's already a process running for this channel
    const existingProcess = processManager.getProcessByChannelId(channelId);
    if (existingProcess && existingProcess.status === 'running') {
      return res.status(409).json({ 
        error: 'A process is already running for this channel',
        processId: existingProcess.id
      });
    }

    // Start the streaming process
    const processId = await processManager.startProcess({
      token,
      channelId,
      userId,
      videoFile,
      fps,
      localIP
    });

    res.status(200).json({
      success: true,
      processId,
      message: 'Streaming process started successfully'
    });

  } catch (error) {
    console.error('Error starting streaming process:', error);
    res.status(500).json({ 
      error: 'Failed to start streaming process',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
