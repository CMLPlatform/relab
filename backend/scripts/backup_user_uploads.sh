#!/bin/sh
### This script creates backups of user uploads with rotation and size limits.

set -e

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Configuration with defaults
UPLOADS_DIR="${UPLOADS_DIR:-$SCRIPT_DIR/../data/uploads}"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/../backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
BACKUP_KEEP_WEEKS="${BACKUP_KEEP_WEEKS:-4}"
BACKUP_KEEP_MONTHS="${BACKUP_KEEP_MONTHS:-6}"
MAX_TOTAL_GB="${MAX_TOTAL_GB:-100}"
COMPRESSION_FMT="${COMPRESSION_FMT:-zst}"

# Logging function
log() {
    echo "[$(date)] $*"
}

# Validation function
validate_directories() {
    # Validate uploads directory
    if [ ! -d "${UPLOADS_DIR}" ]; then
        log "Error: UPLOADS_DIR '${UPLOADS_DIR}' does not exist or is not a directory"
        exit 1
    fi

    if [ ! -r "${UPLOADS_DIR}" ]; then
        log "Error: UPLOADS_DIR '${UPLOADS_DIR}' is not readable"
        exit 1
    fi

    # Validate backup directory (create if missing, then check permissions)
    if [ ! -d "${BACKUP_DIR}" ]; then
        log "Creating backup directory: ${BACKUP_DIR}"
        if ! mkdir -p "${BACKUP_DIR}"; then
            log "Error: Cannot create BACKUP_DIR '${BACKUP_DIR}'"
            exit 1
        fi
    fi

    # Check backup directory permissions
    if [ ! -d "${BACKUP_DIR}" ] || [ ! -w "${BACKUP_DIR}" ] || [ ! -x "${BACKUP_DIR}" ]; then
        log "Error: BACKUP_DIR '${BACKUP_DIR}' has insufficient permissions (needs read/write/execute)"
        exit 1
    fi
}

# Ensure backup subdirectories exist
setup_backup_subdirectories() {
    log "Setting up backup directories..."
    mkdir -p "${BACKUP_DIR}/daily" "${BACKUP_DIR}/weekly" "${BACKUP_DIR}/monthly"
}

# Generate file paths
generate_backup_paths() {
    DATE="$(date +%Y-%m-%d)"
    WEEK="$(date +%G-%V)"
    MONTH="$(date +%Y-%m)"

    DAILY_FILE="${BACKUP_DIR}/daily/user_uploads-${DATE}.tar.${COMPRESSION_FMT}"
    WEEKLY_FILE="${BACKUP_DIR}/weekly/user_uploads-${WEEK}.tar.${COMPRESSION_FMT}"
    MONTHLY_FILE="${BACKUP_DIR}/monthly/user_uploads-${MONTH}.tar.${COMPRESSION_FMT}"
}

# Create the main backup
create_daily_backup() {
    log "Creating backup: ${DAILY_FILE}"

    if ! tar caf "${DAILY_FILE}" -C "${UPLOADS_DIR}" .; then
        log "Error: Failed to create backup"
        exit 1
    fi

    log "Daily backup successful: ${DAILY_FILE}"
}

# Create hard links for weekly/monthly backups
create_backup_links() {
    # Create weekly backup (hard link if doesn't exist)
    if [ ! -f "${WEEKLY_FILE}" ]; then
        ln "${DAILY_FILE}" "${WEEKLY_FILE}"
        log "Created weekly backup: ${WEEKLY_FILE}"
    fi

    # Create monthly backup (hard link if doesn't exist)
    if [ ! -f "${MONTHLY_FILE}" ]; then
        ln "${DAILY_FILE}" "${MONTHLY_FILE}"
        log "Created monthly backup: ${MONTHLY_FILE}"
    fi
}

# Clean up old backups by age
cleanup_old_backups() {
    log "Cleaning up old backups..."

    # Daily backups
    find "${BACKUP_DIR}/daily" -name "user_uploads-*.tar.${COMPRESSION_FMT}" \
        -mtime +"${BACKUP_KEEP_DAYS}" -delete 2>/dev/null || true

    # Weekly backups
    find "${BACKUP_DIR}/weekly" -name "user_uploads-*.tar.${COMPRESSION_FMT}" \
        -mtime +$((BACKUP_KEEP_WEEKS * 7)) -delete 2>/dev/null || true

    # Monthly backups
    find "${BACKUP_DIR}/monthly" -name "user_uploads-*.tar.${COMPRESSION_FMT}" \
        -mtime +$((BACKUP_KEEP_MONTHS * 30)) -delete 2>/dev/null || true
}

# Enforce size limits
enforce_size_limit() {
    log "Enforcing size limit of ${MAX_TOTAL_GB}GB..."
    MAX_BYTES=$((MAX_TOTAL_GB * 1024 * 1024 * 1024))

    while true; do
        # Calculate current total size
        CURRENT_SIZE=$(find "${BACKUP_DIR}" -name "user_uploads-*.tar.${COMPRESSION_FMT}" \
            -exec stat -c %s {} + 2>/dev/null | awk '{sum+=$1} END{print sum+0}')

        # Break if under limit
        if [ "${CURRENT_SIZE}" -le "${MAX_BYTES}" ]; then
            break
        fi

        # Find and remove oldest backup
        OLDEST=$(find "${BACKUP_DIR}" -name "user_uploads-*.tar.${COMPRESSION_FMT}" \
            -printf '%T@ %p\n' 2>/dev/null | sort -n | head -n1 | cut -d' ' -f2-)

        if [ -n "${OLDEST}" ] && [ -f "${OLDEST}" ]; then
            rm -f "${OLDEST}"
            log "Removed old backup (size limit): ${OLDEST}"
        else
            log "Warning: Could not find files to remove for size limit"
            break
        fi
    done
}

# Show final status
show_final_status() {
    TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" 2>/dev/null | awk '{print $1}' || echo "unknown")
    log "Backup completed. Total size: ${TOTAL_SIZE}"
}

# Main execution
main() {
    log "Starting user uploads backup..."

    validate_directories
    setup_backup_subdirectories
    generate_backup_paths
    create_daily_backup
    create_backup_links
    cleanup_old_backups
    enforce_size_limit
    show_final_status

    log "Backup process completed successfully"
}

# Run main function
main "$@"
