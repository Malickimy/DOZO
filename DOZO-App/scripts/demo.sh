#!/usr/bin/env bash
#
# demo.sh - One-command DOZO demo rehearsal wrapper (Sprint 5).
#
# Runs the scripted demo sequence on the DX8000 AVD, exactly as the sprint note
# describes: dozo_boot, then dozo_trigger_intent approved -> canceled -> approved.
# Optional steps add the mockpay interactive backup path and the QR assertion.
#
# The wrapper only orchestrates the existing scripts; each step can still be run
# by hand when a demo needs to be driven slowly.
#
# Environment overrides:
#   DOZO_APP_DIR   project root       (default: this script's parent directory)
#   SERIAL         target device      (default: emulator-5554)
#   DEMO_PAUSE     seconds between simulated sales (default: 4)
#   DEMO_EXPECT_URL expected QR URL for --verify-qr (default: dozo_verify_qr's)

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DOZO_APP_DIR="${DOZO_APP_DIR:-$(cd -- "$SCRIPT_DIR/.." && pwd)}"
ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ADB="${ADB:-$ANDROID_HOME/platform-tools/adb}"
SERIAL="${SERIAL:-emulator-5554}"
DEMO_PAUSE="${DEMO_PAUSE:-4}"
DEMO_EXPECT_URL="${DEMO_EXPECT_URL:-}"

skip_boot=0
with_mockpay=0
verify_qr=0

usage() {
    cat <<EOF
Usage: demo.sh [--skip-boot] [--mockpay] [--verify-qr] [--pause SECONDS] [-h|--help]

Rehearse the DOZO demo sequence on the DX8000 AVD:
  1. dozo_boot                          (unless --skip-boot)
  2. dozo_trigger_intent --approved
  3. dozo_trigger_intent --canceled
  4. dozo_trigger_intent --approved

Options:
  --skip-boot        reuse the already-running emulator
  --mockpay          also deploy and launch Mock Pay (interactive backup path)
  --verify-qr        run dozo_verify_qr after the final approved sale
  --pause SECONDS    delay between simulated sales (default: \$DEMO_PAUSE or 4)
  -h, --help         show this help

Environment overrides:
  DOZO_APP_DIR    project root       (default: this script's parent directory)
  SERIAL          target device      (default: emulator-5554)
  DEMO_PAUSE      seconds between simulated sales (default: 4)
  DEMO_EXPECT_URL expected QR URL for --verify-qr (default: dozo_verify_qr's)
EOF
}

die() { echo "demo.sh: $*" >&2; exit 2; }

while (( $# )); do
    case "$1" in
        -h|--help)   usage; exit 0 ;;
        --skip-boot) skip_boot=1; shift ;;
        --mockpay)   with_mockpay=1; shift ;;
        --verify-qr) verify_qr=1; shift ;;
        --pause)     [[ $# -ge 2 ]] || die "--pause requires a value"; DEMO_PAUSE="$2"; shift 2 ;;
        --pause=*)   DEMO_PAUSE="${1#*=}"; shift ;;
        -*)          die "unknown option: $1" ;;
        *)           die "unexpected argument: $1" ;;
    esac
done

if [[ ! "$DEMO_PAUSE" =~ ^[0-9]+$ ]]; then
    die "--pause must be a non-negative integer, got: $DEMO_PAUSE"
fi

BOOT="$DOZO_APP_DIR/scripts/dozo_boot"
TRIGGER="$DOZO_APP_DIR/scripts/dozo_trigger_intent"
MOCKPAY="$DOZO_APP_DIR/scripts/mockpay_deploy"
VERIFY="$DOZO_APP_DIR/scripts/dozo_verify_qr"

for script in "$BOOT" "$TRIGGER"; do
    [[ -x "$script" ]] || die "required script not executable: $script"
done
if (( with_mockpay )); then
    [[ -x "$MOCKPAY" ]] || die "required script not executable: $MOCKPAY"
fi
if (( verify_qr )); then
    [[ -x "$VERIFY" ]] || die "required script not executable: $VERIFY"
fi

echo "DOZO demo rehearsal"
echo "  project: $DOZO_APP_DIR"
echo "  serial:  $SERIAL"
echo
echo "Checklist:"
echo "  [ ] Dashboard open on the analytics tab"
echo "  [ ] Display enabled in the dashboard"
echo "  [ ] Approved sale shows the QR; canceled/refused close silently"

if (( skip_boot )); then
    echo
    echo "==> [1/4] dozo_boot (skipped)"
else
    echo
    echo "==> [1/4] dozo_boot"
    "$BOOT"
fi

echo
echo "==> [2/4] approved sale"
"$TRIGGER" --approved
sleep "$DEMO_PAUSE"

echo
echo "==> [3/4] canceled sale"
"$TRIGGER" --canceled
sleep "$DEMO_PAUSE"

echo
echo "==> [4/4] approved sale"
"$TRIGGER" --approved

if (( verify_qr )); then
    echo
    echo "==> verify QR payload"
    if [[ -n "$DEMO_EXPECT_URL" ]]; then
        "$VERIFY" --expect "$DEMO_EXPECT_URL"
    else
        "$VERIFY"
    fi
fi

if (( with_mockpay )); then
    echo
    echo "==> mockpay backup path"
    "$MOCKPAY"
    echo "==> launching Mock Pay"
    "$ADB" -s "$SERIAL" shell am start -n \
        com.example.dozo.mockpay/.MockPayActivity
fi

echo
echo "demo.sh: sequence complete."
