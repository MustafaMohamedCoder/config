from __future__ import annotations

import struct
import zlib
import xml.etree.ElementTree as ET
from io import BytesIO
from types import SimpleNamespace
from typing import Any

from flask import Flask, jsonify, render_template, request, send_file

import zcu
from zcu import constants
from zcu.known_keys import (
    KNOWN_KEYS,
    KNOWN_MODELS,
    TYPE_3_KNOWN_KEY_IVS,
    find_key,
    get_all_keys,
    run_all_keygens,
    run_any_keygen,
    run_keygens,
)
from zcu.xcryptors import CBCXcryptor, Xcryptor

app = Flask(__name__)
app.config.update(MAX_CONTENT_LENGTH=16 * 1024 * 1024, JSON_SORT_KEYS=False)

ALLOWED_PAYLOAD_TYPES = {0, 2, 3, 4}


class NamedBytesIO(BytesIO):
    """BytesIO with the name attribute expected by zcu.zte.read_header."""

    name = "uploaded-config.bin"


def _error(message: str, status: int = 400):
    return jsonify({"ok": False, "error": message}), status


def _text(value: Any, default: str = "") -> str:
    return str(value or default).strip()


def _read_container(raw: bytes) -> tuple[NamedBytesIO, dict[str, Any]]:
    if not raw:
        raise ValueError("الملف فارغ.")
    if raw[:4] == b"BAMC":
        raise ValueError("الملف يبدو Base64؛ ارفع ملف config.bin الثنائي الأصلي.")
    stream = NamedBytesIO(raw)
    include_header = raw[:16] == b"\x99\x99\x99\x99DDDDUUUU\xaa\xaa\xaa\xaa"
    little_endian = False
    version = 2
    if include_header:
        stream.read(16)
        header_bytes = stream.read(112)
        if len(header_bytes) != 112:
            raise ValueError("رأس الملف غير مكتمل.")
        big = struct.unpack(">28I", header_bytes)
        little = struct.unpack("<28I", header_bytes)
        # zcu supports both endian variants and stores version at index 12.
        header = little if little[2] == 4 and big[2] == 0x04000000 else big
        little_endian = header is little
        if header[2] != 4:
            raise ValueError("رأس ZTE غير صالح.")
        version = header[12] if little_endian else (header[12] >> 16 or header[12])
        stream.seek(128)
    else:
        stream.seek(0)
    try:
        signature = zcu.zte.read_signature(stream).decode("utf-8", errors="replace")
        payload_header = zcu.zte.read_payload(stream)
    except (struct.error, ValueError, UnicodeError) as exc:
        raise ValueError("تعذر قراءة بنية ملف ZTE؛ تأكد من أنه config.bin صالح.") from exc
    payload_type = payload_header[1]
    if payload_type not in ALLOWED_PAYLOAD_TYPES:
        raise ValueError(f"نوع الحمولة {payload_type} غير مدعوم في واجهة الويب الحالية.")
    metadata = {
        "signature": signature,
        "payload_type": payload_type,
        "include_header": include_header,
        "little_endian": little_endian,
        "version": version,
    }
    return stream, metadata


def _params(form, signature: str = "") -> SimpleNamespace:
    params = SimpleNamespace(signature=_text(form.get("signature")) or signature)
    for source, target in (("serial", "serial"), ("mac", "mac"), ("longpass", "longPass"),
                           ("key_prefix", "key_prefix"), ("iv_prefix", "iv_prefix"),
                           ("key_suffix", "key_suffix"), ("iv_suffix", "iv_suffix")):
        value = _text(form.get(source))
        if value:
            setattr(params, target, value)
    return params


def _key_candidates(mode: str, form, signature: str, payload_type: int):
    mode = _text(mode, "default")
    supplied_key = _text(form.get("custom_key"))
    supplied_iv = _text(form.get("custom_iv"))
    if mode == "custom":
        if not supplied_key:
            raise ValueError("أدخل المفتاح المخصص.")
        return [(supplied_key, supplied_iv or None, "مفتاح مخصص")]
    if mode.startswith("key:"):
        fixed = _text(mode[4:])
        if not fixed:
            raise ValueError("المفتاح الثابت فارغ.")
        return [(fixed, None, "مفتاح ثابت")]
    if mode.startswith("model:"):
        model = _text(mode[6:])
        if not model:
            raise ValueError("اختر موديل الراوتر.")
        return [(model, model, f"موديل {model}")]
    params = _params(form, signature)
    if mode == "serial":
        if not getattr(params, "serial", ""):
            raise ValueError("أدخل الرقم التسلسلي لاشتقاق المفتاح.")
        return [(key, iv, source) for key, iv, source in run_keygens(params) if source.startswith("serial:")]
    if mode == "tagparams":
        if not all(getattr(params, name, "") for name in ("serial", "mac", "longPass")):
            raise ValueError("وضع TagParams يحتاج الرقم التسلسلي وMAC وLong Password.")
        return [(key, iv, source) for key, iv, source in run_keygens(params) if source.startswith("tagparams:")]
    if mode == "signature":
        if not params.signature:
            raise ValueError("أدخل Signature لاشتقاق المفتاح.")
        return [(key, iv, source) for key, iv, source in run_keygens(params) if source.startswith("signature:")]
    # Default: infer from signature, then try all known static keys for Type 2.
    if payload_type == 2:
        inferred = find_key(signature) if signature else None
        keys = [inferred] if inferred else []
        keys.extend(get_all_keys())
        return [(key, None, "مفتاح معروف") for key in dict.fromkeys(k for k in keys if k)]
    if payload_type == 3:
        return [(model, model, f"موديل {model}") for model in KNOWN_MODELS] + [item for item in TYPE_3_KNOWN_KEY_IVS]
    if payload_type == 4:
        generated = run_keygens(params)
        return generated or run_all_keygens(params)
    return []


def decode_bytes(raw: bytes, form) -> tuple[bytes, dict[str, Any]]:
    stream, metadata = _read_container(raw)
    payload_type = metadata["payload_type"]
    # Position after the optional outer header, signature and 60-byte payload header.
    if metadata["include_header"]:
        stream.seek(128)
    else:
        stream.seek(0)
    zcu.zte.read_signature(stream)
    zcu.zte.read_payload(stream)
    payload_start = stream.tell()
    candidates = _key_candidates(_text(form.get("key_mode"), "default"), form, metadata["signature"], payload_type)
    if payload_type == 0:
        decrypted = stream
        used = "بدون تشفير"
    else:
        decryptor = Xcryptor() if payload_type == 2 else CBCXcryptor()
        decrypted = None
        used = None
        for key, iv, source in candidates:
            stream.seek(payload_start)
            decryptor.set_key(key, iv)
            try:
                candidate = decryptor.decrypt(stream)
                if zcu.zte.read_payload_type(candidate, raise_on_error=False) is not None:
                    decrypted, used = candidate, source
                    break
            except (ValueError, struct.error, TypeError):
                continue
        if decrypted is None:
            raise ValueError("تعذر فك التشفير بهذا المفتاح. جرّب Default أو الموديل/القيم الخاصة بالجهاز.")
    try:
        xml_stream, _ = zcu.compression.decompress(decrypted)
        xml_bytes = xml_stream.read()
        ET.fromstring(xml_bytes)
    except (zlib.error, struct.error, AssertionError, ET.ParseError) as exc:
        # Keep parser and compression details out of the public response.
        raise ValueError("تم فك المفتاح لكن المحتوى المضغوط أو XML غير صالح.")
    metadata["used_key_source"] = used
    metadata["key_mode"] = _text(form.get("key_mode"), "default")
    return xml_bytes, metadata


def _as_bool(value: str) -> bool:
    return _text(value).lower() in {"1", "true", "yes", "on"}


def encode_bytes(xml_bytes: bytes, form) -> bytes:
    try:
        ET.fromstring(xml_bytes)
    except ET.ParseError as exc:
        raise ValueError(f"XML غير صالح: {exc}") from exc
    try:
        payload_type = int(_text(form.get("payload_type"), "0"))
    except (TypeError, ValueError):
        raise ValueError("نوع الحمولة غير صالح.")
    if payload_type not in ALLOWED_PAYLOAD_TYPES:
        raise ValueError("نوع الحمولة غير مدعوم.")
    signature = _text(form.get("signature"))
    chunk_size = 65536
    compressed = zcu.compression.compress(BytesIO(xml_bytes), chunk_size)
    if payload_type == 0:
        payload = compressed
    else:
        candidates = _key_candidates(_text(form.get("key_mode"), "default"), form, signature, payload_type)
        if not candidates:
            raise ValueError("لا توجد بيانات كافية لتوليد مفتاح هذا النوع.")
        key, iv, _ = candidates[0]
        if payload_type == 2:
            payload = Xcryptor(key, chunk_size=chunk_size).encrypt(compressed)
        else:
            encryptor = CBCXcryptor(chunk_size=chunk_size, payload_type=payload_type)
            encryptor.set_key(key, iv)
            payload = encryptor.encrypt(compressed)
    try:
        version_number = int(_text(form.get("version"), "2"))
    except (TypeError, ValueError):
        raise ValueError("رقم الإصدار غير صالح.")
    version = version_number if _as_bool(form.get("little_endian")) else version_number << 16
    result = zcu.zte.add_header(payload, signature.encode("utf-8"), version,
                                include_header=_as_bool(form.get("include_header")),
                                little_endian=_as_bool(form.get("little_endian")))
    return result.read()


@app.get("/")
def index():
    models = sorted(set(KNOWN_MODELS) | {"ZXHN H168N V3.5", "ZXHN H298Q", "ZXHN H288A"})
    static_keys = [{"value": f"key:{key}", "label": label} for key, labels in KNOWN_KEYS.items() for label in labels]
    return render_template("index.html", models=models, static_keys=static_keys)


@app.get("/manus-routes.json")
def manus_routes():
    return jsonify({"routes": [{"path": "/", "title": "ZTE Config Studio"}]})


@app.post("/api/decode")
def api_decode():
    upload = request.files.get("file")
    if upload is None or not upload.filename:
        return _error("اختر ملف config.bin أولاً.")
    try:
        xml_bytes, metadata = decode_bytes(upload.read(), request.form)
        return jsonify({"ok": True, "xml": xml_bytes.decode("utf-8", errors="replace"), "metadata": metadata})
    except ValueError as exc:
        return _error(str(exc))
    except Exception:
        app.logger.exception("Unexpected decode error")
        return _error("حدث خطأ غير متوقع أثناء المعالجة. تحقق من الملف والقيم المدخلة.", 500)


@app.post("/api/encode")
def api_encode():
    xml = request.form.get("xml", "").encode("utf-8")
    if not xml.strip():
        return _error("محرر XML فارغ.")
    try:
        encoded = encode_bytes(xml, request.form)
        return send_file(BytesIO(encoded), mimetype="application/octet-stream", as_attachment=True, download_name="config.bin")
    except ValueError as exc:
        return _error(str(exc))
    except Exception:
        app.logger.exception("Unexpected encode error")
        return _error("حدث خطأ غير متوقع أثناء إعادة التشفير.", 500)


@app.post("/api/encode-upload")
def api_encode_upload():
    upload = request.files.get("xml_file")
    if upload is None or not upload.filename:
        return _error("اختر ملف XML أولاً.")
    try:
        encoded = encode_bytes(upload.read(), request.form)
        return send_file(
            BytesIO(encoded),
            mimetype="application/octet-stream",
            as_attachment=True,
            download_name="config.bin",
        )
    except ValueError as exc:
        return _error(str(exc))
    except Exception:
        app.logger.exception("Unexpected XML upload encode error")
        return _error("حدث خطأ غير متوقع أثناء تشفير ملف XML.", 500)


@app.post("/api/download-xml")
def api_download_xml():
    xml = request.form.get("xml", "").encode("utf-8")
    try:
        ET.fromstring(xml)
    except ET.ParseError as exc:
        return _error(f"XML غير صالح: {exc}")
    return send_file(BytesIO(xml), mimetype="application/xml", as_attachment=True, download_name="config.xml")


@app.errorhandler(413)
def too_large(_):
    return _error("حجم الملف يتجاوز الحد المسموح وهو 16 ميغابايت.", 413)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
