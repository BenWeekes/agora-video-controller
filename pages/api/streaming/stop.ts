import { NextApiRequest, NextApiResponse } from 'next';
import { processManager } from '../../../lib/processManager';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { processId, channelId } = req.body;

    // Validate required parameters
    if (!processId && !channelId) {
      return res.status(400).json({ 
        error: 'Either processId or channelId is required' 
      });
    }

    let targetProcessId = processId;

    // If channelId is provided instead of processId, find the process
    if (!targetProcessId && channelId) {
      const process = processManager.getProcessByChannelId(channelId);
      if (!process) {
        return res.status(404).json({ 
          error: `No process found for channel: ${channelId}` 
        });
      }
      targetProcessId = process.id;
    }

    // Attempt to stop the process
    const success = await processManager.stopProcess(targetProcessId);

    if (success) {
      res.status(200).json({
        success: true,
        processId: targetProcessId,
        message: 'Process stop command sent successfully'
      });
    } else {
      res.status(404).json({ 
        error: `Process not found: ${targetProcessId}` 
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
