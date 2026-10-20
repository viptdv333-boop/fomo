# ALGOPACK: TLS trust for apim.moex.com

The ALGOPACK gateway `https://apim.moex.com` is signed by the **Russian Trusted Root CA** (Минцифры). Node's bundled CA list does not
contain it, so without a fix every ALGOPACK call fails with `SELF_SIGNED_CERT_IN_CHAIN` (the order book and the ALGOPACK tabs then say
"temporarily unavailable").

We do **not** use `NODE_EXTRA_CA_CERTS`: it widens trust for *all* outbound requests of the process (Bybit, YooKassa, T-Invest, mail ...).
Instead `src/lib/algopack-tls.ts` gives requests to `apim.moex.com` (and only to it) a dedicated undici `Agent` whose CA list is Node's
default roots plus the PEM named by **`ALGOPACK_CA_FILE`**. All other hosts, and a local mock (`ALGOPACK_BASE=http://localhost...`), keep the
default trust. Verification is never disabled. If the file is missing or not a certificate, one warning is logged
(`[algopack] ALGOPACK_CA_FILE ignored (...)`, no secrets) and the default trust is used.

All gateway calls go through `apFetch` (exported from `src/lib/algopack.ts`); `scripts/probe-algopack.ts` uses it too.

## Server setup (once per server; the Russian root is already in the OS store, `curl` trusts it)

```bash
# 1. find the one certificate in the OS bundle and write it to a file
mkdir -p /opt/fomo/certs && rm -rf /tmp/rca && mkdir /tmp/rca && cd /tmp/rca
awk '/BEGIN CERTIFICATE/{n++} {print > sprintf("c%03d.pem", n)}' /etc/ssl/certs/ca-certificates.crt
for f in c*.pem; do
  openssl x509 -in "$f" -noout -subject 2>/dev/null | grep -qi 'Russian Trusted Root CA' && cp "$f" /opt/fomo/certs/russian-root-ca.pem
done
cd / && rm -rf /tmp/rca

# 2. check it is the right one (expect: CN = Russian Trusted Root CA, issuer the same, a future notAfter)
openssl x509 -in /opt/fomo/certs/russian-root-ca.pem -noout -subject -issuer -enddate
# the gateway must verify against only this file:
curl -sS -o /dev/null -w '%{http_code} ssl_verify=%{ssl_verify_result}\n' --cacert /opt/fomo/certs/russian-root-ca.pem https://apim.moex.com/iss/index.json
```

If the certificate is not in the bundle but was installed by hand, look in `/usr/local/share/ca-certificates/*.crt`
(`grep -l 'Russian Trusted' /usr/local/share/ca-certificates/* 2>/dev/null`) and `cp` that file instead.

```bash
# 3. point both instances at it (the terminal instance can share the file)
echo 'ALGOPACK_CA_FILE=/opt/fomo/certs/russian-root-ca.pem' >> /opt/fomo/.env
echo 'ALGOPACK_CA_FILE=/opt/fomo/certs/russian-root-ca.pem' >> /opt/fomo-terminal/.env
chmod 644 /opt/fomo/certs/russian-root-ca.pem        # a public certificate, not a secret

# 4. restart WITHOUT NODE_EXTRA_CA_CERTS (deploy-swap.sh no longer sets it)
cd /opt/fomo && git pull -q && bash scripts/deploy-swap.sh     # or just: pm2 restart <app> --update-env, with the variable unset

# 5. verify
cd /opt/fomo && npx tsx scripts/probe-algopack.ts SBER          # "raw fetch: 200 ..." and "ALGOPACK_CA_FILE: loaded"
for p in $(pm2 pid fomo) $(pm2 pid fomo-terminal); do tr '\0' '\n' < /proc/$p/environ | grep -c '^NODE_EXTRA_CA_CERTS=' ; done   # expect 0 0
```

If `NODE_EXTRA_CA_CERTS` is still in a pm2 process after the restart: `pm2 delete <app>` and start it again from a shell where the variable is
not exported (`unset NODE_EXTRA_CA_CERTS`), then `pm2 save`.

If the probe prints `UNABLE_TO_VERIFY_LEAF_SIGNATURE` / `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, the gateway does not send its intermediate: append
the "Russian Trusted Sub CA" certificate to the same PEM file (the loader accepts several certificates in one file).

The file is read once per process; after changing it restart the app.

## Checks

`npx tsx scripts/check-algopack-tls.ts` (offline; uses `openssl` to make a throw-away CA and a local HTTPS server): the extra CA is accepted
only through the dedicated agent, the default trust still rejects the same server, other hosts never get the CA, bad / missing files fall back.
