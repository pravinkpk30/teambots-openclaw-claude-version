#!/usr/bin/env bash
# Generates a random 64-char hex token for TEAMBOTS_SECRET
echo "TEAMBOTS_SECRET=$(openssl rand -hex 32)"
