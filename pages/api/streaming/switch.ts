import { NextApiRequest, NextApiResponse } from 'next';
import { processManager } from '../../../lib/processManager';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { processId, channelId, videoFile } = req.body;

    // Validate required parameters
    if (!videoFile || (!processId && !channelId)) {
      return res.status(400).json({ 
        error: 'Missing required parameters: videoFile and either processId or channelId are required' 
      });
    }

    let targetProcessId = processId;

    // If channelId is provided instead of processId, find the process
    if (!targetProcessId && channelId) {
      const process = processManager.getProcessByChannelId(channelId);
      if (!process) {
        return res.status(404).json({ 
          error: `No running process found for channel: ${channelId}` 
        });
      }
      targetProcessId = process.id;
    }

    // Attempt to switch the video
    const success = await processManager.switchVideo(targetProcessId, videoFile);

    if (success) {
      const process = processManager.getProcess(targetProcessId);
      res.status(200).json({
        success: true,
        processId: targetProcessId,
        newVideoFile: videoFile,
        currentVideoFile: process?.currentVideoFile,
        message: 'Video switch command sent successfully'
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to send video switch command' 
      });
    }

  } catch (error) {
    console.error('Error switching video:', error);
    res.status(500).json({ 
      error: 'Failed to switch video',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
