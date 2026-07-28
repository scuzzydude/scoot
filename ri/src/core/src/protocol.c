#include "scoot.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define READ_CHUNK 4096
#define MAX_LINE_BYTES (1024 * 1024) /* 1 MiB — guards against unbounded growth */

typedef struct {
    char *data;
    size_t len;
    size_t cap;
} linebuf_t;

static int linebuf_append(linebuf_t *buf, const char *chunk, size_t chunk_len) {
    if (buf->len + chunk_len > MAX_LINE_BYTES) return -1;

    if (buf->len + chunk_len + 1 > buf->cap) {
        size_t new_cap = buf->cap ? buf->cap * 2 : READ_CHUNK;
        while (new_cap < buf->len + chunk_len + 1) new_cap *= 2;
        char *grown = realloc(buf->data, new_cap);
        if (!grown) return -1;
        buf->data = grown;
        buf->cap = new_cap;
    }

    memcpy(buf->data + buf->len, chunk, chunk_len);
    buf->len += chunk_len;
    buf->data[buf->len] = '\0';
    return 0;
}

static void send_line(int fd, cJSON *obj) {
    char *text = cJSON_PrintUnformatted(obj);
    if (!text) return;

    size_t len = strlen(text);
    /* best-effort write; a dead peer will surface via the next read()/EPIPE */
    ssize_t written = write(fd, text, len);
    (void)written;
    ssize_t nl = write(fd, "\n", 1);
    (void)nl;

    free(text);
}

static void handle_line(int fd, const char *line, size_t line_len) {
    cJSON *request = cJSON_ParseWithLength(line, line_len);
    if (!request) {
        cJSON *err = cJSON_CreateObject();
        cJSON_AddBoolToObject(err, "ok", 0);
        cJSON_AddStringToObject(err, "error", "invalid json");
        send_line(fd, err);
        cJSON_Delete(err);
        return;
    }

    cJSON *response = commands_dispatch(request);
    if (!response) {
        response = cJSON_CreateObject();
        cJSON_AddBoolToObject(response, "ok", 0);
        cJSON_AddStringToObject(response, "error", "internal error");
    }

    const cJSON *req_id = cJSON_GetObjectItemCaseSensitive(request, "req_id");
    if (cJSON_IsString(req_id) && req_id->valuestring) {
        cJSON_DeleteItemFromObjectCaseSensitive(response, "req_id");
        cJSON_AddStringToObject(response, "req_id", req_id->valuestring);
    }

    send_line(fd, response);

    cJSON_Delete(response);
    cJSON_Delete(request);
}

void protocol_handle_connection(int fd) {
    linebuf_t buf = {0};
    char chunk[READ_CHUNK];

    for (;;) {
        ssize_t n = read(fd, chunk, sizeof(chunk));
        if (n <= 0) break; /* peer closed, or a real error — either way, stop */

        if (linebuf_append(&buf, chunk, (size_t)n) != 0) {
            cJSON *err = cJSON_CreateObject();
            cJSON_AddBoolToObject(err, "ok", 0);
            cJSON_AddStringToObject(err, "error", "line too long");
            send_line(fd, err);
            cJSON_Delete(err);
            break;
        }

        char *start = buf.data;
        char *newline;
        while (buf.data && (newline = memchr(start, '\n', buf.len - (start - buf.data)))) {
            size_t line_len = (size_t)(newline - start);
            if (line_len > 0) handle_line(fd, start, line_len);
            start = newline + 1;
        }

        size_t remaining = buf.data ? buf.len - (size_t)(start - buf.data) : 0;
        if (remaining > 0 && start != buf.data) {
            memmove(buf.data, start, remaining);
        }
        buf.len = remaining;
        if (buf.data) buf.data[buf.len] = '\0';
    }

    free(buf.data);
    close(fd);
}
