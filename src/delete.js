const AWS = require("aws-sdk");
const s3 = new AWS.S3();

const ORIGINAL_BUCKET = process.env.FILE_UPLOAD_BUCKET_NAME;
const COMPRESSED_BUCKET = process.env.FILE_UPLOAD_COMPRESSED_BUCKET_NAME;

module.exports.handler = async (event) => {
  console.log(event);

  const response = {
    isBase64Encoded: false,
    statusCode: 200,
  };

  try {
    const key = decodeURIComponent(event.pathParameters.fileKey);

    const deleteOriginal = s3
      .deleteObject({
        Bucket: ORIGINAL_BUCKET,
        Key: key,
      })
      .promise();

    const deleteCompressed = s3
      .deleteObject({
        Bucket: COMPRESSED_BUCKET,
        Key: key,
      })
      .promise();

    const [originalResult, compressedResult] = await Promise.all([
      deleteOriginal,
      deleteCompressed,
    ]);

    response.body = JSON.stringify({
      message: "successfully deleted file from both S3 buckets",
      originalResult,
      compressedResult,
    });
  } catch (err) {
    console.log(err);
    response.body = JSON.stringify({
      message: "failed to delete file from S3",
      errorMessage: err.message || err,
    });
    response.statusCode = 500;
  }

  return response;
};

