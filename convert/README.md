# Convert MP4 to WebRTC HLS
python3 webrtc_converter.py video.mp4 --bitrate 400 --output ./webrtc_output

# Convert existing M3U8 to WebRTC-optimized version  
python3 webrtc_converter.py playlist.m3u8 --bitrate 800 --output /tmp/optimized

# Custom segment length (3 seconds instead of 2)
python3 webrtc_converter.py input.mov --bitrate 600 --output ../converted --segment-length 3
