const AWS = require("aws-sdk");
const sharp = require("sharp");

const s3 = new AWS.S3();

const ORIGINAL_BUCKET = process.env.FILE_UPLOAD_BUCKET_NAME;
const COMPRESSED_BUCKET = process.env.FILE_UPLOAD_COMPRESSED_BUCKET_NAME;

module.exports.handler = async (event) => {
    console.log(event);

    const response = {
        // tells Api gateway that the body is plain json and not binary
        isBase64Encoded: false,
        statusCode: 200,
        body: JSON.stringify({ message: "Successfully uploaded file to S3" }),
    };

    try {

        // file: A base64-encoded string (optionally with a data URL prefix like data:image/png;base64,...).
        // fileKey: The S3 object key (filename) to store the file under.
        const parsedBody = JSON.parse(event.body);
        const base64 = parsedBody.file;
        const key = parsedBody.fileKey;

        console.log("base64 version", base64);

        // Try to infer content type from data URL, default to image/jpeg
        const dataUrlMatch = /^data:([^;]+);base64,/.exec(base64 || "");
        const contentType = dataUrlMatch ? dataUrlMatch[1] : "image/jpeg";

        // Decode original image/file

        // Buffer.from creates a new Buffer containing string. The encoding parameter identifies the character encoding to be used when converting string into bytes.

        // Removes the data URL prefix from the base64 string and decodes the base64 string into a binary buffer.

        // This buffer is the actual file content to upload.


        //         // 1. Client sends this base64 string:
        // "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

        // // 2. Your code strips the prefix:
        // "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

        // // 3. Your code converts to Buffer (bytes):
        // Buffer<89 50 4E 47 0D 0A 1A 0A 00 00 00 0D 49 48 44 52 ...>

        // // 4. S3 stores these exact bytes:
        // 89 50 4E 47 0D 0A 1A 0A 00 00 00 0D 49 48 44 52 ...
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
            // Compress the image (convert to JPEG with reasonable quality) and convert it to buffer(binary)
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
