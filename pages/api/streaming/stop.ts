import { NextApiRequest, NextApiResponse } from 'next';
import { processManager, StopProcessParams } from '../../../lib/processManager';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { channel, token, uid }: StopProcessParams = req.body;

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

    // Attempt to stop the process
    const success = await processManager.stopProcess({
      channel,
      token: actualToken,
      uid: actualUid
    });

    if (success) {
      res.status(200).json({
        success: true,
        message: 'Process stop command sent successfully',
        channel
      });
    } else {
      res.status(404).json({ 
        error: `No process found for channel ${channel} with matching credentials` 
      });
    }

  } catch (error) {
    console.error('Error stopping process:', error);
    res.status(500).json({ 
      error: 'Failed to stop process',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}