const AWS = require("aws-sdk");
const sharp = require("sharp");

const s3 = new AWS.S3();

const ORIGINAL_BUCKET = process.env.FILE_UPLOAD_BUCKET_NAME;
const COMPRESSED_BUCKET = process.env.FILE_UPLOAD_COMPRESSED_BUCKET_NAME;

// If `?variant=compressed` is requested, lazily create and store a compressed copy
// in the compressed bucket when it doesn't already exist.

// Storage: S3 stores the raw bytes, not the base64 string.
// When someone downloads the file from S3, they get the raw bytes, which their browser or app interprets as an image.
module.exports.handler = async (event) => {
    try {
        // Validate pathParameters exists
        if (!event.pathParameters || !event.pathParameters.fileKey) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: "fileKey is required in path parameters",
                }),
            };
        }

        const key = decodeURIComponent(event.pathParameters.fileKey);
        const preferCompressed =
            event.queryStringParameters &&
            event.queryStringParameters.variant === "compressed";

        console.log("GET request:", {
            key,
            preferCompressed,
            originalBucket: ORIGINAL_BUCKET,
            compressedBucket: COMPRESSED_BUCKET,
        });

        // When compressed variant is explicitly requested, try to serve it and
        // create/store it in the compressed bucket if missing.
        if (preferCompressed) {
            try {
                const compressedObject = await s3
                    .getObject({
                        Bucket: COMPRESSED_BUCKET,
                        Key: key,
                    })
                    .promise();

                return {
                    statusCode: 200,
                    isBase64Encoded: true,
                    headers: {
                        "Content-Type":
                            compressedObject.ContentType ||
                            "application/octet-stream",
                        "Cache-Control": "public, max-age=3600",
                    },
                    body: compressedObject.Body.toString("base64"),
                };
            } catch (err) {
                if (err.code !== "NoSuchKey" && err.code !== "NotFound") {
                    throw err;
                }
                // fall through to lazy-compress if compressed variant not found
            }

            // Fetch the original object to create a compressed variant.
            const originalObject = await s3
                .getObject({
                    Bucket: ORIGINAL_BUCKET,
                    Key: key,
                })
                .promise();

            const originalContentType =
                originalObject.ContentType || "application/octet-stream";

            // If it's not an image, just return the original without attempting compression.
            if (!originalContentType.startsWith("image/")) {
                return {
                    statusCode: 200,
                    isBase64Encoded: true,
                    headers: {
                        "Content-Type": originalContentType,
                        "Cache-Control": "public, max-age=3600",
                    },
                    body: originalObject.Body.toString("base64"),
                };
            }

            // Compress the image (convert to JPEG with reasonable quality).
            // originalObject.Body has the raw bytes of the image.
            const compressedBuffer = await sharp(originalObject.Body)
                .jpeg({ quality: 70 })
                .toBuffer();

            // Store compressed object in the compressed bucket for future requests.
            await s3
                .putObject({
                    Bucket: COMPRESSED_BUCKET,
                    Key: key,
                    Body: compressedBuffer,
                    ContentType: "image/jpeg",
                })
                .promise();

            return {
                statusCode: 200,
                isBase64Encoded: true,
                headers: {
                    "Content-Type": "image/jpeg",
                    "Cache-Control": "public, max-age=3600",
                },
                body: compressedBuffer.toString("base64"),
            };
        }

        // Default behaviour: return the original file from the original bucket.
        const data = await s3
            .getObject({
                Bucket: ORIGINAL_BUCKET,
                Key: key,
            })
            .promise();

        return {
            statusCode: 200,
            isBase64Encoded: true,
            headers: {
                "Content-Type": data.ContentType || "application/octet-stream",
                "Cache-Control": "public, max-age=3600",
            },
            body: data.Body.toString("base64"),
        };
    } catch (err) {
        console.error("Error retrieving file:", {
            errorCode: err.code,
            errorMessage: err.message,
            key: event.pathParameters?.fileKey,
            originalBucket: ORIGINAL_BUCKET,
            compressedBucket: COMPRESSED_BUCKET,
            stack: err.stack,
        });

        // Return appropriate status code based on error type
        const statusCode =
            err.code === "NoSuchKey" || err.code === "NotFound" ? 404 : 500;

        return {
            statusCode,
            body: JSON.stringify({
                message: "failed to retrieve file from S3",
                errorMessage: err.message,
                errorCode: err.code,
                key: event.pathParameters?.fileKey,
                bucket: ORIGINAL_BUCKET,
            }),
        };
    }
};
