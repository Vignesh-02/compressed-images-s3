# S3 File Upload API with Image Compression

A serverless REST API built on AWS that handles file uploads to S3 with automatic image compression. When an image is uploaded, it is stored in two S3 buckets — one for the original and one for a compressed copy — giving consumers the choice of which variant to retrieve.

## Architecture

```
Client
  │
  ▼
API Gateway (HTTP API)
  │
  ├── POST   /file             → upload.handler   → S3 (original + compressed)
  ├── GET    /file/{fileKey}   → get.handler      → S3
  └── DELETE /file/{fileKey}  → delete.handler   → S3 (both buckets)
```

**AWS services used:**
- **API Gateway** (HTTP API v2) — exposes the REST endpoints
- **Lambda** (Node.js 20.x) — runs the business logic
- **S3** — two private buckets: one for originals, one for compressed images

**Key libraries:**
- [`sharp`](https://sharp.pixelplumbing.com/) — high-performance image processing (JPEG compression at quality 70)
- `aws-sdk` v2 — AWS service integration
- `serverless-iam-roles-per-function` — scopes IAM permissions per Lambda function

## API Endpoints

### Upload a file
```
POST /file
```

**Request body (JSON):**
```json
{
  "file": "data:image/png;base64,<base64-encoded-content>",
  "fileKey": "my-photo.png"
}
```

- Accepts any file type encoded as a base64 data URL.
- If the file is an image, a compressed JPEG copy (quality 70) is automatically stored in the compressed bucket.

**Response:**
```json
{
  "message": "Successfully uploaded original file to S3 and stored compressed image in compressed bucket",
  "originalUploadResult": { ... },
  "compressedUploadResult": { ... }
}
```

---

### Retrieve a file
```
GET /file/{fileKey}
```

Returns the original file by default. Add `?variant=compressed` to get the compressed image.

```
GET /file/my-photo.png                    # original
GET /file/my-photo.png?variant=compressed # compressed (lazy-created if missing)
```

The compressed variant is created on-demand and cached in the compressed bucket for subsequent requests. Non-image files ignore the `?variant=compressed` flag and always return the original.

Response body is base64-encoded binary with the appropriate `Content-Type` header.

---

### Delete a file
```
DELETE /file/{fileKey}
```

Deletes the file from **both** buckets simultaneously.

**Response:**
```json
{
  "message": "successfully deleted file from both S3 buckets"
}
```

---

## Deployment

The project uses the [Serverless Framework](https://www.serverless.com/) and deploys automatically via GitHub Actions on every push to `main`.

### Prerequisites

- Node.js 20+
- [Serverless Framework CLI](https://www.serverless.com/framework/docs/getting-started) installed globally (`npm install -g serverless`)
- AWS credentials configured

### Manual deploy

```bash
npm install
serverless deploy
```

### CI/CD

GitHub Actions runs `serverless deploy` on every push to `main`. The workflow requires two repository secrets:

| Secret | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM access key with deploy permissions |
| `AWS_SECRET_ACCESS_KEY` | Corresponding secret key |

## Environment Variables

The Lambda functions read bucket names from environment variables set automatically by the Serverless Framework at deploy time. You do not need to set these manually.

| Variable | Description |
|---|---|
| `FILE_UPLOAD_BUCKET_NAME` | S3 bucket for original files |
| `FILE_UPLOAD_COMPRESSED_BUCKET_NAME` | S3 bucket for compressed images |

## Project Structure

```
.
├── src/
│   ├── upload.js   # POST /file — upload + compress
│   ├── get.js      # GET  /file/{fileKey} — retrieve (with lazy compression)
│   └── delete.js   # DELETE /file/{fileKey} — delete from both buckets
├── serverless.yml  # Infrastructure as code (API Gateway, Lambda, S3, IAM)
├── package.json
└── .github/
    └── workflows/
        └── main.yml  # CI/CD pipeline
```
