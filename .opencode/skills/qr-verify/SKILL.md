---
name: qr-verify
description: Screencap the emulator, decode the on-screen QR with zbarimg, and assert the payload equals the expected Google Review URL. Trigger when the user asks to verify a QR code decodes correctly, check the generated review link, or validate the QR on screen.
---

# qr-verify

Captures the live framebuffer and confirms the QR rendered by DOZO decodes to
the expected Google Review URL.

## Capture

```sh
adb exec-out screencap -p > /tmp/dozo_qr.png
```

`exec-out` streams raw PNG bytes (no CRLF mangling); `-p` forces PNG format.

## Decode

```sh
zbarimg --quiet --raw /tmp/dozo_qr.png
```

- `--quiet` suppresses the `scanned N barcodes` chatter.
- `--raw` prints only the decoded payload.

## Assert the payload

Expected value (replace with the real review link):

```sh
EXPECTED="https://g.page/r/EXAMPLE/review"
ACTUAL=$(zbarimg --quiet --raw /tmp/dozo_qr.png 2>/dev/null)
[ "$ACTUAL" = "$EXPECTED" ] && echo "PASS: $ACTUAL" || echo "FAIL: got '$ACTUAL'"
```

Exit non-zero on mismatch for scripting:

```sh
zbarimg --quiet --raw /tmp/dozo_qr.png | grep -qxF "$EXPECTED" \
  && echo PASS || { echo "FAIL: expected $EXPECTED"; exit 1; }
```

## Cleanup

```sh
rm -f /tmp/dozo_qr.png
```

## Notes

- The app cycles the QR roughly every ~15s; capture during the QR phase. If no
  symbol is found, `zbarimg` prints nothing and exits non-zero — retry the
  capture.
- Crop to the QR region if the full screen confuses the decoder, e.g. with
  ImageMagick: `magick /tmp/dozo_qr.png -crop 600x600+90+340 +repage /tmp/qr_crop.png`.
- Ensure the screen is on and unlocked: `adb shell input keyevent KEYCODE_WAKEUP`.
- A successful decode proves the payload; it does not prove the link is live.
