# Gallery Seed Import Guide

Quick reference for importing official Gallery works via manifest JSON + local images.

## Prerequisites

- `COS_BASE_PATH` environment variable set (e.g. `/mnt/cos`)
- Backend running with `gallery_works` table migrated
- Admin/operator access to the server filesystem

## Manifest Format

Create a JSON manifest file describing all gallery works:

```json
{
  "works": [
    {
      "slug": "cyberpunk-poster-01",
      "title": "霓虹都市",
      "category": "poster",
      "tags": ["科幻", "赛博朋克"],
      "prompt": "A cinematic movie poster for a cyberpunk thriller...",
      "imageFile": "poster_cyberpunk.png",
      "sortOrder": 10
    }
  ]
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `slug` | Yes | URL-friendly unique identifier. Stable — same slug re-imports update the existing work (idempotent). |
| `title` | Yes | Display title shown on cards and detail page. |
| `category` | Yes | One of: `poster`, `product`, `character`, `scene`, `brand`, `storyboard`. |
| `tags` | No | Array of 1-3 display tags shown on cards (e.g. `["科幻", "赛博朋克"]`). |
| `prompt` | Yes | Full prompt text — only shown on the detail page via the info icon popover. |
| `imageFile` | Yes | Filename inside the image directory (see below). Supported: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`. |
| `sortOrder` | No | Integer for display ordering (default 0). Lower values appear first. Leave gaps (10, 20, 30…) for easy insertion later. |
| `publishedAt` | No | ISO 8601 timestamp for publish date. Defaults to import time. |

## Directory Structure

```
/opt/imports/gallery-v1/
├── manifest.json
└── images/
    ├── poster_cyberpunk.png
    ├── product_headphones.png
    └── ...
```

Image files must exist at `{imageDir}/{imageFile}` relative to the `imageDir` path passed to the import command.

## Import Commands

### Via API (authenticated)

```bash
curl -X POST http://localhost:PORT/api/platform/gallery/import \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "manifestPath": "/opt/imports/gallery-v1/manifest.json",
    "imageDir": "/opt/imports/gallery-v1/images"
  }'
```

### Via CLI script (planned)

```
bun run packages/openimago/src/scripts/import-gallery.ts \
  --manifest /opt/imports/gallery-v1/manifest.json \
  --images /opt/imports/gallery-v1/images
```

## Import Behavior

- **Idempotent**: Re-running with the same slug updates the existing work (title, prompt, tags, image) without creating duplicates.
- **File storage**: Images are copied to `{COS_BASE_PATH}/gallery/{slug}/original.{ext}` with thumbnails at `{COS_BASE_PATH}/gallery/{slug}/thumbnail.{ext}`.
- **Thumbnails**: Currently a copy of the original (no resize capability yet — marked `THUMBNAIL_PLACEHOLDER` in code). Future: resize to 400px width WebP.
- **Response**: Returns `{ result: { total, created, updated, failed, errors } }`.

## Quick Start with Sample Data

Create a minimal manifest to test the Gallery:

```bash
mkdir -p /tmp/gallery-seed/images

# Create a minimal PNG (1x1 pixel)
echo -n '' > /tmp/gallery-seed/images/test.png

# Actually, use a real image file. For quick testing:
# Place any .png file at /tmp/gallery-seed/images/sample.png

cat > /tmp/gallery-seed/manifest.json << 'EOF'
{
  "works": [
    {
      "slug": "sample-poster",
      "title": "示例海报",
      "category": "poster",
      "tags": ["示例", "测试"],
      "prompt": "A sample poster for testing the Gallery import pipeline.",
      "imageFile": "sample.png",
      "sortOrder": 10
    }
  ]
}
EOF

# Then use the API import command above with:
#   "manifestPath": "/tmp/gallery-seed/manifest.json"
#   "imageDir": "/tmp/gallery-seed/images"
```

## Category Reference

| Value | Chinese | Typical Content |
|-------|---------|----------------|
| `poster` | 海报 | Movie/event poster style images |
| `product` | 产品 | Product renders, e-commerce shots |
| `character` | 角色 | Character design, concept art |
| `scene` | 场景 | Environment scenes, landscapes |
| `brand` | 品牌 | Brand identity, VI design |
| `storyboard` | 分镜 | Storyboards, comic panels |
