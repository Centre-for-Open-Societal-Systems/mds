#!/usr/bin/env bash
# Creates/refreshes the "ecr-pull" image pull secret in each namespace and attaches
# it to the namespace's default service account (the MDS pods use it).
# ECR tokens expire after 12 hours, so Jenkins re-runs this on every deploy and every 6 hours.
#
# Runs on the cluster node. The token comes on stdin so it never appears in argv:
#   aws ecr get-login-password | ecr-pull-secret.sh <registry> <namespace>...
set -euo pipefail
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}" PATH="$PATH:/var/lib/rancher/rke2/bin"

REGISTRY="$1"; shift
TOKEN="$(cat)"
[ -n "$TOKEN" ] || { echo "ecr-pull-secret: no token on stdin" >&2; exit 1; }

AUTH="$(printf 'AWS:%s' "$TOKEN" | base64 -w0)"
CONFIG="$(printf '{"auths":{"%s":{"username":"AWS","password":"%s","auth":"%s"}}}' \
          "$REGISTRY" "$TOKEN" "$AUTH" | base64 -w0)"

for ns in "$@"; do
  kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ecr-pull
  namespace: ${ns}
  labels: { app.kubernetes.io/part-of: openg2p-mds, app.kubernetes.io/managed-by: jenkins }
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: ${CONFIG}
EOF
  kubectl -n "$ns" patch serviceaccount default --type merge \
    -p '{"imagePullSecrets":[{"name":"ecr-pull"}]}'
done
