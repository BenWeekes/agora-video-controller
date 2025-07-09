# WebRTC HLS Converter

A Python tool that converts MP4 videos or existing M3U8 playlists to WebRTC-compliant HLS segments optimized for real-time streaming.

## Features

- Converts MP4/MOV/AVI/MKV videos to WebRTC-optimized HLS
- Processes existing M3U8 playlists and re-encodes for WebRTC compatibility
- Custom resolution scaling with aspect ratio preservation
- Configurable bitrate and segment length
- Video-only output (no audio) for optimal WebRTC performance
- Baseline H.264 profile for maximum compatibility
- Constant bitrate encoding for smooth playback
- Independent segments with keyframes every segment

## Requirements

- Python 3.6+
- FFmpeg with libx264 support
- FFprobe (usually included with FFmpeg)

## Usage

### Basic Syntax
```bash
python3 webrtc_converter.py INPUT_FILE --bitrate BITRATE --output OUTPUT_DIR [OPTIONS]
```

### Required Parameters
- `INPUT_FILE`: Path to input MP4 or M3U8 file
- `--bitrate` (`-b`): Output bitrate in kbps (e.g., 1500)
- `--output` (`-o`): Output directory (will be created if it doesn't exist)

### Optional Parameters
- `--width` (`-w`): Output width in pixels
- `--height`: Output height in pixels  
- `--segment-length` (`-s`): Segment length in seconds (default: 2)

## Examples

### Basic Conversion
Convert MP4 to WebRTC HLS with original dimensions:
```bash
python3 webrtc_converter.py video.mp4 --bitrate 800 --output ./output
```

### Custom Resolution (Main Example)
Convert with specific dimensions:
```bash
python3 webrtc_converter.py bella.mp4 --bitrate 1500 --width 1280 --height 720 --output /home/ubuntu/tscache/vba/bella/videos/test --segment-length 2
```

### Convert Existing HLS to WebRTC-Safe
Re-encode existing M3U8 playlist for WebRTC compatibility:
```bash
python3 webrtc_converter.py /home/ubuntu/tscache/vba/bella/videos/idle_hairDown_fenc_hls/1080_3000_1/1080p_0.m3u8 --bitrate 1500 --width 1280 --height 720 --output /home/ubuntu/tscache/vba/bella/videos/webrtc/idle_hairDown_fenc_hls/720p/ --segment-length 2
```

### Aspect Ratio Preservation
Scale to specific width, auto-calculate height:
```bash
python3 webrtc_converter.py video.mp4 --bitrate 1000 --width 1920 --output ./hd_output
```

### Process Existing HLS
Re-encode existing M3U8 for WebRTC compatibility with original resolution:
```bash
python3 webrtc_converter.py playlist.m3u8 --bitrate 600 --output ./webrtc_output
```

## Output

The converter creates:
- `index.m3u8`: Main HLS playlist file
- `index_000.ts`, `index_001.ts`, etc.: Video segment files
- Analysis output showing segment information and codec verification

### Example Output Structure
```
/output/directory/
├── index.m3u8
├── index_000.ts
├── index_001.ts
├── index_002.ts
└── ...
```

## WebRTC Optimizations Applied

- **Baseline Profile**: Maximum compatibility across devices
- **Level 3.1**: Widely supported level
- **No B-frames**: P-frames only for reduced latency
- **Single Reference Frame**: Minimizes decoding complexity
- **Constant Bitrate**: Smooth network utilization
- **Independent Segments**: Each segment starts with keyframe
- **2-second Segments**: Optimal balance of latency and efficiency
- **Video-only Output**: No audio processing for simplicity

## Typical Processing Time

Processing time varies based on:
- Input video length and resolution
- Output resolution and bitrate
- System performance

**Rule of thumb**: 3-6x real-time processing
- 1-minute video: ~3-6 minutes to process
- 5-minute video: ~15-30 minutes to process

## Performance Tips

1. **Choose appropriate bitrate**: 
   - 720p: 1000-1500 kbps
   - 1080p: 2000-3000 kbps
   - 480p: 500-800 kbps

2. **Segment length**: 2 seconds is optimal for most use cases

3. **Resolution**: Match your target streaming resolution to avoid unnecessary scaling

## License

This tool is provided as-is for WebRTC HLS conversion purposes.