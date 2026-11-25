# Shared by container/run and container/browse. Sourced, not executed.

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Sets $dev_image to the development image's tag, building the image first if
# it is missing or if the first argument is 1.
ensure_dev_image() {
  local rebuild="${1:-0}" manifest="$root/package.json"
  local pnpm_version playwright_version recipe

  pnpm_version="$(sed -nE 's/.*"packageManager": *"pnpm@([0-9][^"+]*).*/\1/p' "$manifest")"
  playwright_version="$(sed -nE 's/.*"@playwright\/test": *"([0-9][^"]*)".*/\1/p' "$manifest")"
  if [[ -z "$pnpm_version" || -z "$playwright_version" ]]; then
    echo "package.json must pin exact versions of pnpm (packageManager) and @playwright/test" >&2
    return 1
  fi

  recipe="$(sha256sum "$root/container/Containerfile" | cut -c1-8)"
  dev_image="localhost/xorganize-dev:pnpm${pnpm_version}-pw${playwright_version}-${recipe}"

  if ((rebuild)) || ! podman image exists "$dev_image"; then
    podman build \
      --build-arg "PNPM_VERSION=$pnpm_version" \
      --build-arg "PLAYWRIGHT_VERSION=$playwright_version" \
      --tag "$dev_image" \
      --file "$root/container/Containerfile" \
      "$root/container" >&2
  fi
}
