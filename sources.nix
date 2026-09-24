# Upstream release pins. LIVI publishes one AppImage per architecture and each
# has its own hash, so both live here rather than inside the package expression.
# Bumping `version` means re-hashing both assets: `nix hash file --type sha256
# --sri <appimage>`.
let
  version = "8.2.1";

  assetFor =
    system:
    if builtins.hasAttr system assets then
      assets.${system}
    else
      throw "kube-livi: no LIVI release asset for ${system} (known: ${builtins.concatStringsSep ", " (builtins.attrNames assets)})";

  assets = {
    aarch64-linux = {
      suffix = "arm64";
      hash = "sha256-3JrUwp6HoiSEuzjw996PZk3tYnvUwqocvReSvVod+h8=";
    };
    x86_64-linux = {
      suffix = "x86_64";
      hash = "sha256-EtApB9WQC3YrDFCyf0zymwQlfU2dwSzDl4bv1wfvZxs=";
    };
  };
in
{
  inherit version assets;

  urlFor =
    system:
    let
      asset = assetFor system;
    in
    "https://github.com/f-io/LIVI/releases/download/v${version}/LIVI-${version}-linux-${asset.suffix}.AppImage";

  hashFor = system: (assetFor system).hash;
}
