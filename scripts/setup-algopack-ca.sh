#!/bin/bash
# One-time server setup (docs/algopack-tls.md): take ONLY the Russian Trusted Root CA out of the system bundle into its own PEM file and point
# ALGOPACK_CA_FILE at it in both .env files, so the ALGOPACK client (and nothing else) trusts it. Idempotent.
# Run on the server:  cd /opt/fomo && git pull -q && bash scripts/setup-algopack-ca.sh
set -u
OUT=/opt/fomo/certs/russian-root-ca.pem
mkdir -p /opt/fomo/certs
TMP=$(mktemp -d)
cd "$TMP" || exit 1
awk '/BEGIN CERTIFICATE/{n++} {print > sprintf("c%03d.pem", n)}' /etc/ssl/certs/ca-certificates.crt
for f in c*.pem; do
  if openssl x509 -in "$f" -noout -subject 2>/dev/null | grep -qi 'Russian Trusted Root CA'; then cp "$f" "$OUT"; fi
done
cd / && rm -rf "$TMP"
if [ ! -s "$OUT" ]; then
  echo "NO RUSSIAN ROOT CA FOUND in /etc/ssl/certs/ca-certificates.crt"
  exit 1
fi
openssl x509 -in "$OUT" -noout -subject -enddate
curl -sS -o /dev/null -w 'curl with only this CA: %{http_code} ssl_verify=%{ssl_verify_result}\n' --cacert "$OUT" https://apim.moex.com/iss/index.json
for d in /opt/fomo /opt/fomo-terminal; do
  if grep -q '^ALGOPACK_CA_FILE=' "$d/.env"; then
    sed -i "s|^ALGOPACK_CA_FILE=.*|ALGOPACK_CA_FILE=$OUT|" "$d/.env"
  else
    echo "ALGOPACK_CA_FILE=$OUT" >> "$d/.env"
  fi
  echo "$d: $(grep -c '^ALGOPACK_CA_FILE=' "$d/.env") ALGOPACK_CA_FILE line"
done
echo SETUP DONE
