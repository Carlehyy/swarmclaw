# Electron Build Resources

Place app icons here before running `npm run electron:build`:

- `icon.icns`: macOS (1024x1024 source recommended)
- `icon.ico`: Windows (256x256 multi-resolution)
- `icon.png`: Linux (512x512)

If these are missing, electron-builder uses its default placeholder icon.
Generate `.icns` and `.ico` from a single 1024×1024 PNG with
[`electron-icon-builder`](https://www.npmjs.com/package/electron-icon-builder)
or similar tools.
