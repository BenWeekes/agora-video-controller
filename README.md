# Agora Video Streaming Controller

Dynamic video streaming with live switching capabilities for Agora RTC channels.

## 🖥️ Ubuntu 24.04 System Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential build tools
sudo apt install -y \
  build-essential \
  cmake \
  make \
  git \
  curl

# Install FFmpeg with H.264 support
sudo apt install -y \
  ffmpeg \
  libx264-dev

# Install Node.js (latest LTS)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
cmake --version
gcc --version
node --version
ffmpeg -version
```

## 📋 Prerequisites

- Ubuntu/Linux system
- Node.js 18+ and npm
- CMake and build tools
- Agora RTC SDK installed at `/home/ubuntu/agora_rtc_sdk/agora_sdk`
- Valid Agora App Token

## 🚀 Installation & Setup

```bash
# 1. Clone and enter directory
cd agora-video-controller

# 2. Install dependencies
npm install

# 3. Set environment variable
echo "AGORA_APP_TOKEN=your_agora_token_here" > .env.local

# 4. Build C++ streaming application
./build.sh

# 5. Start the web interface
npm run dev
```

**Access the web interface:** `http://localhost:3000`

## 🎮 Web Interface

The web interface provides:
- **Start Stream**: Launch new video streams to Agora channels
- **Switch Video**: Dynamically change video source during streaming
- **Monitor Streams**: View active streams and their status
- **Stop Streams**: Gracefully terminate streaming processes

## 🔌 API Endpoints

### Start Avatar Stream

**Using Avatar Parameters (Production):**
```bash
curl -X POST http://localhost:3000/api/streaming/start \
  -H "Content-Type: application/json" \
  -d '{
    "avatarId": "bella",
    "state": "idle",
    "expression": "happy",
    "channel": "test-channel",
    "token": "your_agora_token",
    "uid": "user123"
  }'
```

**Using Direct Video File (Testing):**
```bash
curl -X POST http://localhost:3000/api/streaming/start \
  -H "Content-Type: application/json" \
  -d '{
    "videoFile": "https://example.com/video.m3u8",
    "channel": "test-channel",
    "token": "your_agora_token",
    "uid": "user123"
  }'
```

### Switch Avatar Video

**Using Avatar Parameters:**
```bash
curl -X POST http://localhost:3000/api/streaming/switch \
  -H "Content-Type: application/json" \
  -d '{
    "avatarId": "bella",
    "state": "talking",
    "expression": "surprise",
    "channel": "test-channel",
    "token": "your_agora_token",
    "uid": "user123"
  }'
```

**Using Direct Video File:**
```bash
curl -X POST http://localhost:3000/api/streaming/switch \
  -H "Content-Type: application/json" \
  -d '{
    "videoFile": "/path/to/new/video.m3u8",
    "channel": "test-channel",
    "token": "your_agora_token",
    "uid": "user123"
  }'
```

### Get Status (All Streams)
```bash
curl http://localhost:3000/api/streaming/status
```

### Get Specific Stream Status
```bash
curl -X POST http://localhost:3000/api/streaming/status \
  -H "Content-Type: application/json" \
  -d '{"channel": "test-channel"}'
```

### Stop Stream
```bash
curl -X POST http://localhost:3000/api/streaming/stop \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "test-channel",
    "token": "your_agora_token",
    "uid": "user123"
  }'
```

## 📁 Avatar Video Structure

**Valid States:** `idle`, `listening`, `talking`
**Valid Expressions:** `happy`, `sad`, `angry`, `surprise`, `fear`

**Example:**
- `avatarId`: "bella"
- `state`: "idle" 
- `expression`: "happy"
- **Generated URL**: `https://assets.trulience.com/assets/vba/bella/videos/idle_happy_hls/1080_3000_1/1080p_0.m3u8`

**Direct Video Files** (for testing):
- Any M3U8 playlist URL
- Local file paths
- Custom video sources

## 🛠️ Troubleshooting

**Build issues:**
```bash
# Check dependencies
cmake --version
make --version

# Rebuild
./build.sh -d  # Debug mode
```

**Runtime issues:**
```bash
# Check environment
echo $AGORA_APP_TOKEN
export LD_LIBRARY_PATH="/home/ubuntu/agora_rtc_sdk/agora_sdk"

# Test executable
./build/agora_streaming_controlled --help
```

**Port conflicts:**
```bash
# Use different port
npm run dev -- -p 3001
```

## 📝 Notes

- Token authentication is handled server-side for security
- Streams automatically loop when reaching end of content
- Video switching happens at segment boundaries for smooth transitions
- Process registry survives Next.js hot reloads during development
