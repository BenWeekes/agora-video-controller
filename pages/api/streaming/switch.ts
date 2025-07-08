import { NextApiRequest, NextApiResponse } from 'next';
import { processManager, SwitchProcessParams } from '../../../lib/processManager';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { avatarId, state, expression, videoFile, channel, token, uid }: SwitchProcessParams = req.body;

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

    // Attempt to switch the video
    try {
      const success = await processManager.switchVideo({
        avatarId,
        state,
        expression,
        videoFile,
        channel,
        token: actualToken,
        uid: actualUid
      });
      
      if (success) {
        res.status(200).json({
          success: true,
          message: 'Video switch command sent successfully',
          channel,
          ...(hasAvatarParams ? { avatarId, state, expression } : { videoFile })
        });
      } else {
        res.status(500).json({ 
          error: 'Failed to send video switch command' 
        });
      }
    } catch (switchError) {
      console.error('Switch error:', switchError);
      res.status(500).json({ 
        error: 'Failed to switch video',
        details: switchError instanceof Error ? switchError.message : 'Unknown switch error'
      });
    }

  } catch (error) {
    console.error('💥 Unexpected error in switch API:', error);
    res.status(500).json({ 
      error: 'Failed to switch video',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}