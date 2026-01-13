const AWS = require("aws-sdk");
const sharp = require("sharp");

const s3 = new AWS.S3();

const ORIGINAL_BUCKET = process.env.FILE_UPLOAD_BUCKET_NAME;
const COMPRESSED_BUCKET = process.env.FILE_UPLOAD_COMPRESSED_BUCKET_NAME;

module.exports.handler = async (event) => {
    console.log(event);

    const response = {
        isBase64Encoded: false,
        statusCode: 200,
        body: JSON.stringify({ message: "Successfully uploaded file to S3" }),
    };

    try {
        const parsedBody = JSON.parse(event.body);
        const base64 = parsedBody.file;
        const key = parsedBody.fileKey;

        console.log("base64 version", base64);

        // Try to infer content type from data URL, default to image/jpeg
        const dataUrlMatch = /^data:([^;]+);base64,/.exec(base64 || "");
        const contentType = dataUrlMatch ? dataUrlMatch[1] : "image/jpeg";

        // Decode original image/file
        const decodedFile = Buffer.from(
            base64.replace(/^data:[^;]+;base64,/, ""),
            "base64"
        );

        // Upload original file
        const originalParams = {
            Bucket: ORIGINAL_BUCKET,
            Key: key,
            Body: decodedFile,
            ContentType: contentType,
        };

        const originalUploadResult = await s3.upload(originalParams).promise();

        // If this is an image, create a compressed version and store it in the compressed bucket.
        let compressedUploadResult = null;
        if (contentType.startsWith("image/")) {
            const compressedBuffer = await sharp(decodedFile)
                .jpeg({ quality: 70 })
                .toBuffer();

            const compressedParams = {
                Bucket: COMPRESSED_BUCKET,
                Key: key,
                Body: compressedBuffer,
                ContentType: "image/jpeg",
            };

            compressedUploadResult = await s3
                .upload(compressedParams)
                .promise();
        }

        response.body = JSON.stringify({
            message:
                "Successfully uploaded original file to S3" +
                (compressedUploadResult
                    ? " and stored compressed image in compressed bucket"
                    : ""),
            originalUploadResult,
            compressedUploadResult,
        });
    } catch (err) {
        console.log(err);
        response.body = JSON.stringify({
            message: "File failed to upload to S3",
            errorMessage: err.message || err,
        });
        response.statusCode = 500;
    }

    return response;
};
