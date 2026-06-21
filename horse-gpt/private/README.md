# Private client data

This folder holds **paying advertising clients' private assets** and their
payment status. It is git-ignored (`/private/clients/` in `.gitignore`) and
must never be committed.

## Layout

```
private/clients/<clientId>/
  manifest.json     # metadata + payment status
  <asset files>     # images the client gave us (e.g. logo.png)
```

`<clientId>` must match the folder name and may only contain letters, digits,
`-` and `_`.

## manifest.json

```json
{
  "id": "acme",
  "name": "ACME Coffee Co.",
  "paid": true,
  "assets": [
    { "file": "logo.png", "label": "Brand logo (used as end-card)" }
  ]
}
```

- `paid` gates ad generation. While `false`, `/api/ads/generate` returns
  **402 Payment Required**. Flip it to `true` once the client has paid.
- Every file listed in `assets[].file` must actually exist in the folder.

## How a generation runs

1. `POST /api/ads/generate` with `{ clientId, endCardAsset, prompt? }`.
   - Confirms the client has paid and owns the asset.
   - Animates our brand horse (`public/horse_media/horse_background.png`) via
     PixVerse and returns a `videoId`.
2. Poll `GET /api/ads/status/<videoId>?clientId=<id>&endCardAsset=<file>`.
   - Returns `{ status: "processing" }` until ready.
   - When ready, appends the client's image as a branded end-card (via ffmpeg)
     and returns `{ status: "ready", url }`. If ffmpeg is unavailable (e.g. on
     Vercel), it falls back to the raw horse video URL.

The `_example/` folder is a committed template **only** because it lives under
the ignored path via an explicit copy — keep real client folders out of git.
