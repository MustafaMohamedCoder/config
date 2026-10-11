"""Huawei home-router configuration decoder.

Supports exported configuration files for DG8045 and HG633. The constants and
layout follow the upstream research referenced in RESEARCH.md. No files are
written; callers receive XML bytes and verification metadata.
"""
from __future__ import annotations

import base64
import re
import zlib
from binascii import hexlify, unhexlify
from typing import Any

from Crypto.Cipher import AES
from Crypto.Hash import MD5
from Crypto.Util import number

AES256CBC_KEY = unhexlify(
    "65CE89619D8929CDCF998D42D74C59E3B4E11CFCAE5927760A78E18061D2145C"
)
PWD_KEY = unhexlify("0386DDC2789180D4B9A0CDB52126DEBB")
DG8045_RSA_N = int(
    "B1AAE240AE798C9051E97745519F737A4F5E82902CAA630420EC5B0F6FE64926CA9D766811C354C951E58B479603715945F344DEA71A72106E1BA10FF72721DFC7C5273A808ADF2F8A39BEB2D03370A87749E778F2135A1625FFFBBFB17631A3207C9E129105F3E7DCE0AFA654321597F9B2026BD197AEABF2F03B1EB8137F1D",
    16,
)
HG633_RSA_N = int(
    "9CFDDA6E973A127866386467435998E77B92E28C345043372260EB60F90D9DA6EC7446A9A475E24E22E3D933DEB157A817E0298EF579B91B7F894BA18C4117EF129458E4FDF5EBF959FD9A6B5D3F337A6EA7F06C03B2CD5F8F7F8BAA6B3605CC21108A97206BE965BC654389C54A71F48C2100D19587F7852E300F8BE0FE09CD",
    16,
)
HG633_IV = unhexlify("85AE4578D5A1BD0758E8349AE0335F0A")
HG633_PWD_IV = unhexlify("1A5F11D8D619537E23EB9B8FF4A238AF")
SUPPORTED_MODELS = {"dg8045", "hg633"}
ZLIB_HEADERS = (b"\x78\x9c", b"\x78\x01", b"\x78\x5e", b"\x78\xda")
XML_ROOT_CLOSE = b"</InternetGatewayDeviceConfig>"


def normalize_model(model: str | None) -> str:
    value = (model or "dg8045").strip().lower().replace("-", "")
    if value not in SUPPORTED_MODELS:
        raise ValueError("موديل Huawei غير مدعوم. المتاح حالياً: DG8045 أو HG633.")
    return value


def _decompress_payload(data: bytes) -> bytes:
    try:
        return zlib.decompress(data)
    except zlib.error:
        for header in ZLIB_HEADERS:
            start = data.find(header)
            if start >= 0:
                try:
                    return zlib.decompress(data[start:])
                except zlib.error:
                    continue
    raise ValueError(
        "تعذر العثور على بيانات zlib صالحة؛ تأكد من أن الملف نسخة إعدادات Huawei وليست Firmware."
    )


def _decrypt_password(value: str, model: str) -> str:
    try:
        data = base64.b64decode(value, validate=True)
        if model == "dg8045":
            if len(data) < 64:
                return value
            iv, payload = data[48:64], data[64:]
        else:
            iv, payload = HG633_PWD_IV, data
        if not payload or len(payload) % AES.block_size:
            return value
        return AES.new(PWD_KEY, AES.MODE_CBC, iv).decrypt(payload).rstrip(b"\0").decode(
            "utf-8", errors="ignore"
        )
    except (ValueError, TypeError, UnicodeError):
        return value


def _decode_passwords(xml: str, model: str) -> str:
    if model == "dg8045":
        pattern = re.compile(r'="([A-Za-z0-9+/]+={0,2})"')
        return pattern.sub(lambda m: f'="{_decrypt_password(m.group(1), model)}"' if m.group(1).startswith("AQAAAB") else m.group(0), xml)
    pattern = re.compile(r'"([A-Za-z0-9+/]+={0,2})"')
    return pattern.sub(lambda m: f'"{_decrypt_password(m.group(1), model)}"' if m.group(1).startswith("AQAAAB") else m.group(0), xml)


def decode_huawei_bytes(raw: bytes, model: str | None = None) -> tuple[bytes, dict[str, Any]]:
    model = normalize_model(model)
    if not raw:
        raise ValueError("ملف Huawei فارغ.")
    if model == "dg8045":
        if len(raw) < 0x50:
            raise ValueError("ملف DG8045 قصير أو غير صالح.")
        config_iv, encrypted = raw[48:64], raw[0x50:]
        rsa_n = DG8045_RSA_N
    else:
        config_iv, encrypted, rsa_n = HG633_IV, raw, HG633_RSA_N
    if len(encrypted) == 0 or len(encrypted) % AES.block_size:
        raise ValueError("طول الحمولة المشفرة غير صالح لملف Huawei.")
    try:
        decrypted = AES.new(AES256CBC_KEY, AES.MODE_CBC, config_iv).decrypt(encrypted)
        unpacked = _decompress_payload(decrypted)
    except (ValueError, zlib.error) as exc:
        raise ValueError("تعذر فك ملف Huawei بهذا الموديل؛ تحقق من الموديل وإصدار Firmware.") from exc
    if len(unpacked) <= 0x80:
        raise ValueError("الحمولة المفكوكة لا تحتوي على XML كامل.")
    config, signature = unpacked[:-0x80], unpacked[-0x80:]
    decoded_signature = number.long_to_bytes(pow(int(hexlify(signature), 16), 0x10001, rsa_n), 128)
    signature_verified = MD5.new(config.rstrip(b"\0")).hexdigest().encode() == hexlify(decoded_signature)[-32:]
    config = config.rstrip(b"\0")
    start, end = config.find(b"<?xml"), config.rfind(XML_ROOT_CLOSE)
    if start < 0 or end < 0:
        raise ValueError("الحمولة المفكوكة لا تحتوي على XML Huawei كاملاً.")
    xml = _decode_passwords(config[start:end + len(XML_ROOT_CLOSE)].decode("utf-8", errors="ignore"), model).encode("utf-8")
    return xml, {"router_type": "huawei", "huawei_model": model, "signature_verified": signature_verified, "passwords_decoded": True}
