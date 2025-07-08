cmake_minimum_required(VERSION 3.10)
project(AgoraStreamingController)

# Set C++ standard
set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Agora SDK paths - update these to match your installation
set(AGORA_SDK_PATH "/home/ubuntu/agora_rtc_sdk/agora_sdk")

# Include directories
include_directories(${AGORA_SDK_PATH}/include)
include_directories(${AGORA_SDK_PATH}/include/rtc)
include_directories(${CMAKE_CURRENT_SOURCE_DIR})  # For common/ includes

# Library directories
link_directories(${AGORA_SDK_PATH})

# Common source files (only the .cpp files that exist)
set(COMMON_SOURCES
    common/helper.cpp
    common/opt_parser.cpp
    common/sample_common.cpp
    common/sample_connection_observer.cpp
    common/sample_local_user_observer.cpp
    common/sample_event.cpp
)

# Add executable with common sources
add_executable(agora_streaming_controlled
    agora_streaming_controlled.cpp
    ${COMMON_SOURCES}
)

# Link libraries
target_link_libraries(agora_streaming_controlled
    agora_rtc_sdk
    pthread
    dl
)

# Set runtime library path
set_target_properties(agora_streaming_controlled PROPERTIES
    INSTALL_RPATH "${AGORA_SDK_PATH}"
    BUILD_RPATH "${AGORA_SDK_PATH}"
)

# Compiler flags
target_compile_options(agora_streaming_controlled PRIVATE
    -Wall
    -Wextra
    -O2
)