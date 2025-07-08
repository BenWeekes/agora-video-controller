import { NextApiRequest, NextApiResponse } from 'next';
import { processManager, StartProcessParams } from '../../../lib/processManager';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { avatarId, state, expression, videoFile, channel, token, uid }: StartProcessParams = req.body;

    // Get token from environment if not provided or is placeholder
    const actualToken = (token === 'from_env' || !token) ? process.env.AGORA_APP_TOKEN : token;
    const actualUid = uid || 'user123';

    if (!actualToken) {
      return res.status(500).json({ 
        error: 'AGORA_APP_TOKEN not configured in environment' 
      });
    }

    // Validate required parameters
    if (!channel) {
      return res.status(400).json({ 
        error: 'Missing required parameter: channel' 
      });
    }

    // Validate that either videoFile OR complete avatar parameters are provided
    const hasAvatarParams = avatarId && state && expression;
    const hasVideoFile = videoFile;
    
    if (!hasAvatarParams && !hasVideoFile) {
      return res.status(400).json({ 
        error: 'Either videoFile OR complete avatarId/state/expression parameters must be provided' 
      });
    }

    // Check if there's already a process running for this channel
    const existingProcess = processManager.getProcessByChannel(channel);
    if (existingProcess && existingProcess.status === 'running') {
      return res.status(409).json({ 
        error: 'A process is already running for this channel',
        processId: existingProcess.id
      });
    }

    // Start the streaming process
    const processId = await processManager.startProcess({
      avatarId,
      state,
      expression,
      videoFile,
      channel,
      token: actualToken,
      uid: actualUid
    });

    res.status(200).json({
      success: true,
      processId,
      message: 'Streaming process started successfully',
      channel,
      ...(hasAvatarParams ? { avatarId, state, expression } : { videoFile })
    });

  } catch (error) {
    console.error('Error starting streaming process:', error);
    res.status(500).json({ 
      error: 'Failed to start streaming process',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}