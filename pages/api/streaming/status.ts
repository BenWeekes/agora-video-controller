import { NextApiRequest, NextApiResponse } from 'next';
import { processManager } from '../../../lib/processManager';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Get status of all processes
    try {
      const processes = processManager.getAllProcesses();
      
      // Convert processes to a format suitable for the frontend (with obscured tokens)
      const processData = processes.map(process => processManager.getProcessDataForFrontend(process));

      res.status(200).json({
        success: true,
        processes: processData,
        count: processData.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('💥 Error fetching process status:', error);
      res.status(500).json({ 
        error: 'Failed to fetch process status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } else if (req.method === 'POST') {
    // Get status of a specific process
    try {
      const { processId, channel } = req.body;

      if (!processId && !channel) {
        return res.status(400).json({ 
          error: 'Either processId or channel is required' 
        });
      }

      let process;
      if (processId) {
        process = processManager.getProcess(processId);
      } else {
        process = processManager.getProcessByChannel(channel);
      }

      if (!process) {
        return res.status(404).json({ 
          error: `No process found${processId ? ` for processId: ${processId}` : ` for channel: ${channel}`}` 
        });
      }

      const processData = processManager.getProcessDataForFrontend(process);

      res.status(200).json({
        success: true,
        process: processData
      });

    } catch (error) {
      console.error('💥 Error fetching specific process status:', error);
      res.status(500).json({ 
        error: 'Failed to fetch process status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}