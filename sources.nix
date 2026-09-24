# Upstream release pins. LIVI publishes one AppImage per architecture; each has
# its own hash, so both live here rather than in the package expression.
{
  version = "8.2.1";

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

  urlFor =
    system:
    let
      asset = assets.${system} or (throw "kube-livi: no LIVI release asset for ${system}");
    in
    "https://github.com/f-io/LIVI/releases/download/v${version}/LIVI-${version}-linux-${asset.suffix}.AppImage";
}
