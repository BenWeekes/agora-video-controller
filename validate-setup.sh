#!/bin/bash

# Validation script for Agora Video Streaming Controller setup
# This script checks if everything is properly configured

set -e

# Configuration
AGORA_SDK_PATH="/home/ubuntu/agora_rtc_sdk/agora_sdk"
CACHE_PATH="/home/ubuntu/tscache"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

function print_header() {
    echo -e "${BLUE}====== $1 ======${NC}"
}

function print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

function print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

function print_error() {
    echo -e "${RED}✗${NC} $1"
}

function check_prerequisites() {
    print_header "Checking Prerequisites"
    
    local all_good=true
    
    # Check Node.js
    if command -v node &> /dev/null; then
        local node_version=$(node --version)
        print_success "Node.js is installed: $node_version"
    else
        print_error "Node.js is not installed"
        all_good=false
    fi
    
    # Check npm
    if command -v npm &> /dev/null; then
        local npm_version=$(npm --version)
        print_success "npm is installed: $npm_version"
    else
        print_error "npm is not installed"
        all_good=false
    fi
    
    # Check cmake
    if command -v cmake &> /dev/null; then
        local cmake_version=$(cmake --version | head -n1)
        print_success "cmake is installed: $cmake_version"
    else
        print_error "cmake is not installed"
        all_good=false
    fi
    
    # Check make
    if command -v make &> /dev/null; then
        print_success "make is installed"
    else
        print_error "make is not installed"
        all_good=false
    fi
    
    # Check curl
    if command -v curl &> /dev/null; then
        print_success "curl is installed"
    else
        print_warning "curl is not installed (needed for M3U8 segment downloads)"
    fi
    
    if [ "$all_good" = false ]; then
        echo ""
        print_error "Some prerequisites are missing. Please install them before proceeding."
        return 1
    fi
}

function check_agora_sdk() {
    print_header "Checking Agora SDK"
    
    if [ -d "$AGORA_SDK_PATH" ]; then
        print_success "Agora SDK directory found: $AGORA_SDK_PATH"
        
        # Check for key files
        if [ -f "$AGORA_SDK_PATH/libagora_rtc_sdk.so" ]; then
            print_success "Agora RTC SDK library found"
        else
            print_warning "libagora_rtc_sdk.so not found in SDK directory"
        fi
        
        # Check include directory (common locations)
        local include_found=false
        for include_dir in "$AGORA_SDK_PATH/include" "$AGORA_SDK_PATH/../include"; do
            if [ -d "$include_dir" ]; then
                print_success "Agora SDK headers found: $include_dir"
                include_found=true
                break
            fi
        done
        
        if [ "$include_found" = false ]; then
            print_warning "Agora SDK include directory not found"
        fi
    else
        print_error "Agora SDK not found at: $AGORA_SDK_PATH"
        print_error "Please update AGORA_SDK_PATH in this script or install the SDK"
        return 1
    fi
}

function check_project_structure() {
    print_header "Checking Project Structure"
    
    local all_good=true
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ]; then
        print_error "package.json not found. Are you in the agora-video-controller directory?"
        all_good=false
    else
        print_success "package.json found"
    fi
    
    # Check C++ source
    if [ -f "agora_streaming_controlled.cpp" ]; then
        print_success "C++ source file found"
    else
        print_error "agora_streaming_controlled.cpp not found"
        all_good=false
    fi
    
    # Check CMakeLists.txt
    if [ -f "CMakeLists.txt" ]; then
        print_success "CMakeLists.txt found"
    else
        print_error "CMakeLists.txt not found"
        all_good=false
    fi
    
    # Check build script
    if [ -f "build.sh" ]; then
        print_success "Build script found"
        if [ -x "build.sh" ]; then
            print_success "Build script is executable"
        else
            print_warning "Build script is not executable (run: chmod +x build.sh)"
        fi
    else
        print_error "build.sh not found"
        all_good=false
    fi
    
    # Check Next.js structure
    if [ -d "pages" ]; then
        print_success "pages directory found"
    else
        print_error "pages directory not found"
        all_good=false
    fi
    
    if [ -d "lib" ]; then
        print_success "lib directory found"
    else
        print_error "lib directory not found"
        all_good=false
    fi
    
    # Check specific files
    local required_files=(
        "lib/processManager.ts"
        "pages/index.tsx"
        "pages/api/streaming/start.ts"
        "pages/api/streaming/switch.ts"
        "pages/api/streaming/stop.ts"
        "pages/api/streaming/status.ts"
        "next.config.js"
        "tsconfig.json"
    )
    
    for file in "${required_files[@]}"; do
        if [ -f "$file" ]; then
            print_success "$file found"
        else
            print_error "$file not found"
            all_good=false
        fi
    done
    
    if [ "$all_good" = false ]; then
        echo ""
        print_error "Some project files are missing. Please copy all required files."
        return 1
    fi
}

function check_build_status() {
    print_header "Checking Build Status"
    
    if [ -f "build/agora_streaming_controlled" ]; then
        print_success "C++ executable found: build/agora_streaming_controlled"
        
        # Check if executable is valid
        if [ -x "build/agora_streaming_controlled" ]; then
            print_success "Executable has proper permissions"
        else
            print_warning "Executable lacks execute permissions"
        fi
        
        # Test executable with library path
        export LD_LIBRARY_PATH="$AGORA_SDK_PATH"
        if ./build/agora_streaming_controlled --help &> /dev/null; then
            print_success "Executable runs successfully"
        else
            print_warning "Executable test failed (may need library path setup)"
        fi
    else
        print_warning "C++ executable not found. Run ./build.sh to build it."
    fi
    
    # Check node_modules
    if [ -d "node_modules" ]; then
        print_success "Node.js dependencies installed"
    else
        print_warning "Node.js dependencies not installed. Run 'npm install'"
    fi
}

function check_cache_directory() {
    print_header "Checking Cache Directory"
    
    if [ -d "$CACHE_PATH" ]; then
        print_success "Cache directory exists: $CACHE_PATH"
        
        # Check permissions
        if [ -w "$CACHE_PATH" ]; then
            print_success "Cache directory is writable"
        else
            print_error "Cache directory is not writable"
            echo "  Run: sudo chown \$(whoami):\$(whoami) $CACHE_PATH"
        fi
    else
        print_warning "Cache directory not found: $CACHE_PATH"
        echo "  Run: sudo mkdir -p $CACHE_PATH && sudo chown \$(whoami):\$(whoami) $CACHE_PATH"
    fi
}

function print_next_steps() {
    print_header "Next Steps"
    
    echo "If all checks passed, you can:"
    echo ""
    echo "1. Build the C++ application (if not done):"
    echo "   ./build.sh"
    echo ""
    echo "2. Install Node.js dependencies (if not done):"
    echo "   npm install"
    echo ""
    echo "3. Start the development server:"
    echo "   npm run dev"
    echo ""
    echo "4. Access the web interface:"
    echo "   http://localhost:3000"
    echo ""
    echo "5. Test the C++ application directly:"
    echo "   export LD_LIBRARY_PATH=$AGORA_SDK_PATH"
    echo "   ./build/agora_streaming_controlled --token YOUR_TOKEN --channelId YOUR_CHANNEL --videoFile YOUR_VIDEO.m3u8"
}

function main() {
    echo "====== Agora Video Streaming Controller - Setup Validation ======"
    echo ""
    
    local overall_status=true
    
    if ! check_prerequisites; then
        overall_status=false
    fi
    echo ""
    
    if ! check_agora_sdk; then
        overall_status=false
    fi
    echo ""
    
    if ! check_project_structure; then
        overall_status=false
    fi
    echo ""
    
    check_build_status
    echo ""
    
    check_cache_directory
    echo ""
    
    if [ "$overall_status" = true ]; then
        print_success "All critical checks passed!"
    else
        print_error "Some critical issues found. Please address them before proceeding."
    fi
    
    echo ""
    print_next_steps
}

# Run main function
main
