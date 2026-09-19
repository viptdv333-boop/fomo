# -*- coding: utf-8 -*-
"""vless2xray.py — конфиг Xray из vless:// ссылки (v2rayN → Share URL).

Босс 24.07.2026: Anthropic не обслуживает российские IP, у Босса есть свои
VLESS-серверы (v2rayN, USA-1/USA-2). Этот скрипт превращает ссылку из v2rayN
в конфиг Xray на сервере: локальный HTTP-прокси 127.0.0.1:10809 → VLESS.
Через него ходит ТОЛЬКО claude CLI (CLAUDE_CODE_PROXY в .env) — MOEX и
T-Invest остаются на прямом доступе.

Запуск (от root, Xray уже установлен):
    python tools/vless2xray.py 'vless://uuid@host:443?security=reality&...#USA-1'

Ссылку Босс вставляет САМ (в ней ключ доступа к его прокси) — скрипт её
никуда не отправляет, пишет только в конфиг Xray на этом же сервере.
"""
import json
import re
import sys
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

CONFIG_PATH = Path("/usr/local/etc/xray/config.json")
HTTP_PORT = 10809

# Веб-консоль Timeweb при вставке добавляет маркеры bracketed paste
# (\x1b[200~ … \x1b[201~) и прочие управляющие символы — вычищаем их,
# чтобы ссылка, вставленная «как получилось», всё равно распарсилась.
_CTRL = re.compile(r"\x1b\[[0-9;]*[~a-zA-Z]|[\x00-\x1f\x7f]")


def _clean(s: str) -> str:
    s = _CTRL.sub("", s)
    return s.strip().strip("'\"").strip("~").strip()


def parse_vless(link: str) -> dict:
    link = _clean(link)
    if not link.startswith("vless://"):
        raise SystemExit("Это не vless:// ссылка. В v2rayN: правой кнопкой по серверу → Share URL.")
    u = urlsplit(link)
    if not u.hostname or not u.username:
        raise SystemExit("В ссылке нет адреса или uuid — скопируй её из v2rayN целиком.")
    q = {k: v[0] for k, v in parse_qs(u.query).items()}
    return {
        "uuid": unquote(u.username),
        "host": u.hostname,
        "port": u.port or 443,
        "security": q.get("security", "none"),        # reality | tls | none
        "network": q.get("type", "tcp"),              # tcp | ws | grpc
        "flow": q.get("flow", ""),
        "sni": q.get("sni", q.get("serverName", "")),
        "pbk": q.get("pbk", ""),                      # reality public key
        "sid": q.get("sid", ""),                      # reality short id
        "spx": unquote(q.get("spx", "")) or "/",      # reality spiderX
        "fp": q.get("fp", "chrome"),                  # uTLS fingerprint
        "ws_path": unquote(q.get("path", "")) or "/",
        "ws_host": q.get("host", ""),
        "grpc_service": q.get("serviceName", ""),
        "name": unquote(u.fragment or ""),
    }


def build_config(p: dict) -> dict:
    user = {"id": p["uuid"], "encryption": "none"}
    if p["flow"]:
        user["flow"] = p["flow"]
    stream: dict = {"network": p["network"]}
    if p["security"] == "reality":
        if not p["pbk"]:
            raise SystemExit("В ссылке security=reality, но нет pbk (public key) — ссылка неполная.")
        stream["security"] = "reality"
        stream["realitySettings"] = {
            "publicKey": p["pbk"],
            "fingerprint": p["fp"],
            "serverName": p["sni"],
            "shortId": p["sid"],
            "spiderX": p["spx"],
        }
    elif p["security"] == "tls":
        stream["security"] = "tls"
        stream["tlsSettings"] = {"serverName": p["sni"] or p["host"], "fingerprint": p["fp"]}
    if p["network"] == "ws":
        stream["wsSettings"] = {"path": p["ws_path"],
                                "headers": ({"Host": p["ws_host"]} if p["ws_host"] else {})}
    elif p["network"] == "grpc":
        stream["grpcSettings"] = {"serviceName": p["grpc_service"]}
    return {
        "log": {"loglevel": "warning"},
        # HTTP-прокси строго на localhost: снаружи сервера не виден.
        "inbounds": [{"listen": "127.0.0.1", "port": HTTP_PORT, "protocol": "http",
                      "tag": "http-in"}],
        "outbounds": [{
            "protocol": "vless",
            "tag": "vless-out",
            "settings": {"vnext": [{"address": p["host"], "port": p["port"],
                                    "users": [user]}]},
            "streamSettings": stream,
        }],
    }


def main() -> None:
    if len(sys.argv) >= 2 and sys.argv[1] not in ("--stdin", "-"):
        # склейка argv: маркеры вставки могли разорвать ссылку на куски
        link = "".join(sys.argv[1:])
    else:
        # режим «вставь отдельно»: скрипт ждёт ссылку на своей строке —
        # мусор консольной вставки вычищается сам
        print("Вставь vless:// ссылку и нажми Enter:")
        link = sys.stdin.readline()
    p = parse_vless(link)
    cfg = build_config(p)
    if not CONFIG_PATH.parent.exists():
        raise SystemExit(f"Нет папки {CONFIG_PATH.parent} — сначала установи Xray (install-release.sh).")
    CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    masked = p["uuid"][:4] + "…" + p["uuid"][-4:]
    print(f"OK: конфиг записан в {CONFIG_PATH}")
    print(f"  сервер: {p['name'] or p['host']} → {p['host']}:{p['port']} "
          f"({p['security']}/{p['network']}), uuid {masked}")
    print(f"  локальный HTTP-прокси: http://127.0.0.1:{HTTP_PORT}")
    print("Дальше: systemctl restart xray")


if __name__ == "__main__":
    main()
