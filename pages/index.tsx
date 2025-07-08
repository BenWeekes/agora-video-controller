import { useState, useEffect } from 'react';

interface Process {
  id: string;
  avatarId?: string;
  state?: string;
  expression?: string;
  videoFile?: string;
  channel: string;
  token: string; // This will be obscured from the backend
  uid: string;
  status: string;
  createdAt: string;
  lastActivity: string;
  pid: number;
  resolvedVideoFile?: string;
}

export default function Home() {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading] = useState(false);
  const [switchLoading, setSwitchLoading] = useState<string | null>(null);
  const [stopLoading, setStopLoading] = useState<string | null>(null);
  
  const [startData, setStartData] = useState({
    videoFile: 'https://assets.trulience.com/assets/vba/bella/videos/idle_hairDown_fenc_hls/1080_3000_1/1080p_0.m3u8',
    channel: 'testt'
  });
  
  const [switchData, setSwitchData] = useState({
    videoFile: '/home/ubuntu/tscache/vba/bella/videos/idle_hairUp_hls/webrtc_segment.m3u8',
    channel: 'testt'
  });
  
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

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
    const interval = setInterval(fetchProcesses, 5000);
    return () => clearInterval(interval);
  }, []);

  const startProcess = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/streaming/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoFile: startData.videoFile,
          channel: startData.channel,
          token: 'from_env', // Backend will use token from .env.local
          uid: 'user123'
        })
      });
      const data = await response.json();
      
      if (data.success) {
        showNotification('success', 'Stream started successfully!');
        fetchProcesses();
      } else {
        showNotification('error', data.error || 'Failed to start stream');
      }
    } catch (error) {
      showNotification('error', `Network error: ${error}`);
    }
    setLoading(false);
  };

  const switchVideo = async () => {
    setSwitchLoading(switchData.channel);
    try {
      const response = await fetch('/api/streaming/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoFile: switchData.videoFile,
          channel: switchData.channel,
          token: 'from_env', // Backend will use token from .env.local
          uid: 'user123'
        })
      });
      const data = await response.json();
      
      if (data.success) {
        showNotification('success', 'Video switched successfully!');
        fetchProcesses();
      } else {
        showNotification('error', data.error || 'Failed to switch video');
      }
    } catch (error) {
      showNotification('error', `Network error: ${error}`);
    }
    setSwitchLoading(null);
  };

  const stopProcess = async (channel: string) => {
    setStopLoading(channel);
    try {
      const response = await fetch('/api/streaming/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          channel, 
          token: 'from_env', // Backend will use token from .env.local
          uid: 'user123' 
        })
      });
      const data = await response.json();
      
      if (data.success) {
        showNotification('success', 'Stream stopped successfully!');
        fetchProcesses();
      } else {
        showNotification('error', data.error || 'Failed to stop stream');
      }
    } catch (error) {
      showNotification('error', `Network error: ${error}`);
    }
    setStopLoading(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return '#10b981';
      case 'starting': return '#f59e0b';
      case 'stopping': return '#f97316';
      default: return '#ef4444';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return '●';
      case 'starting': return '◐';
      case 'stopping': return '◑';
      default: return '○';
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1f2937 0%, #1e3a8a 50%, #581c87 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.2)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <div style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold'
          }}>
            A
          </div>
          <div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: 'bold',
              color: 'white',
              margin: 0
            }}>
              Agora Video Streaming Controller
            </h1>
            <p style={{
              color: '#d1d5db',
              margin: '4px 0 0 0',
              fontSize: '14px'
            }}>
              Simple video streaming with live switching capabilities
            </p>
          </div>
        </div>
      </div>

      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '32px 24px'
      }}>
        {/* Notification */}
        {notification && (
          <div style={{
            marginBottom: '24px',
            padding: '16px',
            borderRadius: '8px',
            border: `1px solid ${notification.type === 'success' ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)'}`,
            background: notification.type === 'success' ? 'rgba(6, 78, 59, 0.5)' : 'rgba(127, 29, 29, 0.5)',
            color: notification.type === 'success' ? '#dcfce7' : '#fecaca',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>{notification.type === 'success' ? '✅' : '❌'}</span>
            {notification.message}
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: '32px',
          marginBottom: '32px'
        }}>
          {/* Start Stream Panel */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '24px'
          }}>
            <h2 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: 'white',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ color: '#10b981' }}>▶</span>
              Start Video Stream
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#d1d5db',
                  marginBottom: '8px'
                }}>
                  Video File URL
                </label>
                <input
                  type="text"
                  placeholder="https://example.com/video.m3u8 or /path/to/video.ts"
                  value={startData.videoFile}
                  onChange={(e) => setStartData({...startData, videoFile: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>
              
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#d1d5db',
                  marginBottom: '8px'
                }}>
                  Channel
                </label>
                <input
                  type="text"
                  placeholder="testt"
                  value={startData.channel}
                  onChange={(e) => setStartData({...startData, channel: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>
              
              <button 
                onClick={startProcess} 
                disabled={loading}
                style={{
                  width: '100%',
                  background: loading ? 'linear-gradient(135deg, #6b7280, #6b7280)' : 'linear-gradient(135deg, #2563eb, #8b5cf6)',
                  color: 'white',
                  fontWeight: '500',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '14px'
                }}
              >
                {loading ? (
                  <>
                    <div style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      borderTop: '2px solid white',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }}></div>
                    Starting Stream...
                  </>
                ) : (
                  <>
                    <span>▶</span>
                    Start Stream
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Switch Video Panel */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '24px'
          }}>
            <h2 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: 'white',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ color: '#f97316' }}>🔄</span>
              Switch Video
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#d1d5db',
                  marginBottom: '8px'
                }}>
                  New Video File URL
                </label>
                <input
                  type="text"
                  placeholder="/path/to/new/video.m3u8"
                  value={switchData.videoFile}
                  onChange={(e) => setSwitchData({...switchData, videoFile: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>
              
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#d1d5db',
                  marginBottom: '8px'
                }}>
                  Channel
                </label>
                <input
                  type="text"
                  placeholder="testt"
                  value={switchData.channel}
                  onChange={(e) => setSwitchData({...switchData, channel: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>
              
              <button 
                onClick={switchVideo}
                disabled={!!switchLoading}
                style={{
                  width: '100%',
                  background: switchLoading ? 'linear-gradient(135deg, #6b7280, #6b7280)' : 'linear-gradient(135deg, #ea580c, #dc2626)',
                  color: 'white',
                  fontWeight: '500',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: switchLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '14px'
                }}
              >
                {switchLoading ? (
                  <>
                    <div style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      borderTop: '2px solid white',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }}></div>
                    Switching Avatar...
                  </>
                ) : (
                  <>
                    <span>🔄</span>
                    Switch Video
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Running Processes */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '24px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px'
          }}>
            <h2 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: 'white',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ color: '#8b5cf6' }}>📊</span>
              Active Video Streams
            </h2>
            <span style={{
              fontSize: '14px',
              background: 'rgba(139, 92, 246, 0.3)',
              padding: '4px 12px',
              borderRadius: '20px',
              color: 'white'
            }}>
              {processes.length} running
            </span>
          </div>
          
          {processes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ fontSize: '60px', marginBottom: '16px' }}>📺</div>
              <p style={{ color: '#9ca3af', fontSize: '18px', margin: '0 0 8px 0' }}>No active video streams</p>
              <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>Start a new video stream to see it here</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {processes.map((process) => (
                <div key={process.id} style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '16px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                        <span style={{
                          fontSize: '18px',
                          color: getStatusColor(process.status)
                        }}>
                          {getStatusIcon(process.status)}
                        </span>
                        <h3 style={{ color: 'white', fontWeight: '500', margin: 0 }}>
                          {process.avatarId ? `${process.avatarId} - ${process.state} (${process.expression})` : `Video Stream - ${process.channel}`}
                        </h3>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          color: getStatusColor(process.status),
                          background: `${getStatusColor(process.status)}20`
                        }}>
                          {process.status}
                        </span>
                      </div>
                      
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '8px',
                        fontSize: '14px',
                        color: '#d1d5db',
                        marginBottom: '12px'
                      }}>
                        <div><span style={{ color: '#9ca3af' }}>Channel:</span> {process.channel}</div>
                        <div><span style={{ color: '#9ca3af' }}>UID:</span> user123</div>
                        <div><span style={{ color: '#9ca3af' }}>Token:</span> ***</div>
                        <div><span style={{ color: '#9ca3af' }}>PID:</span> {process.pid}</div>
                        <div><span style={{ color: '#9ca3af' }}>Started:</span> {new Date(process.createdAt).toLocaleString()}</div>
                      </div>
                      
                      <div>
                        <span style={{ color: '#9ca3af', fontSize: '14px' }}>Video Source:</span>
                        <p style={{
                          color: 'white',
                          fontSize: '12px',
                          margin: '4px 0 0 0',
                          wordBreak: 'break-all',
                          background: 'rgba(0, 0, 0, 0.3)',
                          padding: '8px',
                          borderRadius: '4px',
                          fontFamily: 'monospace'
                        }}>
                          {process.resolvedVideoFile || process.videoFile || 'Unknown video source'}
                        </p>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => stopProcess(process.channel)}
                      disabled={stopLoading === process.channel}
                      style={{
                        marginLeft: '16px',
                        background: stopLoading === process.channel ? 'rgba(107, 114, 128, 0.3)' : 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid rgba(239, 68, 68, 0.5)',
                        color: stopLoading === process.channel ? '#9ca3af' : '#f87171',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        cursor: stopLoading === process.channel ? 'not-allowed' : 'pointer',
                        transition: 'background-color 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '14px'
                      }}
                    >
                      {stopLoading === process.channel ? (
                        <>
                          <div style={{
                            width: '14px',
                            height: '14px',
                            border: '2px solid rgba(255, 255, 255, 0.3)',
                            borderTop: '2px solid white',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                          }}></div>
                          Stopping...
                        </>
                      ) : (
                        <>
                          <span>⏹</span>
                          Stop
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CSS Animation */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}