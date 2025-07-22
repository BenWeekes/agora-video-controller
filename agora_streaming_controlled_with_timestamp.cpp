//  Agora RTC/MEDIA SDK
//
//  Created by Jay Zhang in 2020-04.
//  Copyright (c) 2020 Agora.io. All rights reserved.
//

//video
//   ******************         --------         *************         ------------       *********        **********         ************       ------------        ***********       --------
//  {SDK::capture video}  ==>  |raw data|  ==>  {SDK::encode B}  ==>  |encoded data| ==> {SDK::send}  ==> {AGORA::VOS}  ==>  {SDK::receive} ==> |encoded data|  ==> {SDK::decode} ==> |raw data|
//   ******************         --------         *************         ------------       *********        **********         ************       ------------        ***********       --------
//                                                                                  sample send h264(this sample)                              sample receive h264                 

//This sample will show how to use the SDK to send H264 frames from MPEG-TS files or M3U8 playlists to the Agora_channel
//Supports both local files and URLs. For URLs, downloads and caches content automatically.
//The integrated HelperTsH264FileParser will parse .ts files and extract H264 access units frame by frame
//For M3U8 playlists, it will loop through all segments continuously
//NOW SUPPORTS RUNTIME VIDEO SWITCHING VIA STDIN COMMANDS

// Wish you have a great experience with Agora_SDK!

#include <csignal>
#include <cstring>
#include <sstream>
#include <string>
#include <thread>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#include <cstdio>
#include <functional>
#include <memory>
#include <vector>
#include <fstream>
#include <regex>
#include <sys/types.h>
#include <sys/wait.h>
#include <dirent.h>
#include <mutex>
#include <atomic>
#include <condition_variable>
#include <queue>

#include "IAgoraService.h"
#include "NGIAgoraRtcConnection.h"
#include "common/helper.h"
#include "common/log.h"
#include "common/opt_parser.h"
#include "common/sample_common.h"
#include "common/sample_connection_observer.h"
#include "common/sample_local_user_observer.h"

#include "NGIAgoraLocalUser.h"
#include "NGIAgoraMediaNodeFactory.h"
#include "NGIAgoraMediaNode.h"
#include "NGIAgoraVideoTrack.h"

#define DEFAULT_CONNECT_TIMEOUT_MS (3000)
#define DEFAULT_FRAME_RATE (30)
#define DEFAULT_VIDEO_FILE "test_data/send_video.ts"
#define CACHE_BASE_PATH "/home/ubuntu/tscache"

/* ====== Command Structure for Dynamic Switching =============== */
struct Command {
  enum Type {
    SWITCH_VIDEO,
    EXIT
  };
  
  Type type;
  std::string data;
  
  Command(Type t, const std::string& d) : type(t), data(d) {}
};

// Utility function to check if a string represents a valid integer
static bool isInteger(const std::string& str) {
  if (str.empty()) return false;
  
  size_t start = 0;
  if (str[0] == '-' || str[0] == '+') {
    start = 1;
    if (str.length() == 1) return false; // Just a sign character
  }
  
  for (size_t i = start; i < str.length(); ++i) {
    if (!std::isdigit(str[i])) {
      return false;
    }
  }
  return true;
}

static bool isVerboseLoggingEnabled() {
  // You can control this via environment variable or command line
  const char* verbose = getenv("AGORA_VERBOSE");
  return verbose && (strcmp(verbose, "1") == 0 || strcmp(verbose, "true") == 0);
}

static void quietLogger(const char* msg) {
  // Only log important messages, filter out verbose ones
  std::string message(msg);
  
  // Skip verbose segment switching and H.264 detection messages
  if (message.find("Switching to segment") != std::string::npos ||
      message.find("Found H.264 stream on PID") != std::string::npos ||
      message.find("Parsed M3U8: found") != std::string::npos ||
      message.find("Using cached segment") != std::string::npos ||
      message.find("Downloading:") != std::string::npos) {
    
    // Only show these if verbose mode is enabled
    if (isVerboseLoggingEnabled()) {
      std::fprintf(stderr, "[VERBOSE] %s\n", msg);
    }
    return;
  }
  
  // Log important messages normally
  std::fprintf(stderr, "%s\n", msg);
}

/* ====== Global Command Queue ================================= */
class CommandQueue {
private:
  std::queue<Command> commands_;
  std::mutex mutex_;
  std::condition_variable cv_;

public:
  void push(const Command& cmd) {
    std::lock_guard<std::mutex> lock(mutex_);
    commands_.push(cmd);
    cv_.notify_one();
  }
  
  bool pop(Command& cmd, int timeoutMs = 100) {
    std::unique_lock<std::mutex> lock(mutex_);
    if (cv_.wait_for(lock, std::chrono::milliseconds(timeoutMs), [this] { return !commands_.empty(); })) {
      cmd = commands_.front();
      commands_.pop();
      return true;
    }
    return false;
  }
  
  bool empty() {
    std::lock_guard<std::mutex> lock(mutex_);
    return commands_.empty();
  }
};

static CommandQueue commandQueue;
static std::atomic<bool> exitFlag{false};

/* ====== HelperH264Frame structure ================================= */
struct HelperH264Frame {
  bool isKeyFrame;
  std::unique_ptr<uint8_t[]> buffer;
  int bufferLen;
  
  HelperH264Frame(bool key, std::unique_ptr<uint8_t[]> buf, int len)
    : isKeyFrame(key), buffer(std::move(buf)), bufferLen(len) {}
};

/* ====== Utility Functions ================================= */

// Create directory recursively
bool createDirectoryRecursive(const std::string& path) {
  std::string command = "mkdir -p \"" + path + "\"";
  return system(command.c_str()) == 0;
}

// Check if file exists
bool fileExists(const std::string& path) {
  struct stat st;
  return stat(path.c_str(), &st) == 0;
}

// Extract cache path from URL
std::string extractCachePath(const std::string& url) {
  size_t vbaPos = url.find("/vba/");
  if (vbaPos == std::string::npos) {
    // Fallback: use last part of URL path
    size_t lastSlash = url.find_last_of('/');
    if (lastSlash != std::string::npos) {
      return url.substr(lastSlash + 1);
    }
    return "default";
  }
  return url.substr(vbaPos + 1); // Skip the leading slash
}

// Download file using curl
bool downloadFile(const std::string& url, const std::string& outputPath) {
  // Create directory for the file
  size_t lastSlash = outputPath.find_last_of('/');
  if (lastSlash != std::string::npos) {
    std::string dir = outputPath.substr(0, lastSlash);
    if (!createDirectoryRecursive(dir)) {
      fprintf(stderr, "Failed to create directory: %s\n", dir.c_str());
      return false;
    }
  }
  
  std::string command = "curl -s -L \"" + url + "\" -o \"" + outputPath + "\"";
  printf("Downloading: %s\n", url.c_str());
  return system(command.c_str()) == 0;
}

// Get base URL from a full URL
std::string getBaseUrl(const std::string& url) {
  size_t lastSlash = url.find_last_of('/');
  if (lastSlash != std::string::npos) {
    return url.substr(0, lastSlash + 1);
  }
  return url;
}

/* ====== M3U8 Parser ================================= */

struct M3U8Segment {
  std::string url;
  std::string localPath;
  double duration;
};

class M3U8Parser {
public:
  bool parseM3U8(const std::string& m3u8Path, const std::string& baseUrl = "");
  bool downloadSegments(const std::string& cacheBasePath);
  const std::vector<M3U8Segment>& getSegments() const { return segments_; }
  
private:
  std::vector<M3U8Segment> segments_;
  std::string baseUrl_;
};

bool M3U8Parser::parseM3U8(const std::string& m3u8Path, const std::string& baseUrl) {
  baseUrl_ = baseUrl;
  segments_.clear();
  
  std::ifstream file(m3u8Path);
  if (!file.is_open()) {
    fprintf(stderr, "Failed to open M3U8 file: %s\n", m3u8Path.c_str());
    return false;
  }
  
  std::string line;
  double duration = 0.0;
  
  while (std::getline(file, line)) {
    // Remove carriage return if present
    if (!line.empty() && line.back() == '\r') {
      line.pop_back();
    }
    
    if (line.empty() || line[0] == '#') {
      // Parse duration from #EXTINF lines
      if (line.find("#EXTINF:") == 0) {
        size_t colonPos = line.find(':');
        size_t commaPos = line.find(',');
        if (colonPos != std::string::npos && commaPos != std::string::npos) {
          std::string durationStr = line.substr(colonPos + 1, commaPos - colonPos - 1);
          duration = std::stod(durationStr);
        }
      }
      continue;
    }
    
    // This is a segment URL
    M3U8Segment segment;
    segment.duration = duration;
    
    if (line.find("http://") == 0 || line.find("https://") == 0) {
      // Absolute URL
      segment.url = line;
    } else {
      // Relative URL
      segment.url = baseUrl_ + line;
    }
    
    segments_.push_back(segment);
    duration = 0.0; // Reset for next segment
  }
  
  printf("Parsed M3U8: found %zu segments\n", segments_.size());
  return !segments_.empty();
}

bool M3U8Parser::downloadSegments(const std::string& cacheBasePath) {
  for (auto& segment : segments_) {
    // Extract filename from URL
    std::string filename;
    size_t lastSlash = segment.url.find_last_of('/');
    if (lastSlash != std::string::npos) {
      filename = segment.url.substr(lastSlash + 1);
    } else {
      filename = segment.url;
    }
    
    segment.localPath = cacheBasePath + "/" + filename;
    
    // Download if not already cached
    if (!fileExists(segment.localPath)) {
      if (!downloadFile(segment.url, segment.localPath)) {
        fprintf(stderr, "Failed to download segment: %s\n", segment.url.c_str());
        return false;
      }
    } else {
      printf("Using cached segment: %s\n", segment.localPath.c_str());
    }
  }
  
  return true;
}

/* ====== MPEG-TS H264 Parser ================================= */

#define TS_PKT_SIZE      188
#define TS_SYNC_BYTE     0x47
#define ADAPT_FIELD_FLAG 0x20
#define PAYLOAD_FLAG     0x10
#define PES_START_CODE   0x000001

static inline uint16_t pid(const uint8_t* p) { return ((p[1] & 0x1F) << 8) | p[2]; }
static inline bool     payloadUnitStart(const uint8_t* p) { return p[1] & 0x40; }
static inline int      adaptFieldLen(const uint8_t* p) {
  if (!(p[3] & ADAPT_FIELD_FLAG)) return 0;
  int len = p[4] + 1;                    // +1 = length byte itself
  return len > 183 ? -1 /*invalid*/ : len;
}

/* ===== utility logging ================================================== */
namespace {
  std::function<void(const char*)>& logger() {
    static std::function<void(const char*)> cb = nullptr;
    return cb;
  }
}

void setLogger(std::function<void(const char*)> fn) {
  logger() = std::move(fn);
}

#define LOGF(fmt, ...)                                    \
  do {                                                    \
    char _buf[256];                                       \
    std::snprintf(_buf, sizeof(_buf), fmt, ##__VA_ARGS__); \
    if (logger())                                         \
      logger()(_buf);                                     \
    else                                                  \
      std::fprintf(stderr, "%s\n", _buf);                \
  } while (0)

/* ===== TS H264 File Parser Class ============================================ */

class HelperTsH264FileParser {
public:
  explicit HelperTsH264FileParser(const char* filepath);
  ~HelperTsH264FileParser();
  
  bool initialize();
  void setFileParseRestart();
  std::unique_ptr<HelperH264Frame> getH264Frame();
  static void setLogger(std::function<void(const char*)> fn);

private:
  bool _probeProgramPids();
  size_t _readOnePes(uint8_t*& out, bool& key, size_t& pts_off);
  
  std::string file_path_;
  int fd_ = -1;
  uint8_t* data_ = nullptr;
  size_t size_ = 0;
  size_t offset_ = 0;
  uint16_t video_pid_ = 0;
};

HelperTsH264FileParser::HelperTsH264FileParser(const char* filepath)
    : file_path_(filepath) {}

HelperTsH264FileParser::~HelperTsH264FileParser() {
  if (data_) munmap(data_, size_);
  if (fd_ >= 0) close(fd_);
}

bool HelperTsH264FileParser::initialize() {
  struct stat st;
  fd_ = open(file_path_.c_str(), O_RDONLY);
  if (fd_ < 0 || fstat(fd_, &st) != 0) {
    LOGF("Failed to open %s", file_path_.c_str());
    return false;
  }

  size_ = st.st_size;
  data_ = static_cast<uint8_t*>(mmap(nullptr, size_, PROT_READ, MAP_PRIVATE, fd_, 0));
  if (data_ == MAP_FAILED) {
    data_ = nullptr;
    LOGF("mmap() failed on %s", file_path_.c_str());
    return false;
  }

  offset_ = 0;
  return _probeProgramPids();
}

void HelperTsH264FileParser::setFileParseRestart() { offset_ = 0; }

bool HelperTsH264FileParser::_probeProgramPids() {
  for (size_t o = 0; o + TS_PKT_SIZE <= size_; o += TS_PKT_SIZE) {
    const uint8_t* p = data_ + o;
    if (p[0] != TS_SYNC_BYTE) continue;
    if (pid(p) == 0 /* PAT */ && payloadUnitStart(p)) {
      int adapt = adaptFieldLen(p);
      if (adapt < 0) continue;
      const uint8_t* pat = p + 4 + adapt;
      
      // Check bounds for pointer field
      if (pat >= data_ + size_) continue;
      uint8_t pointer = pat[0];
      pat += 1 + pointer + 8; // skip pointer field and table hdr
      
      while (pat + 4 <= data_ + size_) {
        uint16_t program = (pat[0] << 8) | pat[1];
        uint16_t pmt_pid = ((pat[2] & 0x1F) << 8) | pat[3];
        if (program) {
          // Found a program, now look for its PMT
          for (size_t o2 = 0; o2 + TS_PKT_SIZE <= size_; o2 += TS_PKT_SIZE) {
            const uint8_t* q = data_ + o2;
            if (q[0] != TS_SYNC_BYTE || pid(q) != pmt_pid || !payloadUnitStart(q))
              continue;
            int adapt2 = adaptFieldLen(q);
            if (adapt2 < 0) continue;
            const uint8_t* pmt = q + 4 + adapt2;
            
            // Check bounds for PMT
            if (pmt >= data_ + size_) continue;
            uint8_t ptr2 = pmt[0];
            pmt += 1 + ptr2 + 12; // skip pointer + PMT header + program info
            
            while (pmt + 5 <= data_ + size_) {
              uint8_t  stype = pmt[0];
              uint16_t spid  = ((pmt[1] & 0x1F) << 8) | pmt[2];
              uint16_t eslen = ((pmt[3] & 0x0F) << 8) | pmt[4];
              if (stype == 0x1B /* AVC/H.264 */) {
                video_pid_ = spid;
                LOGF("Found H.264 stream on PID %u", video_pid_);
                return true;
              }
              pmt += 5 + eslen;
            }
          }
        }
        pat += 4;
      }
      break;
    }
  }
  LOGF("No H.264 PID found in %s", file_path_.c_str());
  return false;
}

size_t HelperTsH264FileParser::_readOnePes(uint8_t*& out, bool& key, size_t& pts_off) {
  static uint8_t au_buf[1 << 20]; // 1 MiB scratch
  size_t au_len = 0;
  bool   started = false;
  key = false;

  const int kMaxDesync = 128; // abort after this many bad syncs
  int desyncCnt = 0;

  for (; offset_ + TS_PKT_SIZE <= size_; offset_ += TS_PKT_SIZE) {
    const uint8_t* p = data_ + offset_;
    if (p[0] != TS_SYNC_BYTE) {
      if (++desyncCnt >= kMaxDesync) {
        LOGF("Transport stream desynchronized – aborting at offset %zu", offset_);
        offset_ = size_; // force EOF
        break;
      }
      continue;
    }
    desyncCnt = 0;

    if (pid(p) != video_pid_) continue;

    int adapt = adaptFieldLen(p);
    if (adapt < 0) continue;              // invalid adaptation field length

    const uint8_t* pay = p + 4 + adapt;
    size_t pay_len = TS_PKT_SIZE - 4 - adapt;
    if (pay_len == 0 || pay > data_ + size_) continue;

    if (payloadUnitStart(p)) {
      if (started) break;                // previous AU complete
      started = true;

      if (pay_len < 9) continue;         // PES header must fit
      if (pay[0] != 0x00 || pay[1] != 0x00 || pay[2] != 0x01) continue; // bad start

      size_t pes_head = 9 + pay[8];
      if (pes_head > pay_len) continue;  // declared header longer than packet

      pay     += pes_head;
      pay_len -= pes_head;
    }

    if (au_len + pay_len > sizeof(au_buf)) {
      LOGF("Access‑unit larger than %zu bytes – truncated", sizeof(au_buf));
      break;   // send what we have so far
    }

    std::memcpy(au_buf + au_len, pay, pay_len);
    au_len += pay_len;

    // IDR detection (3‑ and 4‑byte prefixes)
    for (size_t i = 0; i + 5 < pay_len; ++i) {
      if (pay[i] == 0x00 && pay[i+1] == 0x00) {
        if (pay[i+2] == 0x01) {
          uint8_t nal = pay[i+3] & 0x1F;
          if (nal == 5) key = true;       // IDR slice
        } else if (pay[i+2] == 0x00 && pay[i+3] == 0x01) {
          uint8_t nal = pay[i+4] & 0x1F;
          if (nal == 5) key = true;       // IDR slice
          i += 3; // skip extra bytes of 4‑byte prefix (loop ++i will add one)
        }
      }
    }
  }

  out = au_len ? au_buf : nullptr;
  pts_off = 0;
  return au_len;
}

std::unique_ptr<HelperH264Frame> HelperTsH264FileParser::getH264Frame() {
  uint8_t* ptr; 
  bool is_key = false; 
  size_t dummy;
  
  size_t len = _readOnePes(ptr, is_key, dummy);
  if (!len) { 
    // EOF reached, reset for looping
    offset_ = 0; 
    return nullptr; 
  }

  // Create a copy of the data for the frame (C++11 compatible)
  std::unique_ptr<uint8_t[]> buf(new uint8_t[len]);
  std::memcpy(buf.get(), ptr, len);
  
  return std::unique_ptr<HelperH264Frame>(new HelperH264Frame(is_key, std::move(buf), static_cast<int>(len)));
}

/* ====== Thread-Safe Playlist Manager ================================= */

class PlaylistManager {
public:
  bool initialize(const std::string& input);
  std::unique_ptr<HelperH264Frame> getNextFrame();
  bool preloadNewPlaylist(const std::string& input);
  bool switchToNewPlaylist();
  std::string getCurrentVideoFile() const;
  
private:
  bool isM3U8(const std::string& path);
  bool isURL(const std::string& path);
  bool setupSingleFile(const std::string& path);
  bool setupPlaylist(const std::string& path);
  
  // Current playlist
  std::vector<std::string> segmentPaths_;
  size_t currentSegmentIndex_ = 0;
  std::unique_ptr<HelperTsH264FileParser> currentParser_;
  bool isPlaylist_ = false;
  std::string currentVideoFile_;
  
  // New playlist (for preloading)
  std::vector<std::string> newSegmentPaths_;
  std::string newVideoFile_;
  bool newPlaylistReady_ = false;
  
  // Thread safety
  mutable std::mutex mutex_;
  
  // Internal setup methods
  bool internalSetupSingleFile(const std::string& path, std::vector<std::string>& paths, bool& isPlaylist);
  bool internalSetupPlaylist(const std::string& path, std::vector<std::string>& paths, bool& isPlaylist);
};

bool PlaylistManager::isM3U8(const std::string& path) {
  return path.size() >= 5 && path.substr(path.size() - 5) == ".m3u8";
}

bool PlaylistManager::isURL(const std::string& path) {
  return path.find("http://") == 0 || path.find("https://") == 0;
}

std::string PlaylistManager::getCurrentVideoFile() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return currentVideoFile_;
}

bool PlaylistManager::initialize(const std::string& input) {
  std::lock_guard<std::mutex> lock(mutex_);
  currentVideoFile_ = input;
  
  if (isM3U8(input)) {
    return internalSetupPlaylist(input, segmentPaths_, isPlaylist_);
  } else {
    return internalSetupSingleFile(input, segmentPaths_, isPlaylist_);
  }
}

bool PlaylistManager::internalSetupSingleFile(const std::string& path, std::vector<std::string>& paths, bool& isPlaylist) {
  isPlaylist = false;
  paths.clear();
  paths.push_back(path);
  currentSegmentIndex_ = 0;
  
  currentParser_.reset(new HelperTsH264FileParser(path.c_str()));
  return currentParser_->initialize();
}

bool PlaylistManager::internalSetupPlaylist(const std::string& path, std::vector<std::string>& paths, bool& isPlaylist) {
  isPlaylist = true;
  paths.clear();
  currentSegmentIndex_ = 0;
  
  std::string m3u8Path = path;
  std::string baseUrl;
  
  // Handle URL download
  if (isURL(path)) {
    std::string cachePath = extractCachePath(path);
    std::string fullCachePath = std::string(CACHE_BASE_PATH) + "/" + cachePath;
    
    // Create cache directory
    size_t lastSlash = fullCachePath.find_last_of('/');
    if (lastSlash != std::string::npos) {
      std::string cacheDir = fullCachePath.substr(0, lastSlash);
      if (!createDirectoryRecursive(cacheDir)) {
        fprintf(stderr, "Failed to create cache directory: %s\n", cacheDir.c_str());
        return false;
      }
    }
    
    // Download M3U8 if not cached
    if (!fileExists(fullCachePath)) {
      if (!downloadFile(path, fullCachePath)) {
        fprintf(stderr, "Failed to download M3U8: %s\n", path.c_str());
        return false;
      }
    }
    
    m3u8Path = fullCachePath;
    baseUrl = getBaseUrl(path);
  }
  
  // Parse M3U8
  M3U8Parser parser;
  if (!parser.parseM3U8(m3u8Path, baseUrl)) {
    return false;
  }
  
  // Download segments if needed
  if (isURL(path)) {
    std::string cachePath = extractCachePath(path);
    size_t lastSlash = cachePath.find_last_of('/');
    std::string cacheDir = std::string(CACHE_BASE_PATH) + "/" + 
                          (lastSlash != std::string::npos ? cachePath.substr(0, lastSlash) : cachePath);
    
    if (!parser.downloadSegments(cacheDir)) {
      return false;
    }
  }
  
  // Set up segment paths
  for (const auto& segment : parser.getSegments()) {
    if (isURL(path)) {
      paths.push_back(segment.localPath);
    } else {
      // Local M3U8 - segments are relative to M3U8 location
      std::string segmentPath = segment.url;
      if (segmentPath.find('/') != 0) { // Relative path
        size_t lastSlash = m3u8Path.find_last_of('/');
        if (lastSlash != std::string::npos) {
          segmentPath = m3u8Path.substr(0, lastSlash + 1) + segmentPath;
        }
      }
      paths.push_back(segmentPath);
    }
  }
  
  if (paths.empty()) {
    return false;
  }
  
  // Initialize first segment
  currentParser_.reset(new HelperTsH264FileParser(paths[0].c_str()));
  return currentParser_->initialize();
}

bool PlaylistManager::preloadNewPlaylist(const std::string& input) {
  printf("Preloading new playlist: %s\n", input.c_str());
  
  // Setup new playlist in background (without holding the main mutex for too long)
  std::vector<std::string> tempPaths;
  bool tempIsPlaylist;
  
  bool success;
  if (isM3U8(input)) {
    success = internalSetupPlaylist(input, tempPaths, tempIsPlaylist);
  } else {
    success = internalSetupSingleFile(input, tempPaths, tempIsPlaylist);
  }
  
  if (success) {
    std::lock_guard<std::mutex> lock(mutex_);
    newSegmentPaths_ = std::move(tempPaths);
    newVideoFile_ = input;
    newPlaylistReady_ = true;
    printf("New playlist preloaded and ready for switching\n");
  }
  
  return success;
}

bool PlaylistManager::switchToNewPlaylist() {
  std::lock_guard<std::mutex> lock(mutex_);
  
  if (!newPlaylistReady_) {
    return false;
  }
  
  printf("Switching to new playlist: %s\n", newVideoFile_.c_str());
  
  // Switch to new playlist
  segmentPaths_ = std::move(newSegmentPaths_);
  currentVideoFile_ = newVideoFile_;
  currentSegmentIndex_ = 0;
  newPlaylistReady_ = false;
  
  // Initialize first segment of new playlist
  if (!segmentPaths_.empty()) {
    currentParser_.reset(new HelperTsH264FileParser(segmentPaths_[0].c_str()));
    bool success = currentParser_->initialize();
    if (success) {
      printf("Successfully switched to: %s\n", currentVideoFile_.c_str());
    }
    return success;
  }
  
  return false;
}

std::unique_ptr<HelperH264Frame> PlaylistManager::getNextFrame() {
  std::lock_guard<std::mutex> lock(mutex_);
  
  if (!currentParser_) {
    return nullptr;
  }
  
  auto frame = currentParser_->getH264Frame();
  if (frame) {
    return frame;
  }
  
  // Current segment ended
  if (isPlaylist_ && segmentPaths_.size() > 1) {
    // Move to next segment
    currentSegmentIndex_ = (currentSegmentIndex_ + 1) % segmentPaths_.size();
    printf("Switching to segment %zu: %s\n", currentSegmentIndex_, segmentPaths_[currentSegmentIndex_].c_str());
    
    currentParser_.reset(new HelperTsH264FileParser(segmentPaths_[currentSegmentIndex_].c_str()));
    if (currentParser_->initialize()) {
      return currentParser_->getH264Frame();
    }
  } else {
    // Single file - restart
    currentParser_->setFileParseRestart();
    return currentParser_->getH264Frame();
  }
  
  return nullptr;
}

/* ====== Command Processing ================================= */

void processStdinCommands() {
  std::string line;
  while (!exitFlag && std::getline(std::cin, line)) {
    if (line.empty()) continue;
    
    // Parse command
    if (line == "EXIT") {
      commandQueue.push(Command(Command::EXIT, ""));
      break;
    } else if (line.find("SWITCH_VIDEO:") == 0) {
      std::string videoFile = line.substr(13); // Length of "SWITCH_VIDEO:"
      if (!videoFile.empty()) {
        commandQueue.push(Command(Command::SWITCH_VIDEO, videoFile));
        printf("Received switch video command: %s\n", videoFile.c_str());
      }
    } else {
      printf("Unknown command: %s\n", line.c_str());
    }
  }
}

/* ====== Main Application Code ================================= */

struct SampleOptions {
  std::string appId;
  std::string channelId;
  std::string userId;
  std::string videoFile = DEFAULT_VIDEO_FILE;
  std::string localIP;
  struct {
    int frameRate = DEFAULT_FRAME_RATE;
    bool showBandwidthEstimation = false;
  } video;
};

/*
static void sendOneH264Frame(
    int frameRate, std::unique_ptr<HelperH264Frame> h264Frame,
    agora::agora_refptr<agora::rtc::IVideoEncodedImageSender> videoH264FrameSender) {
  agora::rtc::EncodedVideoFrameInfo videoEncodedFrameInfo;
  videoEncodedFrameInfo.rotation = agora::rtc::VIDEO_ORIENTATION_0;
  videoEncodedFrameInfo.codecType = agora::rtc::VIDEO_CODEC_H264;
  videoEncodedFrameInfo.framesPerSecond = frameRate;
  videoEncodedFrameInfo.frameType =
      (h264Frame.get()->isKeyFrame ? agora::rtc::VIDEO_FRAME_TYPE::VIDEO_FRAME_TYPE_KEY_FRAME
                                   : agora::rtc::VIDEO_FRAME_TYPE::VIDEO_FRAME_TYPE_DELTA_FRAME);

  videoH264FrameSender->sendEncodedVideoImage(
      reinterpret_cast<uint8_t*>(h264Frame.get()->buffer.get()), h264Frame.get()->bufferLen,
      videoEncodedFrameInfo);
}*/

static void sendOneH264Frame(
    int frameRate, std::unique_ptr<HelperH264Frame> h264Frame,
    agora::agora_refptr<agora::rtc::IVideoEncodedImageSender> videoH264FrameSender) {
  agora::rtc::EncodedVideoFrameInfo videoEncodedFrameInfo;
  videoEncodedFrameInfo.rotation = agora::rtc::VIDEO_ORIENTATION_0;
  videoEncodedFrameInfo.codecType = agora::rtc::VIDEO_CODEC_H264;
  videoEncodedFrameInfo.framesPerSecond = frameRate;
  videoEncodedFrameInfo.frameType =
      (h264Frame.get()->isKeyFrame ? agora::rtc::VIDEO_FRAME_TYPE::VIDEO_FRAME_TYPE_KEY_FRAME
                                   : agora::rtc::VIDEO_FRAME_TYPE::VIDEO_FRAME_TYPE_DELTA_FRAME);

  // Get current timestamp
  auto now = std::chrono::system_clock::now();
  auto time_since_epoch = now.time_since_epoch();
  auto millis = std::chrono::duration_cast<std::chrono::milliseconds>(time_since_epoch).count();
  
  // Convert timestamp to string for custom data
  std::string timestamp_str = std::to_string(millis);
  
  // Magic ending string to identify our custom data
  std::string ending_text = "AgoraWrc";
  
  // Calculate lengths
  size_t video_data_len = h264Frame.get()->bufferLen;
  size_t custom_data_len = timestamp_str.length();
  uint32_t custom_data_len_le = 0;
  
  // Convert custom_data_len to little endian
  custom_data_len_le = (custom_data_len & 0xff) << 24 | 
                       (custom_data_len & 0xff00) << 8 | 
                       (custom_data_len & 0xff0000) >> 8 | 
                       (custom_data_len & 0xff000000) >> 24;
  
  // Calculate total length: videoData + customData + customDataLength(4 bytes) + 'AgoraWrc'(8 bytes)
  size_t total_len = video_data_len + custom_data_len + sizeof(custom_data_len_le) + ending_text.size();
  
  // Allocate buffer for combined data
  std::unique_ptr<uint8_t[]> combined_buffer(new uint8_t[total_len]);
  
  // Copy video frame data
  std::memcpy(combined_buffer.get(), h264Frame.get()->buffer.get(), video_data_len);
  
  // Copy custom data (timestamp)
  std::memcpy(combined_buffer.get() + video_data_len, timestamp_str.c_str(), custom_data_len);
  
  // Copy custom data length (little endian)
  std::memcpy(combined_buffer.get() + video_data_len + custom_data_len, 
              &custom_data_len_le, sizeof(custom_data_len_le));
  
  // Copy ending text
  std::memcpy(combined_buffer.get() + video_data_len + custom_data_len + sizeof(custom_data_len_le), 
              ending_text.c_str(), ending_text.size());

  // Send the combined buffer
  videoH264FrameSender->sendEncodedVideoImage(
      combined_buffer.get(), total_len, videoEncodedFrameInfo);
}

static void SampleSendVideoH264Task(
    const SampleOptions& options,
    agora::agora_refptr<agora::rtc::IVideoEncodedImageSender> videoH264FrameSender,
    PlaylistManager& playlistManager) {
  
  // Calculate send interval based on frame rate
  PacerInfo pacer = {0, 1000 / options.video.frameRate, 0, std::chrono::steady_clock::now()};
  
  std::string pendingVideoSwitch;
  bool switchRequested = false;

  while (!exitFlag) {
    // Check for commands
    Command cmd(Command::EXIT, "");
    if (commandQueue.pop(cmd, 1)) { // 1ms timeout
      switch (cmd.type) {
        case Command::EXIT:
          printf("Received exit command\n");
          exitFlag = true;
          break;
          
        case Command::SWITCH_VIDEO:
          printf("Processing video switch to: %s\n", cmd.data.c_str());
          pendingVideoSwitch = cmd.data;
          switchRequested = true;
          
          // Start preloading in background thread
          std::thread([&playlistManager, cmd]() {
            playlistManager.preloadNewPlaylist(cmd.data);
          }).detach();
          break;
      }
    }
    
    // Check if we can switch to preloaded playlist
    if (switchRequested) {
      if (playlistManager.switchToNewPlaylist()) {
        printf("Successfully switched video to: %s\n", pendingVideoSwitch.c_str());
        switchRequested = false;
        pendingVideoSwitch.clear();
      }
    }
    
    // Get and send next frame
    if (auto h264Frame = playlistManager.getNextFrame()) {
      sendOneH264Frame(options.video.frameRate, std::move(h264Frame), videoH264FrameSender);
      waitBeforeNextSend(pacer);
    } else {
      // No frame available, short sleep to prevent busy loop
      std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
  }
}

static void SignalHandler(int sigNo) { 
  printf("Received signal %d, shutting down...\n", sigNo);
  exitFlag = true; 
}

int main(int argc, char* argv[]) {
  SampleOptions options;
  opt_parser optParser;

  optParser.add_long_opt("token", &options.appId, "The token for authentication / must");
  optParser.add_long_opt("channelId", &options.channelId, "Channel Id / must");
  optParser.add_long_opt("userId", &options.userId, "User Id / default is 0");
  optParser.add_long_opt("videoFile", &options.videoFile,
                         "The video file (.ts) or playlist (.m3u8) to be sent - supports URLs");
  optParser.add_long_opt("fps", &options.video.frameRate,
                         "Target frame rate for sending the video stream");
  optParser.add_long_opt("bwe", &options.video.showBandwidthEstimation,
                         "show or hide bandwidth estimation info");
  optParser.add_long_opt("localIP", &options.localIP,
                         "Local IP");

  if ((argc <= 1) || !optParser.parse_opts(argc, argv)) {
    std::ostringstream strStream;
    optParser.print_usage(argv[0], strStream);
    std::cout << strStream.str() << std::endl;
    return -1;
  }

  if (options.appId.empty()) {
    AG_LOG(ERROR, "Must provide appId!");
    return -1;
  }

  if (options.channelId.empty()) {
    AG_LOG(ERROR, "Must provide channelId!");
    return -1;
  }

  setLogger(quietLogger);

  printf("Starting Agora Streaming with dynamic video switching support\n");
  printf("Commands: SWITCH_VIDEO:<url> or EXIT\n");
  printf("Initial video: %s\n", options.videoFile.c_str());

  std::signal(SIGQUIT, SignalHandler);
  std::signal(SIGABRT, SignalHandler);
  std::signal(SIGINT, SignalHandler);

  // Initialize playlist manager
  PlaylistManager playlistManager;
  if (!playlistManager.initialize(options.videoFile)) {
    AG_LOG(ERROR, "Failed to initialize playlist manager for %s", options.videoFile.c_str());
    return -1;
  }

  // Start command processing thread
  std::thread commandThread(processStdinCommands);

  // Determine if we need string UID support
  bool useStringUid = false;
  if (!options.userId.empty() && !isInteger(options.userId)) {
    useStringUid = true;
  }

  // Create Agora service
  auto service = createAndInitAgoraService(false, true, true, useStringUid);
  if (!service) {
    AG_LOG(ERROR, "Failed to creating Agora service!");
    return -1;
  }

  // Create Agora connection
  agora::rtc::RtcConnectionConfiguration ccfg;
  ccfg.autoSubscribeAudio = false;
  ccfg.autoSubscribeVideo = false;
  ccfg.clientRoleType = agora::rtc::CLIENT_ROLE_BROADCASTER;
  agora::agora_refptr<agora::rtc::IRtcConnection> connection = service->createRtcConnection(ccfg);
  if (!connection) {
    AG_LOG(ERROR, "Failed to creating Agora connection!");
    return -1;
  }

  if (!options.localIP.empty()) {
    if (setLocalIP(connection, options.localIP)){
      AG_LOG(ERROR, "set local IP to %s error!", options.localIP.c_str());
      return -1;
    }
  }

  // Register connection observer to monitor connection event
  auto connObserver = std::make_shared<SampleConnectionObserver>();
  connection->registerObserver(connObserver.get());

  // Register network observer to monitor bandwidth estimation result
  if (options.video.showBandwidthEstimation) {
    connection->registerNetworkObserver(connObserver.get());
  }

  // Create local user observer to monitor intra frame request
  auto localUserObserver = std::make_shared<SampleLocalUserObserver>(connection->getLocalUser());

  // Connect to Agora channel (using string UID)
  const char* userIdForConnect = options.userId.empty() ? "0" : options.userId.c_str();
  if (connection->connect(options.appId.c_str(), options.channelId.c_str(), userIdForConnect)) {
    AG_LOG(ERROR, "Failed to connect to Agora channel!");
    return -1;
  }

  // Create media node factory
  agora::agora_refptr<agora::rtc::IMediaNodeFactory> factory = service->createMediaNodeFactory();
  if (!factory) {
    AG_LOG(ERROR, "Failed to create media node factory!");
  }

  // Create video frame sender
  agora::agora_refptr<agora::rtc::IVideoEncodedImageSender> videoFrameSender =
      factory->createVideoEncodedImageSender();
  if (!videoFrameSender) {
    AG_LOG(ERROR, "Failed to create video frame sender!");
    return -1;
  }

  agora::rtc::SenderOptions option;
  option.ccMode = agora::rtc::TCcMode::CC_ENABLED;
  // Create video track
  agora::agora_refptr<agora::rtc::ILocalVideoTrack> customVideoTrack =
      service->createCustomVideoTrack(videoFrameSender, option);
  if (!customVideoTrack) {
    AG_LOG(ERROR, "Failed to create video track!");
    return -1;
  }

  // Publish video track
  connection->getLocalUser()->publishVideo(customVideoTrack);

  // Wait until connected before sending media stream
  connObserver->waitUntilConnected(DEFAULT_CONNECT_TIMEOUT_MS);

  if (!options.localIP.empty()) {
    std::string ip;
    getLocalIP(connection, ip);
    AG_LOG(INFO, "Local IP:%s", ip.c_str());
  }

  // Start sending video data
  AG_LOG(INFO, "Start sending video data from %s...", options.videoFile.c_str());
  printf("Process ready for commands. Current video: %s\n", playlistManager.getCurrentVideoFile().c_str());
  
  std::thread sendVideoThread(SampleSendVideoH264Task, options, videoFrameSender, std::ref(playlistManager));

  // Wait for threads to complete
  sendVideoThread.join();
  
  // Signal command thread to exit and wait
  exitFlag = true;
  if (commandThread.joinable()) {
    commandThread.join();
  }

  // Unpublish video track
  connection->getLocalUser()->unpublishVideo(customVideoTrack);

  // Unregister connection observer
  connection->unregisterObserver(connObserver.get());

  // Unregister network observer
  connection->unregisterNetworkObserver(connObserver.get());

  // Disconnect from Agora channel
  if (connection->disconnect()) {
    AG_LOG(ERROR, "Failed to disconnect from Agora channel!");
    return -1;
  }
  AG_LOG(INFO, "Disconnected from Agora channel successfully");

  // Destroy Agora connection and related resources
  connObserver.reset();
  localUserObserver.reset();
  videoFrameSender = nullptr;
  customVideoTrack = nullptr;
  factory = nullptr;
  connection = nullptr;

  // Destroy Agora Service
  service->release();
  service = nullptr;

  printf("Shutdown complete\n");
  return 0;
}
