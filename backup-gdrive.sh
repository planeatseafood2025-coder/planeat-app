#!/bin/bash
# sync backup files ไป Google Drive
/usr/bin/rclone sync /root/planeat-app/backups/ gdrive:planeat-backup/   --include 'prod_*.gz'   --log-file /root/planeat-app/backups/gdrive-sync.log   --log-level INFO
echo "✅ Synced to Google Drive: $(date)"
