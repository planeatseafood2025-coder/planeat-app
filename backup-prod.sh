#!/bin/bash
BACKUP_DIR=/root/planeat-app/backups
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M%S)
FILE=$BACKUP_DIR/prod_$DATE.gz

docker exec planeat-mongodb mongodump \
  --uri="mongodb://planeat:planeat_mongo_pass_2024@localhost:27017/planeat?authSource=admin" \
  --archive --gzip > $FILE

find $BACKUP_DIR -name "prod_*.gz" -mtime +7 -delete
echo "✅ Backup: $FILE ($(du -sh $FILE | cut -f1))"
ls -lh $BACKUP_DIR
