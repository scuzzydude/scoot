#ifndef SCOOT_H
#define SCOOT_H

#include <cjson/cJSON.h>
#include <stddef.h>
#include <time.h>

/* ---- parallel.c : pthread thread pool ---- */

typedef struct threadpool threadpool_t;

threadpool_t *threadpool_create(size_t num_threads);
/* Hands ownership of fd to the pool; job_fn must close fd when done. */
int threadpool_submit(threadpool_t *pool, void (*job_fn)(int fd), int fd);
void threadpool_destroy(threadpool_t *pool);

/* ---- protocol.c : newline-delimited JSON request loop ---- */

/* Reads/dispatches/responds on fd until the peer closes or a fatal error
 * occurs. Always closes fd before returning. Never crashes on bad input. */
void protocol_handle_connection(int fd);

/* ---- commands.c : command dispatch table ---- */

/* Returns a newly-allocated cJSON response object (never NULL, never
 * includes req_id — protocol.c stamps that on). Caller owns the result. */
cJSON *commands_dispatch(const cJSON *request);

/* main.c calls this once at startup so get_chain_status can report real
 * runtime info without commands.c reaching into global daemon state. */
void commands_set_runtime_info(const char *mode, size_t threads, time_t start_time);

/* ---- db.c : Postgres connectivity (libpq) ---- */

int db_connect(const char *conninfo); /* returns 0 on success */
int db_is_connected(void);
void db_disconnect(void);

#endif /* SCOOT_H */
