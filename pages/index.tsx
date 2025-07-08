import { useState, useEffect } from 'react';

interface Process {
  id: string;
  channelId: string;
  currentVideoFile: string;
  status: string;
  createdAt: string;
  pid: number;
}

export default function Home() {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    token: '',
    channelId: 'testt',
    userId: '',
    videoFile: 'https://assets.trulience.com/assets/vba/bella/videos/idle_hairDown_fenc_hls/1080_3000_1/1080p_0.m3u8',
    fps: 30,
    localIP: ''
  });
  const [switchData, setSwitchData] = useState({
    channelId: '',
    videoFile: ''
  });

  const fetchProcesses = async () => {
    try {
      const response = await fetch('/api/streaming/status');
      const data = await response.json();
      if (data.success) {
        setProcesses(data.processes || []);
      }
    } catch (error) {
      console.error('Error fetching processes:', error);
    }
  };

  useEffect(() => {
    fetchProcesses();
    const interval = setInterval(fetchProcesses, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const startProcess = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/streaming/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await response.json();
      
      if (data.success) {
        alert('Process started successfully!');
        fetchProcesses();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert(`Error: ${error}`);
    }
    setLoading(false);
  };

  const switchVideo = async () => {
    if (!switchData.channelId || !switchData.videoFile) {
      alert('Please provide both Channel ID and Video File');
      return;
    }

    try {
      const response = await fetch('/api/streaming/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(switchData)
      });
      const data = await response.json();
      
      if (data.success) {
        alert('Video switch command sent successfully!');
        fetchProcesses();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert(`Error: ${error}`);
    }
  };

  const stopProcess = async (channelId: string) => {
    try {
      const response = await fetch('/api/streaming/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId })
      });
      const data = await response.json();
      
      if (data.success) {
        alert('Process stop command sent successfully!');
        fetchProcesses();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert(`Error: ${error}`);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Agora Video Streaming Controller</h1>
      
      {/* Start Process Form */}
      <div style={{ marginBottom: '30px', border: '1px solid #ddd', padding: '20px' }}>
        <h2>Start New Stream</h2>
        <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <input
            placeholder="Token"
            value={formData.token}
            onChange={(e) => setFormData({...formData, token: e.target.value})}
          />
          <input
            placeholder="Channel ID"
            value={formData.channelId}
            onChange={(e) => setFormData({...formData, channelId: e.target.value})}
          />
          <input
            placeholder="User ID (optional)"
            value={formData.userId}
            onChange={(e) => setFormData({...formData, userId: e.target.value})}
          />
          <input
            placeholder="FPS"
            type="number"
            value={formData.fps}
            onChange={(e) => setFormData({...formData, fps: parseInt(e.target.value) || 30})}
          />
          <input
            placeholder="Local IP (optional)"
            value={formData.localIP}
            onChange={(e) => setFormData({...formData, localIP: e.target.value})}
            style={{ gridColumn: '1 / -1' }}
          />
          <input
            placeholder="Video File (M3U8 URL or TS file)"
            value={formData.videoFile}
            onChange={(e) => setFormData({...formData, videoFile: e.target.value})}
            style={{ gridColumn: '1 / -1' }}
          />
        </div>
        <button 
          onClick={startProcess} 
          disabled={loading}
          style={{ marginTop: '10px', padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          {loading ? 'Starting...' : 'Start Stream'}
        </button>
      </div>

      {/* Switch Video Form */}
      <div style={{ marginBottom: '30px', border: '1px solid #ddd', padding: '20px' }}>
        <h2>Switch Video</h2>
        <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <input
            placeholder="Channel ID"
            value={switchData.channelId}
            onChange={(e) => setSwitchData({...switchData, channelId: e.target.value})}
          />
          <input
            placeholder="New Video File (M3U8 URL or TS file)"
            value={switchData.videoFile}
            onChange={(e) => setSwitchData({...switchData, videoFile: e.target.value})}
          />
        </div>
        <button 
          onClick={switchVideo}
          style={{ marginTop: '10px', padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          Switch Video
        </button>
      </div>

      {/* Running Processes */}
      <div>
        <h2>Running Processes ({processes.length})</h2>
        {processes.length === 0 ? (
          <p>No processes running</p>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {processes.map((process) => (
              <div key={process.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '5px' }}>
                <div><strong>Channel:</strong> {process.channelId}</div>
                <div><strong>Status:</strong> <span style={{ color: process.status === 'running' ? 'green' : 'orange' }}>{process.status}</span></div>
                <div><strong>Video:</strong> {process.currentVideoFile}</div>
                <div><strong>PID:</strong> {process.pid}</div>
                <div><strong>Started:</strong> {new Date(process.createdAt).toLocaleString()}</div>
                <button 
                  onClick={() => stopProcess(process.channelId)}
                  style={{ marginTop: '10px', padding: '5px 15px', backgroundColor: '#dc3545', color: 'white', border: 'none', cursor: 'pointer' }}
                >
                  Stop
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
