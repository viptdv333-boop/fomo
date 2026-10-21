# Russian root CA: scoped TLS trust (ALGOPACK gateway + T-Invest)

These hosts are signed by the **Russian Trusted Root CA** (Минцифры). Node's bundled CA list does not contain it, so without a fix every call
fails with `SELF_SIGNED_CERT_IN_CHAIN` (order book / ALGOPACK tabs "temporarily unavailable"; quotes fall back to the delayed ISS feed, no
T-Invest candle tail, no order flow, no seconds trades):

| host | used for | needs the root |
|---|---|---|
| `apim.moex.com` | ALGOPACK gateway | yes |
| `invest-public-api.tinkoff.ru` (https 443 and `wss://.../ws/...`) | T-Invest REST + MarketDataStream | yes |
| `sandbox-invest-public-api.tinkoff.ru` | T-Invest sandbox (demo trading) | yes (same operator; listed so the sandbox keeps working) |
| `iss.moex.com`, `www.moex.com`, Bybit, YooKassa, FMP, mail ... | everything else | no, default trust |

We do **not** use `NODE_EXTRA_CA_CERTS`: it widens trust for *all* outbound requests of the process. Instead `src/lib/algopack-tls.ts` gives
requests to exactly the hosts above (https for `fetch`, wss for the `ws` client, port 443, exact host match, no sub/look-alike domains) the CA list
Node's default roots + the PEM named by **`ALGOPACK_CA_FILE`** (alias **`RU_ROOT_CA_FILE`**, same meaning; `ALGOPACK_CA_FILE` wins when both are
set). All other hosts and local mocks keep the default trust. Verification is never disabled. If the file is missing or not a certificate, one
warning is logged (`[ru-ca] ... ignored (...)`, no secrets) and the default trust is used.

* `fetch`: `ruCaFetch(url, init)` (`apFetch` in `src/lib/algopack.ts` is an alias). Used by `/api/quote`, `/api/quotes` (`src/lib/quotes.ts`),
  `src/lib/tinkoff-candles.ts`, `src/lib/tinkoff-sandbox.ts`, `src/lib/orderflow/tinkoff.ts`, `src/lib/calendar/corporate.ts`,
  `server/price-streamer.ts`, `server/moex-trades.ts` (REST) and every ALGOPACK call.
* `ws`: `new WebSocket(url, protocols, { ..., ...ruCaWsOptions(url) })` in `server/moex-trades.ts` (`{ ca }` for an allowed wss host, `{}` otherwise).
* To add a host: put it in `RU_CA_HOSTS` only after a failed verification is proven on the server, and extend `scripts/check-algopack-tls.ts`.

`scripts/probe-algopack.ts` checks the ALGOPACK gateway and T-Invest `GetLastPrices` (status / error class only, never a token).

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
# 3. point both instances at it (the terminal instance can share the file; RU_ROOT_CA_FILE is an accepted alias)
echo 'ALGOPACK_CA_FILE=/opt/fomo/certs/russian-root-ca.pem' >> /opt/fomo/.env
echo 'ALGOPACK_CA_FILE=/opt/fomo/certs/russian-root-ca.pem' >> /opt/fomo-terminal/.env
chmod 644 /opt/fomo/certs/russian-root-ca.pem        # a public certificate, not a secret

# 4. restart WITHOUT NODE_EXTRA_CA_CERTS (deploy-swap.sh no longer sets it)
cd /opt/fomo && git pull -q && bash scripts/deploy-swap.sh     # or just: pm2 restart <app> --update-env, with the variable unset

# 5. verify
cd /opt/fomo && npx tsx scripts/probe-algopack.ts SBER          # "raw fetch: 200 ...", "T-Invest GetLastPrices: 200 ..." and "CA file ...: loaded"
for p in $(pm2 pid fomo) $(pm2 pid fomo-terminal); do tr '\0' '\n' < /proc/$p/environ | grep -c '^NODE_EXTRA_CA_CERTS=' ; done   # expect 0 0
```

If `NODE_EXTRA_CA_CERTS` is still in a pm2 process after the restart: `pm2 delete <app>` and start it again from a shell where the variable is
not exported (`unset NODE_EXTRA_CA_CERTS`), then `pm2 save`.

If the probe prints `UNABLE_TO_VERIFY_LEAF_SIGNATURE` / `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, the gateway does not send its intermediate: append
the "Russian Trusted Sub CA" certificate to the same PEM file (the loader accepts several certificates in one file).

The file is read once per process; after changing it restart the app.

## Checks

`npx tsx scripts/check-algopack-tls.ts` (offline; uses `openssl` to make a throw-away CA and a local HTTPS/WSS server): the extra CA is accepted
only through the dedicated agent / the ws `ca` option, the default trust still rejects the same server, only the listed hosts (exact, https/wss, 443)
get the CA, look-alike hosts and local mocks never do, bad / missing files fall back.
