// bind-localhost.dylib (incident I-241): makes a process's wildcard listen sockets loopback-only.
// ios_webkit_debug_proxy has no bind-address option: sm_listen() binds INADDR_ANY (src/socket_manager.c, v1.9.2
// 278bf487 and master), so :9221 and the tab ports :9222-9322 answered on every interface, Safari's inspector included.
// Loaded with DYLD_INSERT_LIBRARIES (tools/lib/usblink.mjs startProxy, built there with cc), this interposes bind()
// (dyld's __DATA,__interpose, <mach-o/dyld-interposing.h>): an AF_INET bind to 0.0.0.0 becomes 127.0.0.1 and an
// AF_INET6 bind to :: becomes ::1; every other bind is passed on unchanged. Inside the interposing image, `bind` is the
// original (dyld does not interpose an image's own calls). Works only for binaries without the hardened runtime or with
// com.apple.security.cs.allow-dyld-environment-variables (Homebrew's ad-hoc signed iwdp qualifies); startProxy checks
// the listener's address afterwards and refuses a proxy that still listens on all interfaces.
#include <netinet/in.h>
#include <string.h>
#include <sys/socket.h>

// dyld's macro (apple-oss-distributions/dyld include/mach-o/dyld-interposing.h at fd8d0c4d52, lines 54-58), whose
// header the macOS SDK does not ship; the ptrauth schema there is empty for arm64/x86_64 (only arm64e signs it).
#define DYLD_INTERPOSE(_replacement, _replacee) \
  __attribute__((used)) static struct { const void *replacement; const void *replacee; } _interpose_##_replacee \
    __attribute__((section("__DATA,__interpose,interposing"))) = { (const void *)(unsigned long)&_replacement, (const void *)(unsigned long)&_replacee };

static int fw_bind_localhost(int fd, const struct sockaddr *addr, socklen_t len) {
  if (addr && addr->sa_family == AF_INET && len >= (socklen_t)sizeof(struct sockaddr_in)) {
    struct sockaddr_in a;
    memcpy(&a, addr, sizeof a);
    if (a.sin_addr.s_addr == htonl(INADDR_ANY)) {
      a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
      return bind(fd, (const struct sockaddr *)&a, sizeof a);
    }
  } else if (addr && addr->sa_family == AF_INET6 && len >= (socklen_t)sizeof(struct sockaddr_in6)) {
    struct sockaddr_in6 a;
    memcpy(&a, addr, sizeof a);
    if (!memcmp(&a.sin6_addr, &in6addr_any, sizeof a.sin6_addr)) {
      a.sin6_addr = in6addr_loopback;
      return bind(fd, (const struct sockaddr *)&a, sizeof a);
    }
  }
  return bind(fd, addr, len);
}
DYLD_INTERPOSE(fw_bind_localhost, bind)
