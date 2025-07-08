#!/bin/bash

# Build script for the self-contained Agora streaming controller
# This script builds everything within the agora-video-controller directory

set -e

# Configuration
BUILD_TYPE="Release"
AGORA_SDK_PATH="/home/ubuntu/agora_rtc_sdk/agora_sdk"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

function print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

function print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

function check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if Agora SDK exists
    if [ ! -d "$AGORA_SDK_PATH" ]; then
        print_error "Agora SDK not found at: $AGORA_SDK_PATH"
        print_error "Please update AGORA_SDK_PATH in this script or ensure the SDK is installed"
        exit 1
    fi
    
    # Check for CMake
    if ! command -v cmake &> /dev/null; then
        print_error "cmake is required but not installed"
        exit 1
    fi
    
    # Check for make
    if ! command -v make &> /dev/null; then
        print_error "make is required but not installed"
        exit 1
    fi
    
    # Check for source file
    if [ ! -f "agora_streaming_controlled.cpp" ]; then
        print_error "agora_streaming_controlled.cpp not found in current directory"
        exit 1
    fi
    
    # Check for CMakeLists.txt
    if [ ! -f "CMakeLists.txt" ]; then
        print_error "CMakeLists.txt not found in current directory"
        exit 1
    fi
    
    print_status "Prerequisites check passed"
}

function clean_build() {
    print_status "Cleaning previous build..."
    if [ -d "build" ]; then
        rm -rf build
    fi
}

function configure_cmake() {
    print_status "Configuring CMake..."
    mkdir -p build
    cd build
    
    cmake .. \
        -DCMAKE_BUILD_TYPE=$BUILD_TYPE \
        -DCMAKE_VERBOSE_MAKEFILE=ON
    
    cd ..
}

function build_project() {
    print_status "Building project..."
    cd build
    make -j$(nproc)
    cd ..
    
    if [ -f "build/agora_streaming_controlled" ]; then
        print_status "Build successful!"
        print_status "Executable: $(pwd)/build/agora_streaming_controlled"
    else
        print_error "Build failed - executable not found"
        exit 1
    fi
}

function test_executable() {
    print_status "Testing executable..."
    
    # Set library path and test
    export LD_LIBRARY_PATH="$AGORA_SDK_PATH"
    
    if ./build/agora_streaming_controlled --help > /dev/null 2>&1; then
        print_status "Executable test passed"
    else
        print_warning "Executable test failed, but binary exists"
        print_warning "Make sure LD_LIBRARY_PATH is set when running:"
        echo "export LD_LIBRARY_PATH=$AGORA_SDK_PATH"
    fi
}

function print_usage_info() {
    echo ""
    echo "=================================================="
    echo "Build Complete!"
    echo "=================================================="
    echo ""
    echo "To run the streaming application:"
    echo "  export LD_LIBRARY_PATH=$AGORA_SDK_PATH"
    echo "  ./build/agora_streaming_controlled \\"
    echo "    --token YOUR_TOKEN \\"
    echo "    --channelId YOUR_CHANNEL \\"
    echo "    --videoFile YOUR_VIDEO.m3u8"
    echo ""
    echo "To start the Next.js controller:"
    echo "  npm run dev"
    echo ""
    echo "Example commands for the streaming process:"
    echo "  SWITCH_VIDEO:https://example.com/new_video.m3u8"
    echo "  EXIT"
    echo ""
}

function main() {
    echo "====== Agora Streaming Controller Build ======"
    echo "Build type: $BUILD_TYPE"
    echo "Agora SDK: $AGORA_SDK_PATH"
    echo "Working directory: $(pwd)"
    echo ""
    
    check_prerequisites
    clean_build
    configure_cmake
    build_project
    test_executable
    print_usage_info
}

# Parse command line arguments
while getopts 'd:h' opt; do
    case $opt in
    d)
        BUILD_TYPE="Debug"
        ;;
    h)
        echo "Usage: $0 [-d] [-h]"
        echo "  -d    Build in debug mode"
        echo "  -h    Show this help"
        exit 0
        ;;
    \?)
        echo "Invalid option. Use -h for help."
        exit 1
        ;;
    esac
done

# Run main function
main
