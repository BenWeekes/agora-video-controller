#!/usr/bin/env python3
"""
Universal WebRTC HLS Converter
Converts MP4 or M3U8 files to WebRTC-compliant HLS segments

Usage:
    python3 webrtc_converter.py input.mp4 --bitrate 400 --output /path/to/output
    python3 webrtc_converter.py playlist.m3u8 --bitrate 800 --output ./webrtc_hls
    python3 webrtc_converter.py bella.mp4 --bitrate 1500 --width 1280 --height 720 --output /home/ubuntu/tscache/vba/bella/videos/test --segment-length 2
"""

import os
import sys
import argparse
import subprocess
import math
import shutil
from pathlib import Path

class WebRTCConverter:
    def __init__(self, input_file, bitrate_kbps, output_dir, segment_length=2, width=None, height=None):
        self.input_file = input_file
        self.bitrate_kbps = bitrate_kbps
        self.output_dir = output_dir
        self.segment_length = segment_length
        self.width = width
        self.height = height
        self.temp_file = None
        
    def detect_input_type(self):
        """Detect if input is MP4, M3U8, or other format"""
        if not os.path.exists(self.input_file):
            raise FileNotFoundError(f"Input file not found: {self.input_file}")
            
        ext = Path(self.input_file).suffix.lower()
        
        if ext == '.m3u8':
            return 'hls'
        elif ext in ['.mp4', '.mov', '.avi', '.mkv', '.ts']:
            return 'video'
        else:
            # Try to detect by content
            try:
                result = subprocess.run([
                    'ffprobe', '-v', 'quiet', '-show_format', self.input_file
                ], capture_output=True, text=True, check=True)
                
                if 'format_name=hls' in result.stdout or 'format_name=mpegts' in result.stdout:
                    return 'video'
                else:
                    return 'video'  # Default to video
            except:
                raise ValueError(f"Cannot determine file type: {self.input_file}")
    
    def create_output_directory(self):
        """Create output directory if it doesn't exist"""
        try:
            os.makedirs(self.output_dir, exist_ok=True)
            print(f"✓ Output directory: {self.output_dir}")
        except Exception as e:
            raise RuntimeError(f"Cannot create output directory {self.output_dir}: {e}")
    
    def get_video_info(self, video_file):
        """Get video duration and other properties"""
        try:
            probe_cmd = [
                'ffprobe', '-v', 'quiet',
                '-show_format', '-show_streams',
                '-of', 'default=noprint_wrappers=1',
                video_file
            ]
            result = subprocess.run(probe_cmd, capture_output=True, text=True, check=True)
            
            duration = None
            width = None
            height = None
            fps = None
            
            for line in result.stdout.split('\n'):
                if line.startswith('duration='):
                    duration = float(line.split('=')[1])
                elif line.startswith('width='):
                    width = int(line.split('=')[1])
                elif line.startswith('height='):
                    height = int(line.split('=')[1])
                elif line.startswith('r_frame_rate='):
                    fps_str = line.split('=')[1]
                    if '/' in fps_str:
                        num, den = fps_str.split('/')
                        fps = float(num) / float(den)
                    else:
                        fps = float(fps_str)
            
            return {
                'duration': duration,
                'width': width,
                'height': height,
                'fps': fps or 30.0  # Default to 30fps
            }
        except Exception as e:
            print(f"Warning: Could not get video info: {e}")
            return {'duration': None, 'width': None, 'height': None, 'fps': 30.0}
    
    def parse_m3u8_segments(self):
        """Parse M3U8 file and get segment list"""
        segments = []
        base_dir = Path(self.input_file).parent
        
        with open(self.input_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    # Handle relative paths
                    if not line.startswith('/') and not line.startswith('http'):
                        segment_path = base_dir / line
                    else:
                        segment_path = Path(line)
                    segments.append(str(segment_path))
        
        return segments
    
    def concatenate_hls_segments(self, segments):
        """Concatenate HLS segments into single file"""
        self.temp_file = os.path.join(self.output_dir, 'temp_concatenated.ts')
        
        # Create concat file
        concat_file = os.path.join(self.output_dir, 'temp_concat_list.txt')
        with open(concat_file, 'w') as f:
            for segment in segments:
                if os.path.exists(segment):
                    f.write(f"file '{segment}'\n")
                else:
                    print(f"Warning: Segment not found: {segment}")
        
        # Concatenate
        concat_cmd = [
            'ffmpeg', '-y',
            '-f', 'concat', '-safe', '0',
            '-i', concat_file,
            '-c', 'copy',
            self.temp_file
        ]
        
        print("Concatenating HLS segments...")
        try:
            subprocess.run(concat_cmd, capture_output=True, text=True, check=True)
            print("✓ Segments concatenated successfully")
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"Failed to concatenate segments: {e.stderr}")
        finally:
            if os.path.exists(concat_file):
                os.remove(concat_file)
        
        return self.temp_file
    
    def convert_to_webrtc_hls(self, input_video):
        """Convert video to WebRTC-compliant HLS"""
        
        # Get video info
        video_info = self.get_video_info(input_video)
        duration = video_info['duration']
        fps = video_info['fps']
        
        # Determine output dimensions
        output_width = self.width if self.width else video_info['width']
        output_height = self.height if self.height else video_info['height']
        
        print(f"Input video: {video_info['width']}x{video_info['height']}, "
              f"{fps:.1f}fps, {duration:.1f}s")
        
        if self.width or self.height:
            print(f"Output video: {output_width}x{output_height} (custom dimensions)")
        else:
            print(f"Output video: {output_width}x{output_height} (original dimensions)")
        
        # Calculate GOP size (keyframe every segment_length seconds)
        gop_size = int(fps * self.segment_length)
        
        # Output files
        output_prefix = os.path.join(self.output_dir, 'index')
        m3u8_file = f"{output_prefix}.m3u8"
        
        # FFmpeg command for WebRTC-optimized HLS
        ffmpeg_cmd = [
            'ffmpeg', '-y',
            '-i', input_video,
            
            # Video codec settings - WebRTC optimized
            '-c:v', 'libx264',
            '-profile:v', 'baseline',      # Maximum compatibility
            '-level', '3.1',               # Widely supported level
            '-preset', 'fast',             # Good speed/quality balance
            '-tune', 'zerolatency',        # Minimize latency
        ]
        
        # Add scaling filter if custom dimensions are specified
        if self.width or self.height:
            if self.width and self.height:
                # Both width and height specified
                scale_filter = f'scale={self.width}:{self.height}'
            elif self.width:
                # Only width specified, maintain aspect ratio
                scale_filter = f'scale={self.width}:-2'
            else:
                # Only height specified, maintain aspect ratio
                scale_filter = f'scale=-2:{self.height}'
            
            ffmpeg_cmd.extend(['-vf', scale_filter])
        
        # Continue with encoding settings
        ffmpeg_cmd.extend([
            # Bitrate control (constant for smooth playback)
            '-b:v', f'{self.bitrate_kbps}k',
            '-minrate', f'{self.bitrate_kbps}k',
            '-maxrate', f'{self.bitrate_kbps}k',
            '-bufsize', f'{self.bitrate_kbps * 2}k',
            
            # GOP structure optimized for segments
            '-g', str(gop_size),           # Keyframe every segment
            '-keyint_min', str(gop_size),  # Minimum keyframe interval
            '-sc_threshold', '0',          # Disable scene cut detection
            '-force_key_frames', f'expr:gte(t,n_forced*{self.segment_length})',
            
            # WebRTC compatibility settings
            '-bf', '0',                    # No B-frames
            '-refs', '1',                  # Single reference frame
            '-coder', '0',                 # CAVLC (not CABAC)
            '-fast-pskip', '1',            # Fast skip decisions
            
            # Disable audio output
            '-an',
            
            # HLS segmentation
            '-f', 'hls',
            '-hls_time', str(self.segment_length),
            '-hls_playlist_type', 'vod',
            '-hls_segment_filename', f'{output_prefix}_%03d.ts',
            '-hls_flags', 'independent_segments',
            
            # Output M3U8
            m3u8_file
        ])
        
        print(f"Converting to WebRTC-compliant HLS ({self.bitrate_kbps}kbps)...")
        print("This may take a few minutes...")
        
        # Debug: print the full command
        print("\nDebug - FFmpeg command:")
        print(" ".join(ffmpeg_cmd))
        print()
        
        try:
            result = subprocess.run(ffmpeg_cmd, 
                                  capture_output=True, 
                                  text=True, 
                                  check=True)
            print("✓ Conversion successful!")
            return m3u8_file
            
        except subprocess.CalledProcessError as e:
            print("✗ Conversion failed!")
            print("Error output:")
            print(e.stderr)
            raise RuntimeError("FFmpeg conversion failed")
    
    def analyze_output(self, m3u8_file):
        """Analyze the generated HLS output"""
        if not os.path.exists(m3u8_file):
            print("No M3U8 file found for analysis")
            return
        
        print(f"\n=== Output Analysis ===")
        
        # Read M3U8 content
        with open(m3u8_file, 'r') as f:
            m3u8_content = f.read()
        
        print("M3U8 Content:")
        print("-" * 50)
        print(m3u8_content)
        print("-" * 50)
        
        # Parse segments
        segments = []
        for line in m3u8_content.split('\n'):
            line = line.strip()
            if line and not line.startswith('#'):
                segment_path = os.path.join(self.output_dir, line)
                segments.append(segment_path)
        
        print(f"\nSegment Analysis ({len(segments)} segments):")
        total_size = 0
        
        for i, segment in enumerate(segments):
            if os.path.exists(segment):
                size_kb = os.path.getsize(segment) / 1024
                total_size += size_kb
                
                # Check keyframe start
                keyframe_info = self.check_keyframe_start(segment)
                
                print(f"  {i+1:2d}. {Path(segment).name} - "
                      f"{size_kb:.1f} KB {keyframe_info}")
            else:
                print(f"  {i+1:2d}. {Path(segment).name} - MISSING")
        
        print(f"\nTotal size: {total_size:.1f} KB ({total_size/1024:.2f} MB)")
        
        # Codec verification
        if segments:
            self.verify_codec_settings(segments[0])
    
    def check_keyframe_start(self, segment_file):
        """Check if segment starts with keyframe"""
        try:
            probe_cmd = [
                'ffprobe', '-v', 'quiet',
                '-select_streams', 'v:0',
                '-show_frames',
                '-show_entries', 'frame=key_frame',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                '-read_intervals', '%+#1',
                segment_file
            ]
            result = subprocess.run(probe_cmd, capture_output=True, text=True)
            
            if result.returncode == 0 and result.stdout.strip() == '1':
                return "✓ Keyframe"
            else:
                return "✗ No keyframe"
        except:
            return "? Unknown"
    
    def verify_codec_settings(self, sample_segment):
        """Verify codec settings of output"""
        try:
            probe_cmd = [
                'ffprobe', '-v', 'quiet',
                '-show_streams', '-select_streams', 'v:0',
                sample_segment
            ]
            result = subprocess.run(probe_cmd, capture_output=True, text=True)
            
            print(f"\nCodec Verification (sample: {Path(sample_segment).name}):")
            for line in result.stdout.split('\n'):
                if any(prop in line for prop in ['codec_name=', 'profile=', 'level=', 'bit_rate=', 'width=', 'height=']):
                    key, value = line.split('=', 1)
                    print(f"  {key}: {value}")
                    
        except Exception as e:
            print(f"Could not verify codec: {e}")
    
    def cleanup(self):
        """Clean up temporary files"""
        if self.temp_file and os.path.exists(self.temp_file):
            os.remove(self.temp_file)
    
    def convert(self):
        """Main conversion function"""
        try:
            print("=== Universal WebRTC HLS Converter ===")
            print(f"Input: {self.input_file}")
            print(f"Output: {self.output_dir}")
            print(f"Bitrate: {self.bitrate_kbps} kbps")
            print(f"Segment length: {self.segment_length}s")
            if self.width or self.height:
                print(f"Custom dimensions: {self.width or 'auto'}x{self.height or 'auto'}")
            print()
            
            # Create output directory
            self.create_output_directory()
            
            # Detect input type and process
            input_type = self.detect_input_type()
            print(f"Detected input type: {input_type}")
            
            if input_type == 'hls':
                # Parse M3U8 and concatenate segments
                segments = self.parse_m3u8_segments()
                print(f"Found {len(segments)} segments in M3U8")
                video_file = self.concatenate_hls_segments(segments)
            else:
                # Direct video file
                video_file = self.input_file
            
            # Convert to WebRTC-compliant HLS
            output_m3u8 = self.convert_to_webrtc_hls(video_file)
            
            # Analyze output
            self.analyze_output(output_m3u8)
            
            print(f"\n=== SUCCESS ===")
            print(f"WebRTC-compliant HLS created in: {self.output_dir}")
            print(f"Main playlist: {Path(output_m3u8).name}")
            print("\nOptimizations applied:")
            print("✓ Baseline profile (maximum compatibility)")
            print(f"✓ Constant {self.bitrate_kbps}kbps bitrate")
            print("✓ Keyframes every 2 seconds")
            print("✓ No B-frames (P-frames only)")
            print("✓ Single reference frame")
            print("✓ Video-only output (no audio)")
            if self.width or self.height:
                print(f"✓ Custom resolution: {self.width or 'auto'}x{self.height or 'auto'}")
            
            return output_m3u8
            
        finally:
            self.cleanup()

def main():
    parser = argparse.ArgumentParser(
        description='Convert MP4 or M3U8 to WebRTC-compliant HLS',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 webrtc_converter.py video.mp4 --bitrate 400 --output ./output
  python3 webrtc_converter.py playlist.m3u8 --bitrate 800 --output /tmp/webrtc_hls
  python3 webrtc_converter.py input.mov --bitrate 600 --output ../converted --segment-length 3
  python3 webrtc_converter.py bella.mp4 --bitrate 1500 --width 1280 --height 720 --output /home/ubuntu/tscache/vba/bella/videos/test --segment-length 2
  python3 webrtc_converter.py video.mp4 --bitrate 800 --width 1920 --output ./output (height auto-calculated)
  python3 webrtc_converter.py video.mp4 --bitrate 600 --height 480 --output ./output (width auto-calculated)
        """
    )
    
    parser.add_argument('input', help='Input MP4 or M3U8 file')
    parser.add_argument('--bitrate', '-b', type=int, required=True,
                       help='Output bitrate in kbps (e.g., 400)')
    parser.add_argument('--output', '-o', required=True,
                       help='Output directory (will be created if not exists)')
    parser.add_argument('--segment-length', '-s', type=int, default=2,
                       help='Segment length in seconds (default: 2)')
    parser.add_argument('--width', '-w', type=int,
                       help='Output width in pixels (optional, maintains aspect ratio if height not specified)')
    parser.add_argument('--height', type=int,
                       help='Output height in pixels (optional, maintains aspect ratio if width not specified)')
    
    args = parser.parse_args()
    
    # Validate arguments
    if args.bitrate <= 0:
        print("Error: Bitrate must be positive")
        return 1
    
    if args.segment_length <= 0:
        print("Error: Segment length must be positive") 
        return 1
    
    if args.width and args.width <= 0:
        print("Error: Width must be positive")
        return 1
        
    if args.height and args.height <= 0:
        print("Error: Height must be positive")
        return 1
    
    try:
        converter = WebRTCConverter(
            input_file=args.input,
            bitrate_kbps=args.bitrate,
            output_dir=args.output,
            segment_length=args.segment_length,
            width=args.width,
            height=args.height
        )
        
        output_m3u8 = converter.convert()
        
        print(f"\nTo test the output:")
        print(f"./out/sample_send_h264_pcm --token YOUR_TOKEN --channelId CHANNEL --videoFile {output_m3u8}")
        
        return 0
        
    except Exception as e:
        print(f"Error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())