#include "scoot.h"

#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>

typedef struct job {
    void (*fn)(int fd);
    int fd;
    struct job *next;
} job_t;

struct threadpool {
    pthread_t *threads;
    size_t num_threads;

    pthread_mutex_t lock;
    pthread_cond_t work_ready;
    job_t *head;
    job_t *tail;

    int shutting_down;
};

static void *worker_main(void *arg) {
    threadpool_t *pool = arg;

    for (;;) {
        pthread_mutex_lock(&pool->lock);
        while (!pool->head && !pool->shutting_down) {
            pthread_cond_wait(&pool->work_ready, &pool->lock);
        }
        if (!pool->head && pool->shutting_down) {
            pthread_mutex_unlock(&pool->lock);
            break;
        }

        job_t *job = pool->head;
        pool->head = job->next;
        if (!pool->head) pool->tail = NULL;
        pthread_mutex_unlock(&pool->lock);

        job->fn(job->fd);
        free(job);
    }

    return NULL;
}

threadpool_t *threadpool_create(size_t num_threads) {
    if (num_threads == 0) num_threads = 1;

    threadpool_t *pool = calloc(1, sizeof(*pool));
    if (!pool) return NULL;

    pool->threads = calloc(num_threads, sizeof(pthread_t));
    if (!pool->threads) {
        free(pool);
        return NULL;
    }
    pool->num_threads = num_threads;
    pthread_mutex_init(&pool->lock, NULL);
    pthread_cond_init(&pool->work_ready, NULL);

    for (size_t i = 0; i < num_threads; i++) {
        if (pthread_create(&pool->threads[i], NULL, worker_main, pool) != 0) {
            /* best-effort: shrink the pool to what actually started */
            pool->num_threads = i;
            break;
        }
    }

    if (pool->num_threads == 0) {
        pthread_mutex_destroy(&pool->lock);
        pthread_cond_destroy(&pool->work_ready);
        free(pool->threads);
        free(pool);
        return NULL;
    }

    return pool;
}

int threadpool_submit(threadpool_t *pool, void (*job_fn)(int fd), int fd) {
    if (!pool || !job_fn) return -1;

    job_t *job = malloc(sizeof(*job));
    if (!job) return -1;
    job->fn = job_fn;
    job->fd = fd;
    job->next = NULL;

    pthread_mutex_lock(&pool->lock);
    if (pool->shutting_down) {
        pthread_mutex_unlock(&pool->lock);
        free(job);
        return -1;
    }
    if (pool->tail) {
        pool->tail->next = job;
    } else {
        pool->head = job;
    }
    pool->tail = job;
    pthread_cond_signal(&pool->work_ready);
    pthread_mutex_unlock(&pool->lock);

    return 0;
}

void threadpool_destroy(threadpool_t *pool) {
    if (!pool) return;

    pthread_mutex_lock(&pool->lock);
    pool->shutting_down = 1;
    pthread_cond_broadcast(&pool->work_ready);
    pthread_mutex_unlock(&pool->lock);

    for (size_t i = 0; i < pool->num_threads; i++) {
        pthread_join(pool->threads[i], NULL);
    }

    /* Drain any jobs left queued past shutdown (their fds were handed to us
     * for closing). */
    job_t *job = pool->head;
    while (job) {
        job_t *next = job->next;
        close(job->fd);
        free(job);
        job = next;
    }

    pthread_mutex_destroy(&pool->lock);
    pthread_cond_destroy(&pool->work_ready);
    free(pool->threads);
    free(pool);
}
