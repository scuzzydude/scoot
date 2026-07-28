#include "scoot.h"

#include <string.h>

typedef cJSON *(*command_fn)(const cJSON *request);

static struct {
    const char *mode;
    size_t threads;
    time_t start_time;
} runtime = {"cpu", 1, 0};

void commands_set_runtime_info(const char *mode, size_t threads, time_t start_time) {
    runtime.mode = mode;
    runtime.threads = threads;
    runtime.start_time = start_time;
}

static cJSON *not_implemented(void) {
    cJSON *res = cJSON_CreateObject();
    cJSON_AddBoolToObject(res, "ok", 0);
    cJSON_AddStringToObject(res, "error", "not implemented");
    return res;
}

static cJSON *cmd_get_balance(const cJSON *request) {
    (void)request;
    return not_implemented();
}

static cJSON *cmd_get_transactions(const cJSON *request) {
    (void)request;
    return not_implemented();
}

static cJSON *cmd_send(const cJSON *request) {
    (void)request;
    return not_implemented();
}

static cJSON *cmd_get_address(const cJSON *request) {
    (void)request;
    return not_implemented();
}

static cJSON *cmd_validate_block(const cJSON *request) {
    (void)request;
    return not_implemented();
}

static cJSON *cmd_mine_block(const cJSON *request) {
    (void)request;
    return not_implemented();
}

static cJSON *cmd_get_chain_status(const cJSON *request) {
    (void)request;

    cJSON *res = cJSON_CreateObject();
    cJSON_AddBoolToObject(res, "ok", 1);
    cJSON_AddStringToObject(res, "mode", runtime.mode);
    cJSON_AddNumberToObject(res, "threads", (double)runtime.threads);
    cJSON_AddNumberToObject(res, "uptime_seconds",
                             (double)(time(NULL) - runtime.start_time));
    cJSON_AddNumberToObject(res, "block_height", 0);
    cJSON_AddBoolToObject(res, "db_connected", db_is_connected());
    return res;
}

static const struct {
    const char *name;
    command_fn fn;
} COMMANDS[] = {
    {"get_balance", cmd_get_balance},
    {"get_transactions", cmd_get_transactions},
    {"send", cmd_send},
    {"get_address", cmd_get_address},
    {"validate_block", cmd_validate_block},
    {"mine_block", cmd_mine_block},
    {"get_chain_status", cmd_get_chain_status},
};

cJSON *commands_dispatch(const cJSON *request) {
    const cJSON *cmd = cJSON_GetObjectItemCaseSensitive(request, "cmd");
    if (!cJSON_IsString(cmd) || !cmd->valuestring) {
        cJSON *res = cJSON_CreateObject();
        cJSON_AddBoolToObject(res, "ok", 0);
        cJSON_AddStringToObject(res, "error", "missing cmd");
        return res;
    }

    for (size_t i = 0; i < sizeof(COMMANDS) / sizeof(COMMANDS[0]); i++) {
        if (strcmp(COMMANDS[i].name, cmd->valuestring) == 0) {
            return COMMANDS[i].fn(request);
        }
    }

    cJSON *res = cJSON_CreateObject();
    cJSON_AddBoolToObject(res, "ok", 0);
    cJSON_AddStringToObject(res, "error", "unknown command");
    return res;
}
