CC      := cc
STD     := -std=c11
WARN    := -Wall -Wextra
INCLUDES := -Iinclude -I/usr/include/postgresql -D_POSIX_C_SOURCE=200809L
LIBS    := -lpthread -lcjson -lpq

SRC_DIR := src
OBJ_DIR := obj
BIN_DIR := bin
BIN     := $(BIN_DIR)/scootd

SRCS := $(wildcard $(SRC_DIR)/*.c)
OBJS := $(patsubst $(SRC_DIR)/%.c,$(OBJ_DIR)/%.o,$(SRCS))

CFLAGS  ?= -g -O0
override CFLAGS += $(STD) $(WARN) $(INCLUDES)

.PHONY: all clean

all: $(BIN)

$(BIN): $(OBJS) | $(BIN_DIR)
	$(CC) $(OBJS) -o $@ $(LIBS)

$(OBJ_DIR)/%.o: $(SRC_DIR)/%.c include/scoot.h | $(OBJ_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

$(OBJ_DIR) $(BIN_DIR):
	mkdir -p $@

clean:
	rm -rf $(OBJ_DIR) $(BIN_DIR)
