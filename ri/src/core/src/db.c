#include "scoot.h"

#include <libpq-fe.h>
#include <stddef.h>

static PGconn *conn = NULL;

int db_connect(const char *conninfo) {
    if (conn) db_disconnect();

    conn = PQconnectdb(conninfo);
    if (PQstatus(conn) != CONNECTION_OK) {
        db_disconnect();
        return -1;
    }
    return 0;
}

int db_is_connected(void) {
    return conn != NULL && PQstatus(conn) == CONNECTION_OK;
}

void db_disconnect(void) {
    if (conn) {
        PQfinish(conn);
        conn = NULL;
    }
}
