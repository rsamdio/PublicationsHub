#!/usr/bin/env bash
# Grant the permission needed for @google-cloud/storage getSignedUrl() from Cloud Functions (2nd gen).
# Without this, prepareEditionPdfUpload fails with IAM/signing errors (HTTP 400 failed-precondition).
#
# Usage:
#   ./scripts/grant-storage-signed-url-iam.sh rsapublicationhub
#   ./scripts/grant-storage-signed-url-iam.sh rsapublicationhub YOUR-SA@developer.gserviceaccount.com
#
# To see which service account your function uses: Google Cloud Console → Cloud Run →
# prepareEditionPdfUpload → Security → Service account.
set -euo pipefail

PROJECT_ID="${1:?Usage: $0 PROJECT_ID [service_account_email]}"

grant_on_self() {
  local sa="$1"
  if ! gcloud iam service-accounts describe "$sa" --project="$PROJECT_ID" &>/dev/null; then
    echo "Skipping (not found): $sa"
    return 0
  fi
  echo "Granting roles/iam.serviceAccountTokenCreator on $sa to itself..."
  gcloud iam service-accounts add-iam-policy-binding "$sa" \
    --member="serviceAccount:${sa}" \
    --role="roles/iam.serviceAccountTokenCreator" \
    --project="$PROJECT_ID"
}

if [[ -n "${2:-}" ]]; then
  grant_on_self "$2"
else
  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
  grant_on_self "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
  grant_on_self "${PROJECT_ID}@appspot.gserviceaccount.com"
fi

echo "Done. No function redeploy needed. Retry a large PDF upload."
