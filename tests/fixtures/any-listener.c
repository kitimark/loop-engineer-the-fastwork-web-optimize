// A listener that binds like ios_webkit_debug_proxy's sm_listen (incident I-241): AF_INET, INADDR_ANY, port 0, then
// listen(); with "6" as argv[1] also AF_INET6 on in6addr_any. Prints the address getsockname() reports ("127.0.0.1",
// "0.0.0.0", "::1", "::") one per line and exits. The tests compile it with cc (an ad-hoc signed binary, no hardened
// runtime, like Homebrew's iwdp) and run it with and without DYLD_INSERT_LIBRARIES=bind-localhost.dylib.
#include <arpa/inet.h>
#include <netinet/in.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

int main(int argc, char **argv) {
  int fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  struct sockaddr_in a;
  memset(&a, 0, sizeof a);
  a.sin_family = AF_INET;
  a.sin_addr.s_addr = INADDR_ANY;
  a.sin_port = 0;
  if (fd < 0 || bind(fd, (struct sockaddr *)&a, sizeof a) < 0 || listen(fd, 5) < 0) { perror("v4"); return 1; }
  socklen_t n = sizeof a;
  getsockname(fd, (struct sockaddr *)&a, &n);
  char buf[INET6_ADDRSTRLEN];
  printf("%s\n", inet_ntop(AF_INET, &a.sin_addr, buf, sizeof buf));
  close(fd);
  if (argc > 1 && strcmp(argv[1], "6") == 0) {
    int f6 = socket(AF_INET6, SOCK_STREAM, IPPROTO_TCP);
    struct sockaddr_in6 b;
    memset(&b, 0, sizeof b);
    b.sin6_family = AF_INET6;
    b.sin6_addr = in6addr_any;
    if (f6 < 0 || bind(f6, (struct sockaddr *)&b, sizeof b) < 0 || listen(f6, 5) < 0) { perror("v6"); return 1; }
    n = sizeof b;
    getsockname(f6, (struct sockaddr *)&b, &n);
    printf("%s\n", inet_ntop(AF_INET6, &b.sin6_addr, buf, sizeof buf));
    close(f6);
  }
  return 0;
}
