# Agora Video Streaming Controller

A self-contained Next.js application that provides web-based control over Agora video streaming with dynamic M3U8 video switching capabilities. Everything runs within a single project directory, referencing only your existing Agora SDK installation.

## ✨ Features

- **🎥 Dynamic Video Switching** - Switch between M3U8 playlists without stopping the stream
- **⚡ Real-time Control** - Web interface with instant command processing
- **📦 Self-Contained** - No modifications to existing Agora SDK projects
- **🔄 Seamless Transitions** - Background preloading for smooth video switches  
- **🌐 Web Interface** - User-friendly control panel
- **🔌 REST API** - Full programmatic control
- **💾 Smart Caching** - Automatic M3U8 segment caching

## 🏗️ Architecture

```
┌─────────────────┐    HTTP API    ┌─────────────────┐    stdin    ┌─────────────────┐
│   Web Browser   │ ◄────────────► │   Next.js API   │ ◄─────────► │  C++ Streaming  │
│                 │                │   (Node.js)     │             │   Application   │
└─────────────────┘                └─────────────────┘             └─────────────────┘
                                           │                               │
                                           │                               │
                                    ┌─────────────────┐             ┌─────────────────┐
                                    │ Process Manager │             │   Agora SDK     │
                                    │                 │             │                 │
                                    └─────────────────┘             └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** and npm
- **CMake 3.10+** and build tools
- **Existing Agora SDK** at `/home/ubuntu/agora_rtc_sdk/agora_sdk`
- **curl** for M3U8 downloads

### One-Command Setup

```bash
# Create project and install everything
mkdir agora-video-controller && cd agora-video-controller

# Copy all provided files, then:
npm run setup
```

### Manual Setup

```bash
# 1. Create directory and install dependencies
mkdir agora-video-controller && cd agora-video-controller
npm init -y
npm install next@14.0.0 react@^18 react-dom@^18 typescript@^5 @types/node@^20 @types/react@^18 @types/react-dom@^18

# 2. Copy all provided files to the project directory

# 3. Build the C++ application
chmod +x build.sh validate-setup.sh
./build.sh

# 4. Validate setup
./validate-setup.sh

# 5. Start the development server
npm run dev
```

## 📋 File Checklist

Ensure you have all these files in your `agora-video-controller` directory:

### Core Application
- ✅ `agora_streaming_controlled.cpp` - Self-contained C++ streaming app
- ✅ `CMakeLists.txt` - Build configuration
- ✅ `build.sh` - Build script

### Next.js Application  
- ✅ `package.json` - Project configuration
- ✅ `next.config.js` - Next.js configuration
- ✅ `tsconfig.json` - TypeScript configuration
- ✅ `lib/processManager.ts` - Process management
- ✅ `pages/index.tsx` - Web interface
- ✅ `pages/api/streaming/start.ts` - Start stream API
- ✅ `pages/api/streaming/switch.ts` - Switch video API
- ✅ `pages/api/streaming/stop.ts` - Stop stream API
- ✅ `pages/api/streaming/status.ts` - Status API

### Utilities
- ✅ `validate-setup.sh` - Setup validation script
- ✅ `README.md` - This file

## 🎮 Usage

### Web Interface

1. **Start the server:**
   ```bash
   npm run dev
   ```

2. **Open browser:** `http://localhost:3000`

3. **Start a stream:**
   - Token: Your Agora token
   - Channel ID: Target channel
   - Video File: M3U8 URL or local TS file
   - Click "Start Stream"

4. **Switch videos:**
   - Enter new M3U8 URL
   - Click "Switch Video"
   - Switch happens when current segment ends

### API Examples

**Start Stream:**
```bash
curl -X POST http://localhost:3000/api/streaming/start \
  -H "Content-Type: application/json" \
  -d '{
    "token": "your_token",
    "channelId": "your_channel", 
    "videoFile": "https://example.com/video.m3u8"
  }'
```

**Switch Video:**
```bash
curl -X POST http://localhost:3000/api/streaming/switch \
  -H "Content-Type: application/json" \
  -d '{
    "channelId": "your_channel",
    "videoFile": "https://example.com/new_video.m3u8"
  }'
```

**Get Status:**
```bash
curl http://localhost:3000/api/streaming/status?channelId=your_channel
```

### Direct C++ Control

```bash
# Set library path
export LD_LIBRARY_PATH=/home/ubuntu/agora_rtc_sdk/agora_sdk

# Run directly
./build/agora_streaming_controlled \
  --token your_token \
  --channelId your_channel \
  --videoFile https://example.com/video.m3u8

# Send commands via stdin:
# SWITCH_VIDEO:https://example.com/new_video.m3u8
# EXIT
```

## 🛠️ Available Scripts

```bash
npm run dev              # Start development server
npm run build           # Build Next.js for production
npm run start           # Start production server
npm run build-cpp       # Build C++ application
npm run build-cpp-debug # Build C++ in debug mode
npm run validate        # Validate setup
npm run setup           # Complete setup (install + build + validate)
npm run clean           # Clean all build artifacts
```

## 🔧 Configuration

### Agora SDK Path

Update the library path in these files if your SDK is elsewhere:

**CMakeLists.txt:**
```cmake
set(AGORA_SDK_PATH "/your/agora/sdk/path")
```

**build.sh:**
```bash
AGORA_SDK_PATH="/your/agora/sdk/path"
```

**validate-setup.sh:**
```bash
AGORA_SDK_PATH="/your/agora/sdk/path"
```

### Cache Directory

Default: `/home/ubuntu/tscache`

Update in `agora_streaming_controlled.cpp`:
```cpp
#define CACHE_BASE_PATH "/your/cache/path"
```

## 🐛 Troubleshooting

### Validation Issues

```bash
# Run the validation script
./validate-setup.sh
```

### Build Issues

```bash
# Clean and rebuild
npm run clean
npm run setup
```

### Common Problems

1. **"Library not found"**
   ```bash
   export LD_LIBRARY_PATH=/home/ubuntu/agora_rtc_sdk/agora_sdk
   ```

2. **"Permission denied"**
   ```bash
   chmod +x build.sh validate-setup.sh
   ```

3. **"Process fails to start"**
   - Check Agora SDK path in CMakeLists.txt
   - Verify token and credentials
   - Check network connectivity

4. **"No video switching"**
   - Ensure M3U8 URLs are accessible
   - Check cache directory permissions
   - Verify curl is installed

### Debug Mode

```bash
# Build in debug mode
npm run build-cpp-debug

# Check logs in web interface or console
```

## 📚 How It Works

### Video Switching Process

1. **Command Received** → API receives switch request
2. **Background Download** → New M3U8 and segments cached
3. **Preload Ready** → New playlist prepared for switching
4. **Segment End** → Current segment finishes naturally
5. **Instant Switch** → Immediately start new playlist
6. **Seamless Stream** → No interruption to viewers

### Process Management

- Each stream runs in isolated C++ process
- Process manager handles lifecycle and communication
- Commands sent via stdin, responses via stdout/stderr
- Automatic cleanup on shutdown

## 🔒 Security Notes

- **Development setup** - Add authentication for production
- **Input validation** - Validate all URLs and parameters
- **Process isolation** - Consider containerization for production
- **Network security** - Use HTTPS and secure tokens

## 📄 License

MIT License - Feel free to use and modify as needed.

## 🤝 Support

For issues:
1. Run `./validate-setup.sh` to check configuration
2. Check logs in web interface console
3. Test C++ application directly
4. Verify Agora SDK installation and credentials
