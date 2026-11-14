const { S3Client } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  endpoint: process.env.CLOUD_RU_ENDPOINT,
  region: 'ru-central-1', // Важно: регион для Cloud.ru
  credentials: {
    accessKeyId: process.env.CLOUD_RU_ACCESS_KEY,
    secretAccessKey: process.env.CLOUD_RU_SECRET_KEY,
  },
  forcePathStyle: true // Cloud.ru требует использования path-style
});

module.exports = s3;
