#include "scoot.h"

#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

#define DEFAULT_SOCKET "/tmp/scootd.sock"
#define LISTEN_BACKLOG 128

static volatile sig_atomic_t shutdown_requested = 0;
static int listen_fd = -1;

static void handle_shutdown_signal(int sig) {
    (void)sig;
    shutdown_requested = 1;
    if (listen_fd >= 0) close(listen_fd); /* close() is async-signal-safe */
}

static void install_signal_handlers(void) {
    struct sigaction sa = {0};
    sa.sa_handler = handle_shutdown_signal;
    sigaction(SIGINT, &sa, NULL);
    sigaction(SIGTERM, &sa, NULL);

    /* a client closing its socket must not kill the daemon on write() */
    signal(SIGPIPE, SIG_IGN);
}

static int create_listen_socket(const char *path) {
    int fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (fd < 0) {
        perror("socket");
        return -1;
    }

    struct sockaddr_un addr = {0};
    addr.sun_family = AF_UNIX;
    if (strlen(path) >= sizeof(addr.sun_path)) {
        fprintf(stderr, "[scootd] socket path too long: %s\n", path);
        close(fd);
        return -1;
    }
    strncpy(addr.sun_path, path, sizeof(addr.sun_path) - 1);

    unlink(path); /* remove a stale socket from a prior crash/exit */

    if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("bind");
        close(fd);
        return -1;
    }

    if (listen(fd, LISTEN_BACKLOG) < 0) {
        perror("listen");
        close(fd);
        unlink(path);
        return -1;
    }

    return fd;
}

static size_t default_thread_count(void) {
    long n = sysconf(_SC_NPROCESSORS_ONLN);
    return n > 0 ? (size_t)n : 1;
}

int main(int argc, char **argv) {
    const char *socket_path = getenv("SCOOTD_SOCKET");
    if (!socket_path) socket_path = DEFAULT_SOCKET;
    const char *mode = "cpu";
    size_t threads = default_thread_count();

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--socket") == 0 && i + 1 < argc) {
            socket_path = argv[++i];
        } else if (strcmp(argv[i], "--threads") == 0 && i + 1 < argc) {
            threads = (size_t)atoi(argv[++i]);
            if (threads == 0) threads = 1;
        } else if (strcmp(argv[i], "--mode") == 0 && i + 1 < argc) {
            mode = argv[++i];
        } else if (strcmp(argv[i], "--help") == 0) {
            printf("usage: %s [--socket PATH] [--threads N] [--mode cpu|gpu]\n", argv[0]);
            return 0;
        }
    }

    if (strcmp(mode, "cpu") != 0) {
        fprintf(stderr, "[scootd] mode '%s' not implemented — no HIP/CUDA kernels yet, use --mode cpu\n", mode);
        return 1;
    }

    const char *database_url = getenv("DATABASE_URL");
    if (database_url) {
        if (db_connect(database_url) == 0) {
            fprintf(stderr, "[scootd] connected to database\n");
        } else {
            fprintf(stderr, "[scootd] warning: could not connect to database, continuing without it\n");
        }
    } else {
        fprintf(stderr, "[scootd] no DATABASE_URL set, continuing without db\n");
    }

    install_signal_handlers();

    listen_fd = create_listen_socket(socket_path);
    if (listen_fd < 0) {
        db_disconnect();
        return 1;
    }

    threadpool_t *pool = threadpool_create(threads);
    if (!pool) {
        fprintf(stderr, "[scootd] failed to start thread pool\n");
        close(listen_fd);
        unlink(socket_path);
        db_disconnect();
        return 1;
    }

    commands_set_runtime_info(mode, threads, time(NULL));

    fprintf(stderr, "[scootd] listening on %s (mode=%s threads=%zu)\n", socket_path, mode, threads);

    while (!shutdown_requested) {
        int client_fd = accept(listen_fd, NULL, NULL);
        if (client_fd < 0) {
            if (errno == EINTR) continue;
            break; /* socket closed by the signal handler, or a real error */
        }
        if (threadpool_submit(pool, protocol_handle_connection, client_fd) != 0) {
            close(client_fd);
        }
    }

    fprintf(stderr, "[scootd] shutting down\n");
    threadpool_destroy(pool);
    if (listen_fd >= 0) close(listen_fd);
    unlink(socket_path);
    db_disconnect();

    return 0;
}
